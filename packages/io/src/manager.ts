import type { SessionSnapshot, LiveTurnState, SummaryConfig } from "@kno-lens/view";
import { SessionController } from "@kno-lens/view";
import { discoverAllSessions, filterActiveSessions } from "./discovery.js";
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
  /**
   * How recently (ms) the session file must have been modified for
   * live state to be shown after catch-up read. If the file is older
   * than this, any open turn from the initial read is treated as stale
   * and live state is suppressed until new writes arrive. Default: 30000.
   */
  liveRecencyMs?: number | undefined;
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
  private liveRecencyMs: number;

  /**
   * Whether the session file has received new writes since the initial
   * catch-up read completed. Until this is true, live state from the
   * catch-up is suppressed if the file mtime is older than liveRecencyMs.
   */
  private receivedPostCatchUp = false;

  /** True while the initial catch-up read is in progress. */
  private catchingUp = true;

  readonly sessionInfo: SessionInfo;

  constructor(sessionInfo: SessionInfo, options?: SessionManagerOptions) {
    super();
    this.sessionInfo = sessionInfo;
    this.throttleMs = options?.throttleMs ?? 50;
    this.liveRecencyMs = options?.liveRecencyMs ?? 30_000;
    this.controller = new SessionController(options?.summaryConfig);
    this.tailer = new SessionTailer(sessionInfo.path);
  }

  /**
   * Discover sessions for a workspace path.
   * Convenience wrapper around discovery functions.
   */
  static async discover(
    workspacePath: string,
    options?: { activeThresholdMs?: number; maxSessions?: number },
  ): Promise<{ all: SessionInfo[]; active: SessionInfo[] }> {
    const all = await discoverAllSessions(workspacePath, options?.maxSessions);
    const active = filterActiveSessions(all, options?.activeThresholdMs);
    return { all, active };
  }

  /** Start tailing the session file. */
  async start(): Promise<void> {
    this.tailer.on("events", (events) => {
      // Events arriving after catch-up are from real file writes
      if (!this.catchingUp) {
        this.receivedPostCatchUp = true;
      }

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
    this.catchingUp = false;

    // After catch-up, determine if the session file is recent enough
    // for its live state to be trustworthy. If the file is stale,
    // any open turn from the log is leftover — not actually running.
    const fileAge = Date.now() - this.sessionInfo.modifiedAt.getTime();
    if (fileAge > this.liveRecencyMs) {
      this.receivedPostCatchUp = false;
    } else {
      // File is recent — trust the live state from catch-up
      this.receivedPostCatchUp = true;
    }

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
      live: this.effectiveLive,
    };
  }

  /**
   * Returns live state only if we trust it — suppressed when the
   * session file is stale and no new writes have arrived since catch-up.
   */
  private get effectiveLive(): LiveTurnState | null {
    const live = this.controller.liveState ?? null;
    if (!live) return null;
    // Suppress stale live state from catch-up until real writes arrive
    return this.receivedPostCatchUp ? live : null;
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
      live: this.effectiveLive,
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
      live: this.effectiveLive,
    });
  }
}
