import type { SessionEvent, SessionMeta, TurnTokenUsage } from "./parsing/events.js";
import type { Session, SessionStats, SessionStatus, Turn } from "./session.js";

// ─── Limits ──────────────────────────────────────────────────────────────
// Configurable caps to ensure no part of the model grows unboundedly.
// Stats counters continue to accumulate regardless of limits — only the
// arrays (turns, steps, file paths) are capped.

export interface AssemblyLimits {
  /** Maximum turns retained in the turns array. When exceeded, the
   *  oldest turn is dropped. Stats still reflect all turns. */
  maxTurns: number;
  /** Maximum steps retained per turn. New steps are dropped once the
   *  limit is reached, but activity_end still updates existing steps. */
  maxStepsPerTurn: number;
  /** Maximum unique file paths tracked across filesRead + filesWritten.
   *  Once hit, new paths are not added but commandsRun/errorCount still count. */
  maxTrackedFiles: number;
}

export const DEFAULT_ASSEMBLY_LIMITS: AssemblyLimits = {
  maxTurns: 500,
  maxStepsPerTurn: 1000,
  maxTrackedFiles: 2000,
};

// ─── SessionBuilder ──────────────────────────────────────────────────────

/**
 * Incrementally assembles a `Session` from a stream of `SessionEvent` values.
 *
 * Supports both consumption modes:
 * - **Live**: call `push(event)` as events arrive, call `snapshot()` to
 *   get the current `Session` at any point.
 * - **Batch**: use the static `SessionBuilder.from(events)` convenience.
 *
 * @example
 *   // Live — feed events as they arrive
 *   const builder = new SessionBuilder();
 *   builder.push(event);
 *   const session = builder.snapshot();
 *
 *   // Batch — from a collected event array
 *   const session = SessionBuilder.from(events);
 */
export class SessionBuilder {
  private limits: AssemblyLimits;
  private meta: SessionMeta | undefined;
  private endedAt: string | undefined;
  private turns: Turn[] = [];
  private currentTurn: Turn | undefined;
  private totalTurnsStarted = 0;

  // Stats accumulators — grow regardless of limits.
  // Token/cost/duration are accumulated on turn_end so they survive turn eviction.
  private filesRead = new Set<string>();
  private filesWritten = new Set<string>();
  private fileTrackingCapped = false;
  private commandsRun = 0;
  private filesDeleted = 0;
  private errorCount = 0;
  private completedTurns = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCacheReadTokens = 0;
  private totalCacheCreationTokens = 0;
  private estimatedCostUsd = 0;
  private activeDurationMs = 0;

  constructor(limits?: Partial<AssemblyLimits>) {
    this.limits = { ...DEFAULT_ASSEMBLY_LIMITS, ...limits };
  }

  /** Whether a session_start event has been received and snapshot() can be called. */
  get isReady(): boolean {
    return this.meta != null;
  }

  /** Feed a single event into the builder. */
  push(event: SessionEvent): void {
    switch (event.type) {
      case "session_start":
        this.meta = event.meta;
        break;

      case "turn_start": {
        this.totalTurnsStarted++;
        this.currentTurn = {
          id: event.turnId,
          status: "active",
          prompt: event.prompt,
          hasAttachments: event.hasAttachments,
          steps: [],
          startedAt: event.at,
          tokenUsage: emptyTokenUsage(),
          errorCount: 0,
        };
        this.turns.push(this.currentTurn);
        if (this.turns.length > this.limits.maxTurns) {
          this.turns.shift();
        }
        break;
      }

      case "text_output":
        if (this.currentTurn && this.currentTurn.steps.length < this.limits.maxStepsPerTurn) {
          this.currentTurn.steps.push({
            kind: "text",
            text: event.text,
            at: event.at,
          });
        }
        break;

      case "thinking":
        if (this.currentTurn && this.currentTurn.steps.length < this.limits.maxStepsPerTurn) {
          this.currentTurn.steps.push({
            kind: "thinking",
            excerpt: event.excerpt,
            at: event.at,
          });
        }
        break;

      case "activity_start":
        if (this.currentTurn && this.currentTurn.steps.length < this.limits.maxStepsPerTurn) {
          this.currentTurn.steps.push({
            kind: "activity",
            activity: event.activity,
          });
        }
        break;

      case "activity_end": {
        // Always update the matching step, even if step limit was hit after
        // the activity_start was added — we want completed state on existing steps.
        if (this.currentTurn) {
          const stepIdx = this.currentTurn.steps.findIndex(
            (s) => s.kind === "activity" && s.activity.id === event.activityId,
          );
          if (stepIdx >= 0) {
            this.currentTurn.steps[stepIdx] = { kind: "activity", activity: event.activity };
          }
        }

        // Accumulate stats from completed activities
        const act = event.activity;
        if (act.status === "error") this.errorCount++;
        if (act.kind === "bash") {
          this.commandsRun++;
          if (BASH_DELETE_PATTERN.test(act.command)) this.filesDeleted++;
        }

        if (!this.fileTrackingCapped) {
          switch (act.kind) {
            case "file_read":
              this.filesRead.add(act.path);
              break;
            case "file_write":
            case "file_edit":
              this.filesWritten.add(act.path);
              break;
          }
          if (this.filesRead.size + this.filesWritten.size >= this.limits.maxTrackedFiles) {
            this.fileTrackingCapped = true;
          }
        }
        break;
      }

      case "turn_end":
        if (this.currentTurn) {
          this.currentTurn.endedAt = event.endedAt;
          this.currentTurn.durationMs = event.durationMs;
          this.currentTurn.tokenUsage = event.tokens;
          this.currentTurn.errorCount = countTurnErrors(this.currentTurn);
          this.currentTurn.status = this.currentTurn.errorCount > 0 ? "error" : "done";
        }
        // Accumulate stats here so they survive turn eviction
        this.completedTurns++;
        this.totalInputTokens += event.tokens.inputTokens;
        this.totalOutputTokens += event.tokens.outputTokens;
        this.totalCacheReadTokens += event.tokens.cacheReadTokens;
        this.totalCacheCreationTokens += event.tokens.cacheCreationTokens;
        this.estimatedCostUsd += event.tokens.estimatedCostUsd ?? 0;
        this.activeDurationMs += event.durationMs ?? 0;
        break;

      case "turn_duration":
        // Arrives after turn_end when end_turn closed the turn before
        // the system/turn_duration record was written. Update the turn
        // and accumulate into stats.
        if (this.currentTurn && this.currentTurn.id === event.turnId) {
          this.currentTurn.durationMs = event.durationMs;
        } else {
          // Turn may have been evicted — find it
          const t = this.turns.find((t) => t.id === event.turnId);
          if (t) t.durationMs = event.durationMs;
        }
        this.activeDurationMs += event.durationMs;
        break;

      case "session_end":
        this.endedAt = event.endedAt;
        break;
    }
  }

  /** Return a point-in-time `Session` reflecting all events pushed so far. */
  snapshot(): Session {
    if (!this.meta) {
      throw new Error("No session_start event received");
    }

    // Snapshot turns — recompute errorCount for any still-active turn
    const turns = this.turns.map((turn) => {
      if (turn.status === "active") {
        return { ...turn, errorCount: countTurnErrors(turn) };
      }
      return { ...turn };
    });

    const status: SessionStatus = this.endedAt != null ? "ended" : "active";
    const stats = this.computeStats();

    return { meta: this.meta, status, endedAt: this.endedAt, turns, stats };
  }

  /** Batch convenience: build a `Session` from a complete event array. */
  static from(events: SessionEvent[], limits?: Partial<AssemblyLimits>): Session {
    const builder = new SessionBuilder(limits);
    for (const event of events) builder.push(event);
    return builder.snapshot();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private computeStats(): SessionStats {
    // Wall-clock duration: simple subtraction of two timestamps from the log.
    let wallClockDurationMs: number | undefined;
    if (this.endedAt && this.meta) {
      const start = new Date(this.meta.startedAt).getTime();
      const end = new Date(this.endedAt).getTime();
      if (!isNaN(start) && !isNaN(end)) {
        wallClockDurationMs = end - start;
      }
    }

    return {
      totalTurns: this.totalTurnsStarted,
      completedTurns: this.completedTurns,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCacheReadTokens: this.totalCacheReadTokens,
      totalCacheCreationTokens: this.totalCacheCreationTokens,
      estimatedCostUsd: this.estimatedCostUsd,
      activeDurationMs: this.activeDurationMs,
      wallClockDurationMs,
      filesRead: [...this.filesRead],
      filesWritten: [...this.filesWritten],
      commandsRun: this.commandsRun,
      filesDeleted: this.filesDeleted,
      errorCount: this.errorCount,
    };
  }
}

/** Matches common file-deletion commands in bash.
 *  Exported so the view summarizer can use the same pattern. */
export const BASH_DELETE_PATTERN =
  /(?:^|[;&|]\s*)(?:rm|git\s+rm|rimraf|unlink|del|erase|Remove-Item|ri)\b/;

// ─── Utilities ───────────────────────────────────────────────────────────

function emptyTokenUsage(): TurnTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    models: [],
  };
}

function countTurnErrors(turn: Turn): number {
  let count = 0;
  for (const step of turn.steps) {
    if (step.kind === "activity" && step.activity.status === "error") {
      count++;
    }
  }
  return count;
}
