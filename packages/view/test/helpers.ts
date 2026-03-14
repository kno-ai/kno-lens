import type {
  Activity,
  ActivityKind,
  ActivityStatus,
  SessionEvent,
  TurnTokenUsage,
} from "@kno-lens/core";

// ─── Event builders ──────────────────────────────────────────────────────
// Minimal synthetic event factories for tests. Each returns a valid
// SessionEvent with sensible defaults that can be overridden.

let activityCounter = 0;

export function resetCounters(): void {
  activityCounter = 0;
}

export function sessionStart(
  overrides?: Partial<SessionEvent & { type: "session_start" }>,
): SessionEvent & { type: "session_start" } {
  return {
    type: "session_start",
    meta: {
      id: "test-session-1",
      tool: "claude-code",
      schemaVersion: "1",
      projectPath: "/test/project",
      projectName: "test-project",
      startedAt: "2025-01-01T00:00:00Z",
    },
    ...overrides,
  } as SessionEvent & { type: "session_start" };
}

export function turnStart(
  turnId: number,
  prompt: string = "test prompt",
): SessionEvent & { type: "turn_start" } {
  return {
    type: "turn_start",
    turnId,
    prompt,
    at: "2025-01-01T00:01:00Z",
  };
}

export function turnEnd(
  turnId: number,
  tokens?: Partial<TurnTokenUsage>,
): SessionEvent & { type: "turn_end" } {
  return {
    type: "turn_end",
    turnId,
    tokens: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      models: ["claude-sonnet-4-6"],
      ...tokens,
    },
    durationMs: 1000,
    endedAt: "2025-01-01T00:02:00Z",
  };
}

export function sessionEnd(): SessionEvent & { type: "session_end" } {
  return {
    type: "session_end",
    endedAt: "2025-01-01T00:10:00Z",
  };
}

export function makeActivity(
  kind: ActivityKind,
  status: ActivityStatus = "running",
  overrides?: Record<string, unknown>,
): Activity {
  const id = `act-${++activityCounter}`;
  const base = {
    id,
    kind,
    status,
    startedAt: "2025-01-01T00:01:30Z",
  };

  let defaults: Record<string, unknown>;
  switch (kind) {
    case "file_read":
      defaults = { path: "src/foo.ts" };
      break;
    case "file_write":
      defaults = { path: "src/new.ts", isNew: true };
      break;
    case "file_edit":
      defaults = { path: "src/bar.ts" };
      break;
    case "bash":
      defaults = { command: "npm test" };
      break;
    case "search":
      defaults = { tool: "grep", pattern: "TODO", resultCount: 3 };
      break;
    case "fetch":
      defaults = { url: "https://example.com" };
      break;
    case "mcp_call":
      defaults = { server: "kno", toolName: "vault_status" };
      break;
    case "agent":
      defaults = { description: "investigate test failures" };
      break;
    case "ask_user":
      defaults = { question: "Continue?" };
      break;
    case "task":
      defaults = { operation: "create", subject: "fix bug" };
      break;
    case "unknown":
      defaults = { rawToolName: "custom_tool" };
      break;
  }

  return { ...base, ...defaults, ...overrides } as Activity;
}

export function activityStart(
  turnId: number,
  activity: Activity,
): SessionEvent & { type: "activity_start" } {
  return { type: "activity_start", turnId, activity };
}

export function activityEnd(
  turnId: number,
  activity: Activity,
): SessionEvent & { type: "activity_end" } {
  return {
    type: "activity_end",
    turnId,
    activityId: activity.id,
    activity: {
      ...activity,
      status: activity.status === "running" ? "done" : activity.status,
      endedAt: "2025-01-01T00:01:45Z",
    },
  };
}
