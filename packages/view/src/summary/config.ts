export type ImportanceLevel = "high" | "medium" | "low" | "hidden";

export interface SummaryConfig {
  /** Override default importance for specific categories (keyed by category string). */
  importance: Record<string, ImportanceLevel>;
  /** Minimum importance level to show by default. */
  defaultMinImportance: "high" | "medium" | "low";
  /** Whether to group consecutive same-category items. */
  groupConsecutive: boolean;
  /** Max items per turn before "and N more…" collapse. */
  maxVisibleItems: number;
  /** Max completed turns to include in exported snapshots. Most recent wins. */
  maxVisibleTurns: number;
}

export const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  importance: {},
  defaultMinImportance: "medium",
  groupConsecutive: true,
  maxVisibleItems: 100,
  maxVisibleTurns: 50,
};
