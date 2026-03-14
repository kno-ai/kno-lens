import type { Session } from "@kno-lens/core";
import type { TurnSummary } from "../summary/types.js";

export const SUMMARY_ALGORITHM_VERSION = "1.0.0";

/** Serializable snapshot of a controller's complete state. */
export interface SessionSnapshot {
  session: Session;
  summaries: Record<number, TurnSummary>;
  summaryConfigVersion: string;
}
