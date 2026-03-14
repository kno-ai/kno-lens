// ─── Materialized view types ──────────────────────────────────────────────
// These types represent the assembled view of a session, built from events
// by SessionBuilder. They are what visualization consumers work with.

import type { Activity, SessionMeta, TurnTokenUsage } from "./parsing/events.js";

// ─── Session ──────────────────────────────────────────────────────────────

export type SessionStatus = "active" | "ended";

export interface Session {
  meta: SessionMeta;
  status: SessionStatus;
  endedAt?: string | undefined; // ISO-8601, from session_end event
  turns: Turn[];
  stats: SessionStats;
}

// ─── Turn ─────────────────────────────────────────────────────────────────
// A turn is a user prompt followed by the assistant's full response.
// The response is an ordered sequence of steps that preserves the
// text → tool → text → tool → text interleaving the user sees.

export type TurnStatus = "active" | "done" | "error";

export interface Turn {
  id: number;
  status: TurnStatus;
  prompt: string;
  hasAttachments?: boolean | undefined;
  steps: TurnStep[];
  startedAt: string; // ISO-8601
  endedAt?: string | undefined; // ISO-8601
  durationMs?: number | undefined;
  tokenUsage: TurnTokenUsage;
  errorCount: number;
}

// ─── TurnStep ─────────────────────────────────────────────────────────────
// Ordered content blocks within a turn. This is the fundamental unit of
// visualization — the live view renders steps as they arrive, the
// historical view replays them in order.

export type TurnStep = TextStep | ThinkingStep | ActivityStep;

export interface TextStep {
  kind: "text";
  text: string;
  at: string; // ISO-8601
}

export interface ThinkingStep {
  kind: "thinking";
  excerpt?: string | undefined;
  at: string; // ISO-8601
}

export interface ActivityStep {
  kind: "activity";
  activity: Activity;
}

// ─── SessionStats ─────────────────────────────────────────────────────────

export interface SessionStats {
  totalTurns: number;
  completedTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  estimatedCostUsd: number;
  /** Sum of turn durationMs values (assistant processing time only). */
  activeDurationMs: number;
  /** Wall-clock time from session start to end (includes user idle time).
   *  Undefined if session has no endedAt. */
  wallClockDurationMs?: number | undefined;
  filesRead: string[];
  filesWritten: string[];
  commandsRun: number;
  errorCount: number;
}
