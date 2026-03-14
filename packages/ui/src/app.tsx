import { useState, useEffect, useMemo, useRef, useCallback } from "preact/hooks";
import type { SessionSnapshot, LiveTurnState, SummaryConfig } from "@kno-lens/view";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import { getFilter } from "./filter.js";
import type { CategoryFilter } from "./filter.js";
import { searchSnapshot } from "./search.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { SessionHeader } from "./components/SessionHeader.js";
import { Toolbar } from "./components/Toolbar.js";
import { LiveIndicator } from "./components/LiveIndicator.js";
import { TurnList } from "./components/TurnList.js";

// ─── Props-based App (used by harness and tests) ────────────────

export interface AppProps {
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

const SEARCH_DEBOUNCE_MS = 150;

export function App({ snapshot, live, onDrillDown, onOpenFile, onShowDiff }: AppProps) {
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search to avoid O(n) on every keystroke
  useEffect(() => {
    if (debounceTimer.current != null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current != null) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  if (!snapshot) {
    return <div class="empty-state">No session loaded</div>;
  }

  if (!isValidSnapshot(snapshot)) {
    return <div class="empty-state">Invalid session data</div>;
  }

  // Derive the effective category filter
  const categoryFilter: CategoryFilter | null = activeFilterId
    ? ((getFilter(activeFilterId) as CategoryFilter | undefined) ?? null)
    : null;

  const effectiveSearch = debouncedSearch;

  const searchResults = useMemo(
    () => searchSnapshot(snapshot, effectiveSearch),
    [snapshot, effectiveSearch],
  );

  // Derive deleted count from turn summaries
  const deletedCount = useMemo(() => {
    let count = 0;
    for (const summary of Object.values(snapshot.summaries)) {
      count += summary.stats.filesDeleted;
    }
    return count;
  }, [snapshot.summaries]);

  // If the live turn already has a summary, it's completed — don't show it as live.
  // This handles the gap between snapshot updating and the next live state message.
  const liveTurnDone = live?.turnId != null && snapshot.summaries[live.turnId] != null;
  const effectiveLive = liveTurnDone ? null : live;

  const handleHeaderFilter = useCallback((filterGroup: string) => {
    const id = `cat:${filterGroup}`;
    setActiveFilterId((prev) => {
      const toggling = prev === id;
      if (!toggling) setSearchQuery("");
      return toggling ? null : id;
    });
  }, []);

  const handleFilterChange = useCallback((id: string | null) => {
    setActiveFilterId(id);
    setSearchQuery("");
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveFilterId(null);
  }, []);

  return (
    <ErrorBoundary>
      <SessionHeader
        session={snapshot.session}
        deletedCount={deletedCount}
        onFilter={handleHeaderFilter}
      />
      <Toolbar
        activeFilter={activeFilterId}
        onFilterChange={handleFilterChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />
      <LiveIndicator live={effectiveLive} />
      <TurnList
        snapshot={snapshot}
        onDrillDown={onDrillDown}
        onOpenFile={onOpenFile}
        onShowDiff={onShowDiff}
        activeFilter={categoryFilter}
        searchQuery={effectiveSearch.trim() ? effectiveSearch : undefined}
        searchResults={effectiveSearch.trim() ? searchResults : null}
        liveTurnId={effectiveLive?.turnId ?? null}
      />
    </ErrorBoundary>
  );
}

// ─── WebviewApp (used inside VS Code webview) ───────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
};

// VS Code docs: acquireVsCodeApi() must only be called once.
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

export function WebviewApp() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState<LiveTurnState | null>(null);
  const [config, setConfig] = useState<SummaryConfig>(DEFAULT_SUMMARY_CONFIG);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
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
          setConfig(msg.data);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
    <App
      snapshot={snapshot}
      live={live}
      config={config}
      onDrillDown={onDrillDown}
      onOpenFile={onOpenFile}
      onShowDiff={onShowDiff}
    />
  );
}
