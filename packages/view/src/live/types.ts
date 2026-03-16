import type { ActivityKind } from "@kno-lens/core";

/** Per-category completion counts for the current turn. */
export interface LiveActivityCounts {
  edits: number;
  deletes: number;
  commands: number;
  reads: number;
  searches: number;
  other: number;
}

export interface LiveTurnState {
  /** The turn currently in progress, or null between turns. */
  turnId: number | null;
  /** The user's prompt for this turn. */
  prompt: string;
  /** ISO-8601 timestamp when the turn started. */
  startedAt: string;
  /** Activities currently in progress (multiple for parallel tool calls). */
  runningActivities: LiveActivity[];
  /** Count of activities that have completed (done or error). */
  completedCount: number;
  /** Count of activities that completed with error status. */
  errorCount: number;
  /** Completed activity counts broken down by category. */
  activityCounts: LiveActivityCounts;
  /** Completed activities with labels and paths for live detail display. */
  completedActivities: CompletedLiveActivity[];
  /** The most recently completed activity. */
  lastCompleted: LiveActivity | null;
  /** Trailing excerpt of the most recent text_output (truncated). */
  lastText: string | null;
  /** True when Claude is currently in a thinking block. */
  isThinking: boolean;
}

export interface LiveActivity {
  id: string;
  label: string;
  kind: ActivityKind;
  startedAt: string;
}

export interface CompletedLiveActivity {
  id: string;
  label: string;
  kind: ActivityKind;
  status: "done" | "error";
  filePath?: string | undefined;
  detail?: string | undefined;
}
