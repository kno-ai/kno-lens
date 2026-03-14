import type { Session, SessionEvent } from "@kno-lens/core";
import { SessionBuilder } from "@kno-lens/core";
import { LiveTurnModel } from "../live/LiveTurnModel.js";
import type { LiveTurnState } from "../live/types.js";
import type { SummaryConfig } from "../summary/config.js";
import { DEFAULT_SUMMARY_CONFIG } from "../summary/config.js";
import { summarizeTurn } from "../summary/summarize.js";
import type { TurnSummary } from "../summary/types.js";
import type { SessionSnapshot } from "./snapshot.js";
import { SUMMARY_ALGORITHM_VERSION } from "./snapshot.js";

export class SessionController {
  private builder: SessionBuilder | null;
  private liveTurn: LiveTurnModel;
  private turnSummaries = new Map<number, TurnSummary>();
  private summaryConfig: SummaryConfig;
  private cachedSnapshot: Session | null = null;
  private snapshotDirty = true;
  private _isReady = false;

  constructor(config?: Partial<SummaryConfig>) {
    this.builder = new SessionBuilder();
    this.liveTurn = new LiveTurnModel();
    this.summaryConfig = { ...DEFAULT_SUMMARY_CONFIG, ...config };
  }

  /** Feed a single event. This is the only input method. */
  onEvent(event: SessionEvent): void {
    if (!this.builder) {
      throw new Error(
        "Cannot call onEvent on a controller restored from snapshot. " +
          "Create a fresh controller and parse from the source file.",
      );
    }

    this.builder.push(event);
    this.liveTurn.update(event);
    this.snapshotDirty = true;

    if (event.type === "session_start") {
      this._isReady = true;
    }

    if (event.type === "turn_end" && this._isReady) {
      const session = this.snapshot();
      const turn = session.turns.find((t) => t.id === event.turnId);
      if (turn) {
        this.turnSummaries.set(event.turnId, summarizeTurn(turn, this.summaryConfig));
      }

      // Evict summaries for turns the builder has dropped
      if (this.turnSummaries.size > session.turns.length) {
        const activeTurnIds = new Set(session.turns.map((t) => t.id));
        for (const id of this.turnSummaries.keys()) {
          if (!activeTurnIds.has(id)) {
            this.turnSummaries.delete(id);
          }
        }
      }
    }
  }

  /** Whether the controller has session data and can produce snapshots. */
  get isReady(): boolean {
    return this._isReady;
  }

  /** Current live turn state, or null if no turn in progress. */
  get liveState(): Readonly<LiveTurnState> | null {
    const state = this.liveTurn.current;
    return state.turnId != null ? state : null;
  }

  /** Completed turn summaries, keyed by turn ID. */
  get summaries(): ReadonlyMap<number, TurnSummary> {
    return this.turnSummaries;
  }

  /** Full session state. Cached — only rebuilds when dirty. */
  snapshot(): Session {
    if (this.snapshotDirty || !this.cachedSnapshot) {
      if (!this.builder) {
        throw new Error("No session data available");
      }
      this.cachedSnapshot = this.builder.snapshot();
      this.snapshotDirty = false;
    }
    return this.cachedSnapshot;
  }

  /** Update summary config. Re-summarizes all completed turns. */
  updateConfig(config: Partial<SummaryConfig>): void {
    this.summaryConfig = { ...this.summaryConfig, ...config };
    if (!this._isReady) return;
    const session = this.snapshot();
    for (const turn of session.turns) {
      if (turn.status !== "active") {
        this.turnSummaries.set(turn.id, summarizeTurn(turn, this.summaryConfig));
      }
    }
  }

  /** Export state for persistence and rendering. Respects maxVisibleTurns. */
  exportState(): SessionSnapshot {
    const session = this.snapshot();
    const max = this.summaryConfig.maxVisibleTurns;
    const turns = session.turns.length > max ? session.turns.slice(-max) : session.turns;

    const visibleTurnIds = new Set(turns.map((t) => t.id));
    const summaries: Record<number, TurnSummary> = {};
    for (const [id, summary] of this.turnSummaries) {
      if (visibleTurnIds.has(id)) {
        summaries[id] = summary;
      }
    }

    return {
      session: { ...session, turns },
      summaries,
      summaryConfigVersion: SUMMARY_ALGORITHM_VERSION,
    };
  }

  /**
   * Restore a read-only controller from persisted state.
   *
   * The returned controller can render snapshots and summaries but cannot
   * accept new events via onEvent(). For active sessions, create a fresh
   * controller and parse from the JSONL source instead.
   */
  static fromSnapshot(
    data: SessionSnapshot,
    config?: Partial<SummaryConfig>,
  ): { controller: SessionController; stale: boolean } {
    const stale = data.summaryConfigVersion !== SUMMARY_ALGORITHM_VERSION;

    const controller = new SessionController(config);

    // No builder needed — this controller is read-only.
    controller.builder = null;
    controller._isReady = true;
    controller.cachedSnapshot = data.session;
    controller.snapshotDirty = false;

    if (stale) {
      // Re-summarize all turns with current algorithm
      for (const turn of data.session.turns) {
        if (turn.status !== "active") {
          controller.turnSummaries.set(turn.id, summarizeTurn(turn, controller.summaryConfig));
        }
      }
    } else {
      // Restore persisted summaries
      for (const [id, summary] of Object.entries(data.summaries)) {
        controller.turnSummaries.set(Number(id), summary);
      }
    }

    return { controller, stale };
  }
}
