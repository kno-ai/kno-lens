import { useState, useEffect, useCallback } from "preact/hooks";
import type { SessionSnapshot, LiveTurnState, SummaryConfig } from "@kno-lens/view";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { SessionHeader } from "./SessionHeader.js";
import { TurnList } from "./TurnList.js";

// ─── Props-based App (used by harness and tests) ────────────────

export interface LensAppProps {
  snapshot: SessionSnapshot | null;
  live: LiveTurnState | null;
  config: SummaryConfig;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
}

/** Minimal runtime check that a snapshot has the shape we need to render. */
function isValidSnapshot(s: unknown): s is SessionSnapshot {
  if (!s || typeof s !== "object") return false;
  const snap = s as Record<string, unknown>;
  if (!snap.session || typeof snap.session !== "object") return false;
  const session = snap.session as Record<string, unknown>;
  return (
    session.meta != null &&
    typeof session.status === "string" &&
    Array.isArray(session.turns) &&
    session.stats != null &&
    snap.summaries != null &&
    typeof snap.summaries === "object"
  );
}

export function LensApp({ snapshot, live, onDrillDown, onOpenFile, onShowDiff }: LensAppProps) {
  if (!snapshot) {
    return <div class="empty-state">No session loaded</div>;
  }

  if (!isValidSnapshot(snapshot)) {
    return <div class="empty-state">Invalid session data</div>;
  }

  // If the live turn already has a summary, it's completed — don't show it as live.
  const liveTurnDone = live?.turnId != null && snapshot.summaries[live.turnId] != null;
  const effectiveLive = liveTurnDone ? null : live;

  return (
    <ErrorBoundary>
      <SessionHeader session={snapshot.session} isLive={effectiveLive?.turnId != null} />
      <TurnList
        snapshot={snapshot}
        live={effectiveLive}
        onDrillDown={onDrillDown}
        onOpenFile={onOpenFile}
        onShowDiff={onShowDiff}
      />
    </ErrorBoundary>
  );
}

// ─── WebviewApp (used inside VS Code webview) ───────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
};

let _vscode: ReturnType<typeof acquireVsCodeApi> | undefined;
function getVsCodeApi(): ReturnType<typeof acquireVsCodeApi> | undefined {
  if (_vscode) return _vscode;
  try {
    _vscode = acquireVsCodeApi();
  } catch {
    // Not in VS Code webview (e.g., dev harness)
  }
  return _vscode;
}

export function LensWebviewApp() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState<LiveTurnState | null>(null);
  const [config, setConfig] = useState<SummaryConfig>(DEFAULT_SUMMARY_CONFIG);

  const handler = useCallback((e: MessageEvent) => {
    const msg = e.data;
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "snapshot":
        setSnapshot(msg.data);
        break;
      case "live":
        setLive(msg.data);
        break;
      case "config":
        setConfig((prev) => ({ ...prev, ...msg.data }));
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [handler]);

  const vscode = getVsCodeApi();

  const onDrillDown = useCallback(
    (activityId: string) => {
      vscode?.postMessage({ type: "drill-down", activityId });
    },
    [vscode],
  );

  const onOpenFile = useCallback(
    (path: string) => {
      vscode?.postMessage({ type: "open-file", path });
    },
    [vscode],
  );

  const onShowDiff = useCallback(
    (activityId: string) => {
      vscode?.postMessage({ type: "show-diff", activityId });
    },
    [vscode],
  );

  return (
    <LensApp
      snapshot={snapshot}
      live={live}
      config={config}
      onDrillDown={onDrillDown}
      onOpenFile={onOpenFile}
      onShowDiff={onShowDiff}
    />
  );
}
