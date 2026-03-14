import type { SessionSnapshot, LiveTurnState, SummaryConfig } from "@kno-lens/view";
import { SessionController } from "@kno-lens/view";
import { discoverSessions, filterActiveSessions } from "./discovery.js";
import type { SessionInfo } from "./discovery.js";
import { SessionTailer } from "./tailer.js";
import { EventEmitter } from "events";

// ─── Types ──────────────────────────────────────────────────────────────

export interface SessionManagerEvents {
  /** Emitted whenever the session state changes (new events processed). */
  update: [SessionManagerState];
  /** Emitted on errors (non-fatal — manager continues running). */
  error: [Error];
  /** Emitted when the tailer reaches end of file on initial read. */
  ready: [];
  /** Emitted when the session ends (session_end event received). */
  "session-end": [];
}

export interface SessionManagerState {
  snapshot: SessionSnapshot | null;
  live: LiveTurnState | null;
}

export interface SessionManagerOptions {
  /** Summary config overrides. */
  summaryConfig?: Partial<SummaryConfig> | undefined;
  /** Throttle interval for update emissions (ms). Default: 50. */
  throttleMs?: number | undefined;
}

// ─── SessionManager ──────────────────────────────────────────────────────

/**
 * High-level manager that connects discovery → tailing → controller.
 *
 * Usage:
 * 1. Discover sessions with `SessionManager.discover(workspacePath)`
 * 2. Create a manager with `new SessionManager(sessionInfo, options)`
 * 3. Listen for "update" events
 * 4. Call `start()` to begin tailing
 * 5. Call `stop()` to clean up
 */
export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private controller: SessionController;
  private tailer: SessionTailer;
  private throttleMs: number;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdate = false;
  private stopped = false;

  readonly sessionInfo: SessionInfo;

  constructor(sessionInfo: SessionInfo, options?: SessionManagerOptions) {
    super();
    this.sessionInfo = sessionInfo;
    this.throttleMs = options?.throttleMs ?? 50;
    this.controller = new SessionController(options?.summaryConfig);
    this.tailer = new SessionTailer(sessionInfo.path);
  }

  /**
   * Discover sessions for a workspace path.
   * Convenience wrapper around discovery functions.
   */
  static async discover(
    workspacePath: string,
    options?: { activeThresholdMs?: number },
  ): Promise<{ all: SessionInfo[]; active: SessionInfo[] }> {
    const all = await discoverSessions(workspacePath);
    const active = filterActiveSessions(all, options?.activeThresholdMs);
    return { all, active };
  }

  /** Start tailing the session file. */
  async start(): Promise<void> {
    this.tailer.on("events", (events) => {
      for (const event of events) {
        this.controller.onEvent(event);

        if (event.type === "session_end") {
          this.emit("session-end");
        }
      }
      this.scheduleUpdate();
    });

    this.tailer.on("error", (err) => {
      this.emit("error", err);
    });

    await this.tailer.start();
    // Flush any accumulated state from initial read
    this.flushUpdate();
    this.emit("ready");
  }

  /** Stop tailing and clean up. */
  stop(): void {
    this.stopped = true;
    this.tailer.stop();
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    // Force flush — stopped flag is set but we still want the final state out.
    // flushUpdate checks !stopped via scheduleUpdate, but here we call it
    // directly so it only checks pendingUpdate + isReady.
    this.forceFlush();
  }

  /** Get current state on demand. */
  get state(): SessionManagerState {
    if (!this.controller.isReady) {
      return { snapshot: null, live: null };
    }
    return {
      snapshot: this.controller.exportState(),
      live: this.controller.liveState ?? null,
    };
  }

  // ─── Throttled updates ──────────────────────────────────────────────

  private scheduleUpdate(): void {
    this.pendingUpdate = true;
    if (this.throttleTimer || this.stopped) return;

    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.flushUpdate();
    }, this.throttleMs);
  }

  private flushUpdate(): void {
    if (!this.pendingUpdate || !this.controller.isReady) return;
    this.pendingUpdate = false;

    this.emit("update", {
      snapshot: this.controller.exportState(),
      live: this.controller.liveState ?? null,
    });
  }

  /** Flush even after stopped — used by stop() to emit final state. */
  private forceFlush(): void {
    if (!this.controller.isReady) return;
    // Always emit final state regardless of pendingUpdate flag,
    // because tailer.stop() may have produced parser.end() events
    // that the controller just processed.
    this.pendingUpdate = false;
    this.emit("update", {
      snapshot: this.controller.exportState(),
      live: this.controller.liveState ?? null,
    });
  }
}
