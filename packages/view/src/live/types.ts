import type { ActivityKind } from "@kno-lens/core";

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
  /** The most recently completed activity. */
  lastCompleted: LiveActivity | null;
  /** Trailing excerpt of the most recent text_output (truncated). */
  lastText: string | null;
}

export interface LiveActivity {
  id: string;
  label: string;
  kind: ActivityKind;
  startedAt: string;
}
