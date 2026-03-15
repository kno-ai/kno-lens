import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import { ExplorerHeader } from "./ExplorerHeader.js";
import { Timeline } from "./Timeline.js";
import { Heatmap } from "./Heatmap.js";

export type ExplorerMode = "timeline" | "heatmap";

export interface ExplorerContext {
  turnId?: number | undefined;
  fileFilter?: string | undefined;
}

// ─── Props-based ExplorerApp ─────────────────────────────────────

export interface ExplorerAppProps {
  snapshot: SessionSnapshot | null;
  live?: LiveTurnState | null | undefined;
  context?: ExplorerContext | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  onDrillDown?: ((activityId: string) => void) | undefined;
}

export function ExplorerApp({
  snapshot,
  live,
  context,
  onOpenFile,
  onShowDiff,
  onDrillDown,
}: ExplorerAppProps) {
  const [mode, setMode] = useState<ExplorerMode>(() => {
    if (context?.fileFilter) return "heatmap";
    return "timeline";
  });
  const [selectedTurnId, setSelectedTurnId] = useState<number | null>(context?.turnId ?? null);
  // Track whether the user has manually selected a different turn
  const userSelectedRef = useRef(false);

  // Auto-select the active turn when a new turn starts,
  // unless the user has manually selected something else
  const liveTurnId = live?.turnId ?? null;
  const prevLiveTurnId = useRef<number | null>(null);

  useEffect(() => {
    if (liveTurnId != null && liveTurnId !== prevLiveTurnId.current) {
      // New turn started
      if (!userSelectedRef.current) {
        setSelectedTurnId(liveTurnId);
      }
      prevLiveTurnId.current = liveTurnId;
    } else if (liveTurnId == null && prevLiveTurnId.current != null) {
      // Turn ended — keep showing it
      prevLiveTurnId.current = null;
      userSelectedRef.current = false;
    }
  }, [liveTurnId]);

  const handleSelectTurn = useCallback(
    (turnId: number | null) => {
      setSelectedTurnId(turnId);
      // If user selects a different turn than the active one, mark as manual
      userSelectedRef.current = turnId != null && turnId !== liveTurnId;
    },
    [liveTurnId],
  );

  const handleFindActive = useCallback(() => {
    if (liveTurnId != null) {
      setSelectedTurnId(liveTurnId);
      userSelectedRef.current = false;
    }
  }, [liveTurnId]);

  // Apply context when it changes
  useEffect(() => {
    if (context?.turnId != null) {
      setMode("timeline");
      setSelectedTurnId(context.turnId);
    } else if (context?.fileFilter) {
      setMode("heatmap");
    }
  }, [context]);

  const handleNavigateToTurn = useCallback((turnId: number) => {
    setMode("timeline");
    setSelectedTurnId(turnId);
  }, []);

  if (!snapshot) {
    return (
      <div class="explorer">
        <div class="explorer__empty">No session loaded</div>
      </div>
    );
  }

  return (
    <div class="explorer">
      <ExplorerHeader
        session={snapshot.session}
        mode={mode}
        onModeChange={setMode}
        onFindActive={liveTurnId != null ? handleFindActive : undefined}
      />
      <div class="explorer__content">
        {mode === "timeline" && (
          <Timeline
            snapshot={snapshot}
            live={live ?? null}
            selectedTurnId={selectedTurnId}
            onSelectTurn={handleSelectTurn}
            onOpenFile={onOpenFile}
            onShowDiff={onShowDiff}
            onDrillDown={onDrillDown}
          />
        )}
        {mode === "heatmap" && (
          <Heatmap
            snapshot={snapshot}
            fileFilter={context?.fileFilter}
            onNavigateToTurn={handleNavigateToTurn}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  );
}

// ─── WebviewApp wrapper for VS Code ──────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
};

let _vscode: ReturnType<typeof acquireVsCodeApi> | undefined;
function getVsCodeApi(): ReturnType<typeof acquireVsCodeApi> | undefined {
  if (_vscode) return _vscode;
  try {
    _vscode = acquireVsCodeApi();
  } catch {
    // Not in VS Code webview
  }
  return _vscode;
}

export function ExplorerWebviewApp() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState<LiveTurnState | null>(null);
  const [context, setContext] = useState<ExplorerContext | undefined>();

  useEffect(() => {
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSnapshot: SessionSnapshot | null = null;

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg.type !== "string") return;
      switch (msg.type) {
        case "snapshot":
          // Throttle snapshot updates to avoid rapid re-renders
          pendingSnapshot = msg.data;
          if (!snapshotTimer) {
            snapshotTimer = setTimeout(() => {
              snapshotTimer = null;
              if (pendingSnapshot) {
                setSnapshot(pendingSnapshot);
                pendingSnapshot = null;
              }
            }, 200);
          }
          break;
        case "live":
          setLive(msg.data);
          break;
        case "explorer-context":
          setContext(msg.data);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (snapshotTimer) clearTimeout(snapshotTimer);
    };
  }, []);

  const vscode = getVsCodeApi();

  const onOpenFile = useCallback(
    (path: string) => vscode?.postMessage({ type: "open-file", path }),
    [vscode],
  );
  const onShowDiff = useCallback(
    (activityId: string) => vscode?.postMessage({ type: "show-diff", activityId }),
    [vscode],
  );
  const onDrillDown = useCallback(
    (activityId: string) => vscode?.postMessage({ type: "drill-down", activityId }),
    [vscode],
  );

  return (
    <ExplorerApp
      snapshot={snapshot}
      live={live}
      context={context}
      onOpenFile={onOpenFile}
      onShowDiff={onShowDiff}
      onDrillDown={onDrillDown}
    />
  );
}
