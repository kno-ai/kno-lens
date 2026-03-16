import { Fragment } from "preact";
import { useState, useMemo, useCallback, useRef, useEffect } from "preact/hooks";
import type { SessionSnapshot } from "@kno-lens/view";

// ─── Types ──────────────────────────────────────────────────────

export type HeatmapMode = "edits" | "reads" | "all";

interface HeatmapProps {
  snapshot: SessionSnapshot;
  fileFilter?: string | undefined;
  onNavigateToTurn?: ((turnId: number) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
}

interface FileActivity {
  path: string;
  turnCounts: Map<number, number>;
  totalCount: number;
}

// ─── Mode config ────────────────────────────────────────────────

interface ModeConfig {
  label: string;
  /** Activity kinds to match in direct step scanning. */
  activityKinds: Set<string>;
  /** Summary categories to match in the fallback path. */
  summaryCategories: Set<string>;
  /** Cell color as CSS rgb components. */
  color: string;
  /** Tooltip noun (singular). */
  noun: string;
  /** Empty state text. */
  emptyText: string;
}

// Only activity types with file paths belong in the file × turn heatmap grid.
// Commands, errors, and deletes don't have file associations — they're
// per-turn events visible in the timeline instead.
const MODES: Record<HeatmapMode, ModeConfig> = {
  edits: {
    label: "Edits",
    activityKinds: new Set(["file_edit", "file_write"]),
    summaryCategories: new Set(["file_edited", "file_created"]),
    color: "77, 255, 196",
    noun: "edit",
    emptyText: "No file edits in this session",
  },
  reads: {
    label: "Reads",
    activityKinds: new Set(["file_read"]),
    summaryCategories: new Set(["file_read"]),
    color: "100, 160, 220",
    noun: "read",
    emptyText: "No file reads in this session",
  },
  all: {
    label: "All",
    activityKinds: new Set(["file_edit", "file_write", "file_read"]),
    summaryCategories: new Set(["file_edited", "file_created", "file_read"]),
    color: "77, 255, 196",
    noun: "action",
    emptyText: "No file activity in this session",
  },
};

// ─── Data ───────────────────────────────────────────────────────

function buildFileActivities(snapshot: SessionSnapshot, mode: ModeConfig): FileActivity[] {
  const fileMap = new Map<string, Map<number, number>>();

  for (const turn of snapshot.session.turns) {
    let foundSteps = false;

    // Direct activity step scanning
    if (mode.activityKinds.size > 0) {
      for (const step of turn.steps) {
        if (step.kind !== "activity") continue;
        const act = step.activity;
        if (!mode.activityKinds.has(act.kind)) continue;
        if (!act.path) continue;
        foundSteps = true;

        let turnCounts = fileMap.get(act.path);
        if (!turnCounts) {
          turnCounts = new Map();
          fileMap.set(act.path, turnCounts);
        }
        turnCounts.set(turn.id, (turnCounts.get(turn.id) ?? 0) + 1);
      }
    }

    // Summary fallback for turns where steps have been evicted
    if (!foundSteps) {
      const summary = snapshot.summaries[turn.id];
      if (summary) {
        for (const item of summary.items) {
          if (!item.filePath) continue;
          if (!mode.summaryCategories.has(item.category)) continue;

          let turnCounts = fileMap.get(item.filePath);
          if (!turnCounts) {
            turnCounts = new Map();
            fileMap.set(item.filePath, turnCounts);
          }
          turnCounts.set(turn.id, (turnCounts.get(turn.id) ?? 0) + item.activityIds.length);
        }
      }
    }
  }

  const activities: FileActivity[] = [];
  for (const [path, turnCounts] of fileMap) {
    let totalCount = 0;
    for (const c of turnCounts.values()) totalCount += c;
    activities.push({ path, turnCounts, totalCount });
  }

  activities.sort((a, b) => b.totalCount - a.totalCount);
  return activities;
}

/** Show file basename with parent for context: "styles/main.css" */
function shortPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return parts.slice(-2).join("/");
}

// ─── Component ──────────────────────────────────────────────────

export function Heatmap({ snapshot, fileFilter, onNavigateToTurn, onOpenFile }: HeatmapProps) {
  const [mode, setMode] = useState<HeatmapMode>("edits");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    file: string;
    turnId: number;
    count: number;
  } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedFile, setFocusedFile] = useState<string | null>(fileFilter ?? null);

  const modeConfig = MODES[mode];

  const fileActivities = useMemo(
    () => buildFileActivities(snapshot, modeConfig),
    [snapshot, modeConfig],
  );
  const turnIds = useMemo(() => snapshot.session.turns.map((t) => t.id), [snapshot]);

  const filteredActivities = useMemo(() => {
    if (!fileFilter) return fileActivities.filter((f) => f.totalCount > 0);
    return fileActivities.filter(
      (f) => f.path === fileFilter || f.path.endsWith("/" + fileFilter.split("/").pop()),
    );
  }, [fileActivities, fileFilter]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const file of filteredActivities) {
      for (const c of file.turnCounts.values()) {
        if (c > max) max = c;
      }
    }
    return max;
  }, [filteredActivities]);

  const failedTurns = useMemo(() => {
    const set = new Set<number>();
    for (const turn of snapshot.session.turns) {
      if (turn.errorCount > 0) set.add(turn.id);
    }
    return set;
  }, [snapshot]);

  const handleCellClick = useCallback(
    (turnId: number) => {
      onNavigateToTurn?.(turnId);
    },
    [onNavigateToTurn],
  );

  // Auto-scroll to the right (latest turns) on mount and when new turns appear
  const gridRef = useRef<HTMLDivElement>(null);
  const prevTurnCount = useRef(turnIds.length);
  useEffect(() => {
    if (gridRef.current) {
      if (turnIds.length !== prevTurnCount.current) {
        prevTurnCount.current = turnIds.length;
        gridRef.current.scrollLeft = gridRef.current.scrollWidth;
      }
    }
  }, [turnIds.length]);
  useEffect(() => {
    // Initial scroll on mount
    if (gridRef.current) {
      gridRef.current.scrollLeft = gridRef.current.scrollWidth;
    }
  }, []);

  const rgb = modeConfig.color;

  return (
    <div class="heatmap">
      {/* Mode selector */}
      <div class="heatmap__mode-bar">
        {(Object.keys(MODES) as HeatmapMode[]).map((key) => (
          <button
            key={key}
            class={`heatmap__mode-btn${mode === key ? " heatmap__mode-btn--active" : ""}`}
            onClick={() => setMode(key)}
          >
            {MODES[key].label}
          </button>
        ))}
      </div>

      {filteredActivities.length === 0 ? (
        <div class="heatmap__empty">{modeConfig.emptyText}</div>
      ) : (
        <div class="heatmap__grid-wrapper" ref={gridRef}>
          <div
            class="heatmap__grid"
            style={{
              gridTemplateColumns: `200px repeat(${turnIds.length}, 24px)`,
            }}
          >
            {/* Column headers — turn numbers */}
            <div class="heatmap__corner">
              <span class="heatmap__corner-label">Files</span>
              <span class="heatmap__corner-arrow">Turns →</span>
            </div>
            {turnIds.map((id) => (
              <div
                key={id}
                class={`heatmap__col-header${failedTurns.has(id) ? " heatmap__col-header--error" : ""}`}
                onClick={() => onNavigateToTurn?.(id)}
                title={`Turn ${id} — click to view in timeline`}
              >
                {id}
              </div>
            ))}

            {/* File rows */}
            {filteredActivities.map((file) => {
              const isFocused = focusedFile === file.path;
              const dimmed = focusedFile != null && !isFocused;
              const isHovered = hoveredRow === file.path;
              return (
                <Fragment key={file.path}>
                  <div
                    class={[
                      "heatmap__file-label",
                      "heatmap__file-label--clickable",
                      dimmed && "heatmap__file-label--dimmed",
                      isFocused && "heatmap__file-label--focused",
                      isHovered && "heatmap__file-label--hover",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={`${file.path} — click to ${isFocused ? "show all" : "focus"}`}
                    onClick={() => setFocusedFile(isFocused ? null : file.path)}
                    onMouseEnter={() => setHoveredRow(file.path)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {shortPath(file.path)}
                  </div>
                  {turnIds.map((turnId) => {
                    const count = file.turnCounts.get(turnId) ?? 0;
                    const alpha =
                      count > 0 && maxCount > 0 ? Math.min(0.9, (count / maxCount) * 0.9 + 0.1) : 0;
                    return (
                      <div
                        key={`${file.path}-${turnId}`}
                        class={[
                          "heatmap__cell",
                          dimmed && "heatmap__cell--dimmed",
                          isHovered && "heatmap__cell--row-hover",
                          count > 0 && "heatmap__cell--active",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          background: alpha > 0 ? `rgba(${rgb}, ${alpha})` : undefined,
                          ...(alpha > 0 ? { color: "#0d1520", opacity: 1 } : {}),
                        }}
                        onClick={count > 0 ? () => handleCellClick(turnId) : undefined}
                        onMouseEnter={(e) => {
                          setHoveredRow(file.path);
                          if (count > 0) {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({
                              x: rect.left + rect.width / 2,
                              y: rect.top - 4,
                              file: file.path,
                              turnId,
                              count,
                            });
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredRow(null);
                          setTooltip(null);
                        }}
                      >
                        {count > 0 ? count : null}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Focused file bar */}
      {focusedFile && (
        <div class="heatmap__focus-bar">
          <span class="heatmap__focus-label">{shortPath(focusedFile)}</span>
          {onOpenFile && (
            <button
              class="heatmap__focus-action"
              onClick={() => onOpenFile(focusedFile)}
              title="Open file"
            >
              Open
            </button>
          )}
          <button
            class="heatmap__focus-clear"
            onClick={() => setFocusedFile(null)}
            title="Show all files"
          >
            ×
          </button>
        </div>
      )}

      {/* Legend */}
      <div class="heatmap__legend">
        <span class="heatmap__legend-label">{modeConfig.label} per turn:</span>
        <span class="heatmap__legend-swatch" style={`background: rgba(${rgb},0.15)`} />
        <span class="heatmap__legend-text">1</span>
        <span class="heatmap__legend-swatch" style={`background: rgba(${rgb},0.5)`} />
        <span class="heatmap__legend-swatch" style={`background: rgba(${rgb},0.9)`} />
        <span class="heatmap__legend-text">5+</span>
        {!focusedFile && (
          <>
            <span class="heatmap__legend-sep" />
            <span class="heatmap__legend-text">Click file to focus · Click cell to view turn</span>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          class="heatmap__tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div>{shortPath(tooltip.file)}</div>
          <div>
            Turn {tooltip.turnId} · {tooltip.count} {modeConfig.noun}
            {tooltip.count === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
