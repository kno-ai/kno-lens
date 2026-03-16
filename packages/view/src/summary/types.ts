/** A single line of structured detail shown when an item is expanded inline. */
export interface ItemDetailLine {
  text: string;
  style?: "code" | "added" | "removed" | "error" | "path" | undefined;
  /** File path for open-in-editor support on detail lines. */
  filePath?: string | undefined;
  /** Activity ID for drill-down or diff support on detail lines. */
  activityId?: string | undefined;
}

export interface SummaryItem {
  importance: "high" | "medium" | "low";
  /** Activity kind or derived display category (e.g. "bash_error", "file_created"). */
  category: string;
  label: string;
  detail?: string | undefined;
  /** Activity IDs for drill-down — stable across assembly limits. */
  activityIds: string[];
  /** Structured detail lines for inline expansion (2-4 lines max). */
  expandedDetail?: ItemDetailLine[] | undefined;
  /** Original file path for file-related activities (open-in-editor support). */
  filePath?: string | undefined;
}

export interface TurnSummaryStats {
  filesCreated: number;
  filesEdited: number;
  filesDeleted: number;
  filesRead: number;
  commandsRun: number;
  commandsFailed: number;
  searchesRun: number;
  /** All activities with error status — matches turn.errorCount from the builder. */
  errors: number;
}

/**
 * Pre-computed display counts for a completed turn.
 * These are the values UI components should render directly —
 * no further derivation needed.
 */
export interface TurnDisplayCounts {
  edits: number;
  deletes: number;
  commands: number;
  errors: number;
  reads: number;
  searches: number;
  tokens: number;
  durationMs: number;
}

export interface TurnSummary {
  turnId: number;
  prompt: string;
  items: SummaryItem[];
  stats: TurnSummaryStats;
  /** Pre-computed display counts — use these in UI, not raw stats. */
  counts: TurnDisplayCounts;
  /** Last text response from the assistant, truncated for display. */
  response?: string | undefined;
}
