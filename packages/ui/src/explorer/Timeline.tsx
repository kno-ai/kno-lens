import { useState, useEffect, useRef, useCallback, useMemo } from "preact/hooks";
import type {
  SessionSnapshot,
  TurnSummary,
  TurnDisplayCounts,
  LiveTurnState,
} from "@kno-lens/view";
import { formatTokensCompact, formatDurationShort } from "../utils.js";
import { TurnDetail } from "../shared/TurnDetail.js";

interface TimelineProps {
  snapshot: SessionSnapshot;
  live: LiveTurnState | null;
  selectedTurnId: number | null;
  onSelectTurn: (turnId: number | null) => void;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  onDrillDown?: ((activityId: string) => void) | undefined;
}

type Turn = SessionSnapshot["session"]["turns"][number];

// ─── Data ─────────────────────────────────────────────────────────

/** Use pre-computed display counts from the view layer. */
function getCounts(summary: TurnSummary | undefined, turn: Turn): TurnDisplayCounts {
  if (summary) return summary.counts;
  // Fallback for unsummarized turns (active/live) — compute minimally
  const tokens = (turn.tokenUsage.inputTokens ?? 0) + (turn.tokenUsage.outputTokens ?? 0);
  let edits = 0;
  let cmds = 0;
  for (const step of turn.steps) {
    if (step.kind === "activity") {
      const k = step.activity.kind;
      if (k === "file_edit" || k === "file_write") edits++;
      else if (k === "bash") cmds++;
    }
  }
  return {
    edits,
    deletes: 0,
    commands: cmds,
    errors: turn.errorCount,
    reads: 0,
    searches: 0,
    tokens,
    durationMs: turn.durationMs ?? 0,
  };
}

function computeMaxCounts(rows: TurnRow[]) {
  let maxEdits = 0;
  let maxDeletes = 0;
  let maxCommands = 0;
  let maxErrors = 0;
  let maxTokens = 0;
  for (const r of rows) {
    maxEdits = Math.max(maxEdits, r.counts.edits);
    maxDeletes = Math.max(maxDeletes, r.counts.deletes);
    maxCommands = Math.max(maxCommands, r.counts.commands);
    maxErrors = Math.max(maxErrors, r.counts.errors);
    maxTokens = Math.max(maxTokens, r.counts.tokens);
  }
  return { maxEdits, maxDeletes, maxCommands, maxErrors, maxTokens };
}

function intensity(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(0.9, (count / max) * 0.9);
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function formatTimeFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── Search ───────────────────────────────────────────────────────

interface SearchMatch {
  source: string; // "prompt" | "response" | "activity"
  text: string;
}

/** Search across prompt, response, and activity labels/details. */
function searchTurnRow(row: TurnRow, query: string): SearchMatch | null {
  const q = query.toLowerCase();
  const promptIdx = row.prompt.toLowerCase().indexOf(q);
  if (promptIdx >= 0) return { source: "prompt", text: row.prompt };

  if (row.summary?.response) {
    if (row.summary.response.toLowerCase().includes(q)) {
      return { source: "response", text: row.summary.response };
    }
  }

  if (row.summary) {
    for (const item of row.summary.items) {
      if (item.label.toLowerCase().includes(q)) {
        return { source: "activity", text: item.label };
      }
      if (item.detail?.toLowerCase().includes(q)) {
        return { source: "activity", text: item.detail };
      }
      if (item.filePath?.toLowerCase().includes(q)) {
        return { source: "file", text: item.filePath };
      }
    }
  }

  return null;
}

// ─── Sort ─────────────────────────────────────────────────────────

type SortKey = "id" | "edits" | "deletes" | "commands" | "errors" | "duration" | "tokens";
type SortDir = "asc" | "desc";

interface TurnRow {
  turn: Turn;
  prompt: string;
  summary: TurnSummary | undefined;
  counts: TurnDisplayCounts;
}

function sortRows(rows: TurnRow[], key: SortKey, dir: SortDir): TurnRow[] {
  const sorted = [...rows];
  const mul = dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    let av: number;
    let bv: number;
    switch (key) {
      case "id":
        av = a.turn.id;
        bv = b.turn.id;
        break;
      case "edits":
        av = a.counts.edits;
        bv = b.counts.edits;
        break;
      case "deletes":
        av = a.counts.deletes;
        bv = b.counts.deletes;
        break;
      case "commands":
        av = a.counts.commands;
        bv = b.counts.commands;
        break;
      case "errors":
        av = a.counts.errors;
        bv = b.counts.errors;
        break;
      case "duration":
        av = a.counts.durationMs;
        bv = b.counts.durationMs;
        break;
      case "tokens":
        av = a.counts.tokens;
        bv = b.counts.tokens;
        break;
    }
    return (av - bv) * mul;
  });
  return sorted;
}

// ─── Component ────────────────────────────────────────────────────

export function Timeline({
  snapshot,
  live,
  selectedTurnId,
  onSelectTurn,
  onOpenFile,
  onShowDiff,
  onDrillDown,
}: TimelineProps) {
  const liveTurnId = live?.turnId ?? null;
  const [hoveredTurnId, setHoveredTurnId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detailWidth, setDetailWidth] = useState(320);
  const [promptWidth, setPromptWidth] = useState<number | null>(null); // null = fill available space
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedTurnId]);

  const allRows: TurnRow[] = useMemo(() => {
    // Deduplicate by turn ID as a safety measure against snapshot races
    const seen = new Set<number>();
    const rows: TurnRow[] = [];
    for (const turn of snapshot.session.turns) {
      if (seen.has(turn.id)) continue;
      seen.add(turn.id);
      rows.push({
        turn,
        prompt: snapshot.summaries[turn.id]?.prompt ?? turn.prompt,
        summary: snapshot.summaries[turn.id],
        counts: getCounts(snapshot.summaries[turn.id], turn),
      });
    }
    return rows;
  }, [snapshot]);

  // Search + filter
  const searchMatches = useMemo(() => {
    if (!searchQuery) return null;
    const matches = new Map<number, SearchMatch>();
    for (const row of allRows) {
      const match = searchTurnRow(row, searchQuery);
      if (match) matches.set(row.turn.id, match);
    }
    return matches;
  }, [allRows, searchQuery]);

  const filteredRows = useMemo(() => {
    if (!searchMatches) return allRows;
    return allRows.filter((r) => searchMatches.has(r.turn.id));
  }, [allRows, searchMatches]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const maxCounts = useMemo(() => computeMaxCounts(allRows), [allRows]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const handleRowClick = useCallback(
    (turnId: number) => {
      onSelectTurn(selectedTurnId === turnId ? null : turnId);
    },
    [selectedTurnId, onSelectTurn],
  );

  const detailTurnId = selectedTurnId ?? hoveredTurnId;
  const detailRow =
    detailTurnId != null ? (allRows.find((r) => r.turn.id === detailTurnId) ?? null) : null;

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span class="timeline__sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  };

  // Check if deletes exist anywhere in the session
  const hasAnyDeletes = allRows.some((r) => r.counts.deletes > 0);

  // Build CSS grid-template-columns once from current widths.
  // Fixed widths are required because each row is a separate CSS grid
  // — max-content would resolve independently per row, misaligning columns.
  // Widths are sized to fit the widest expected content (header label + sort arrow,
  // or data values like "8m 32s", "17.2k").
  const gridColumns = [
    "64px", // When: "15m ago"
    promptWidth != null ? `${promptWidth}px` : "1fr", // Prompt
    "52px", // Edits
    ...(hasAnyDeletes ? ["56px"] : []), // Deletes
    "52px", // Cmds
    "52px", // Errors
    "64px", // Time: "8m 32s"
    "64px", // Tokens: "17.2k"
  ].join(" ");

  const handlePromptResize = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      // When null (1fr), measure the rendered prompt column width
      const promptCol = (e.target as HTMLElement).parentElement;
      const startWidth = promptWidth ?? promptCol?.getBoundingClientRect().width ?? 200;
      const onMove = (ev: MouseEvent) => {
        setPromptWidth(Math.max(120, startWidth + (ev.clientX - startX)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [promptWidth],
  );

  return (
    <div class="timeline">
      <div class="timeline__grid" ref={gridRef} style={{ "--grid-columns": gridColumns } as any}>
        {/* Column headers */}
        <div class="timeline__header-row">
          <div
            class="timeline__col timeline__col--when timeline__col--sortable"
            onClick={() => handleSort("id")}
          >
            When{sortArrow("id")}
          </div>
          <div class="timeline__col timeline__col--prompt">
            <div class="timeline__search-wrapper">
              <input
                class="timeline__search"
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
              />
              {searchQuery && (
                <button class="timeline__search-clear" onClick={() => setSearchQuery("")}>
                  ×
                </button>
              )}
            </div>
            {searchMatches && (
              <span class="timeline__row-count">
                {sortedRows.length}/{allRows.length}
              </span>
            )}
            <div class="timeline__col-resize-border" onMouseDown={handlePromptResize} />
          </div>
          <div
            class="timeline__col timeline__col--cell timeline__col--sortable"
            onClick={() => handleSort("edits")}
          >
            Edits{sortArrow("edits")}
          </div>
          {hasAnyDeletes && (
            <div
              class="timeline__col timeline__col--cell timeline__col--sortable"
              onClick={() => handleSort("deletes")}
            >
              Deletes{sortArrow("deletes")}
            </div>
          )}
          <div
            class="timeline__col timeline__col--cell timeline__col--sortable"
            onClick={() => handleSort("commands")}
          >
            Cmds{sortArrow("commands")}
          </div>
          <div
            class="timeline__col timeline__col--cell timeline__col--sortable"
            onClick={() => handleSort("errors")}
          >
            Errors{sortArrow("errors")}
          </div>
          <div
            class="timeline__col timeline__col--duration timeline__col--sortable"
            onClick={() => handleSort("duration")}
          >
            Time{sortArrow("duration")}
          </div>
          <div
            class="timeline__col timeline__col--tokens timeline__col--sortable"
            onClick={() => handleSort("tokens")}
          >
            Tokens{sortArrow("tokens")}
          </div>
        </div>

        {/* Turn rows */}
        <div class="timeline__body">
          {sortedRows.map(({ turn, prompt, counts }) => {
            const isActive = turn.id === liveTurnId;
            const isSelected = selectedTurnId === turn.id;
            const match = searchMatches?.get(turn.id);

            const rowClass = [
              "timeline__row",
              isSelected && "timeline__row--selected",
              hoveredTurnId === turn.id && !isSelected && "timeline__row--hovered",
            ]
              .filter(Boolean)
              .join(" ");

            const borderClass = isActive ? "timeline__row-border--active" : "";

            return (
              <div
                key={turn.id}
                class={rowClass}
                ref={isSelected ? selectedRef : null}
                onMouseEnter={() => setHoveredTurnId(turn.id)}
                onMouseLeave={() => setHoveredTurnId(null)}
                onClick={() => handleRowClick(turn.id)}
              >
                <div class={`timeline__row-border ${borderClass}`} />
                <div
                  class={`timeline__col timeline__col--when${isActive ? " timeline__col--when-active" : ""}`}
                  title={formatTimeFull(turn.startedAt)}
                >
                  {formatAge(turn.startedAt)}
                </div>
                <div class="timeline__col timeline__col--prompt" title={prompt}>
                  {prompt}
                  {match && match.source !== "prompt" && (
                    <span class="timeline__match-hint">matched in {match.source}</span>
                  )}
                  <div class="timeline__col-resize-border" onMouseDown={handlePromptResize} />
                </div>
                <IntensityCell count={counts.edits} max={maxCounts.maxEdits} color="teal" />
                {hasAnyDeletes && (
                  <IntensityCell count={counts.deletes} max={maxCounts.maxDeletes} color="red" />
                )}
                <IntensityCell count={counts.commands} max={maxCounts.maxCommands} color="blue" />
                <IntensityCell count={counts.errors} max={maxCounts.maxErrors} color="orange" />
                <div class="timeline__col timeline__col--duration">
                  {formatDurationShort(counts.durationMs)}
                </div>
                <div class="timeline__col timeline__col--tokens">
                  {counts.tokens > 0 ? formatTokensCompact(counts.tokens) : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resize handle */}
      <div
        class="timeline__resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = detailWidth;
          const onMove = (ev: MouseEvent) => {
            const delta = startX - ev.clientX;
            setDetailWidth(Math.max(200, Math.min(600, startWidth + delta)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />

      {/* Detail panel */}
      <div class="timeline__detail" style={{ width: `${detailWidth}px` }}>
        {detailRow ? (
          <ExplorerTurnDetail
            row={detailRow}
            live={detailRow.turn.id === liveTurnId ? live : null}
            onOpenFile={onOpenFile}
            onShowDiff={onShowDiff}
            onDrillDown={onDrillDown}
          />
        ) : (
          <div class="timeline__detail-empty">
            <div>hover or click a turn</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IntensityCell ─────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  teal: "rgba(77, 255, 196, ",
  blue: "rgba(100, 160, 220, ",
  red: "rgba(220, 80, 80, ",
  orange: "rgba(220, 150, 60, ",
};

function IntensityCell({
  count,
  max,
  color,
  narrow,
}: {
  count: number;
  max: number;
  color: string;
  narrow?: boolean;
}) {
  const alpha = intensity(count, max);
  const bg =
    alpha > 0 ? `${COLOR_MAP[color] ?? "rgba(128,128,128,"}${alpha})` : "rgba(128, 128, 128, 0.08)";
  return (
    <div
      class={`timeline__col ${narrow ? "timeline__col--cell-narrow" : "timeline__col--cell"}`}
      style={{
        background: bg,
        // Dark text on colored backgrounds for contrast
        ...(alpha > 0 ? { color: "#0d1520", opacity: 1 } : {}),
      }}
    >
      {count > 0 ? count : ""}
    </div>
  );
}

// ─── ExplorerTurnDetail ───────────────────────────────────────────
// Delegates directly to the shared TurnDetail component.
// Explorer shows the prompt inside the detail (showPrompt=true).

function ExplorerTurnDetail({
  row,
  live,
  onOpenFile,
  onShowDiff,
  onDrillDown,
}: {
  row: TurnRow;
  live: LiveTurnState | null;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  onDrillDown?: ((activityId: string) => void) | undefined;
}) {
  return (
    <TurnDetail
      summary={row.summary ?? null}
      turn={row.turn}
      live={live}
      showPrompt
      onOpenFile={onOpenFile}
      onShowDiff={onShowDiff}
      onDrillDown={onDrillDown}
    />
  );
}
