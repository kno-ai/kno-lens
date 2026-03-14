// ─── Parser output types ──────────────────────────────────────────────────
// Everything in this file is emitted by the parser or configures it.
// These types define the contract between log parsing and downstream consumers.

// ─── Tool identity ─────────────────────────────────────────────────────────

export type SupportedTool = "claude-code";

// ─── Session metadata ─────────────────────────────────────────────────────
// Extracted from the first log record. Immutable once emitted in session_start.

export interface SessionMeta {
  id: string;
  tool: SupportedTool;
  schemaVersion: string;
  projectPath: string;
  projectName: string;
  slug?: string | undefined;
  gitBranch?: string | undefined;
  startedAt: string; // ISO-8601
  cliVersion?: string | undefined;
  isContinuation?: boolean | undefined;
}

// ─── Token usage ──────────────────────────────────────────────────────────

export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd?: number | undefined;
  models: string[];
}

// ─── Activity ─────────────────────────────────────────────────────────────

export type ActivityKind =
  | "file_read"
  | "file_write"
  | "file_edit"
  | "bash"
  | "search"
  | "fetch"
  | "mcp_call"
  | "agent"
  | "task"
  | "ask_user"
  | "unknown";

export type ActivityStatus = "running" | "done" | "error";

interface ActivityBase {
  id: string;
  kind: ActivityKind;
  status: ActivityStatus;
  startedAt: string; // ISO-8601
  endedAt?: string | undefined; // ISO-8601
  error?: string | undefined;
  /** UUID of the raw log record containing this activity's result.
   *  Use this to cross-reference back to the JSONL for full content
   *  (file contents, complete bash output, etc.) that the model
   *  intentionally truncates or omits. */
  resultRecordUuid?: string | undefined;
}

export interface FileReadActivity extends ActivityBase {
  kind: "file_read";
  path: string;
  lineCount?: number | undefined;
}

export interface FileWriteActivity extends ActivityBase {
  kind: "file_write";
  path: string;
  isNew: boolean;
}

export interface FileEditActivity extends ActivityBase {
  kind: "file_edit";
  path: string;
  /** Truncated to config.editStringMaxChars. Full content available
   *  via the raw log using the activity id (= tool_use id). */
  oldString?: string | undefined;
  /** Truncated to config.editStringMaxChars. */
  newString?: string | undefined;
}

export interface BashActivity extends ActivityBase {
  kind: "bash";
  command: string;
  description?: string | undefined;
  exitCode?: number | undefined;
  /** Truncated to config.bashOutputMaxChars. Full output available
   *  via resultRecordUuid. */
  output?: string | undefined;
  durationMs?: number | undefined;
}

export interface SearchActivity extends ActivityBase {
  kind: "search";
  tool: "grep" | "glob";
  pattern: string;
  scope?: string | undefined;
  resultCount?: number | undefined;
  /** File paths from search results, limited to config.searchMatchedFilesMax.
   *  Full results available via resultRecordUuid. */
  matchedFiles?: string[] | undefined;
}

export interface FetchActivity extends ActivityBase {
  kind: "fetch";
  url: string;
  statusCode?: number | undefined;
}

export interface McpActivity extends ActivityBase {
  kind: "mcp_call";
  server: string;
  toolName: string;
  input?: Record<string, unknown> | undefined;
}

export interface AgentActivity extends ActivityBase {
  kind: "agent";
  description?: string | undefined;
  subagentType?: string | undefined;
  /** Truncated to config.agentPromptMaxChars. */
  prompt?: string | undefined;
  agentSessionId?: string | undefined;
  durationMs?: number | undefined;
}

export interface TaskActivity extends ActivityBase {
  kind: "task";
  operation: "create" | "update" | "get" | "list";
  subject?: string | undefined;
  taskId?: string | undefined;
}

export interface AskUserActivity extends ActivityBase {
  kind: "ask_user";
  question?: string | undefined;
  /** Truncated to config.answerMaxChars. */
  answer?: string | undefined;
}

export interface UnknownActivity extends ActivityBase {
  kind: "unknown";
  rawToolName: string;
  rawInput?: unknown | undefined;
}

export type Activity =
  | FileReadActivity
  | FileWriteActivity
  | FileEditActivity
  | BashActivity
  | SearchActivity
  | FetchActivity
  | McpActivity
  | AgentActivity
  | TaskActivity
  | AskUserActivity
  | UnknownActivity;

// ─── SessionEvent ─────────────────────────────────────────────────────────
// The ordered stream of events emitted by the parser.
// Each event is self-contained — no references to mutable state.

export type SessionEvent =
  | {
      type: "session_start";
      meta: SessionMeta;
    }
  | {
      type: "turn_start";
      turnId: number;
      prompt: string;
      hasAttachments?: boolean | undefined;
      at: string; // ISO-8601
    }
  | {
      type: "text_output";
      turnId: number;
      text: string;
      at: string; // ISO-8601
    }
  | {
      type: "thinking";
      turnId: number;
      excerpt?: string | undefined;
      at: string; // ISO-8601
    }
  | {
      type: "activity_start";
      turnId: number;
      activity: Activity;
    }
  | {
      type: "activity_end";
      turnId: number;
      activityId: string;
      activity: Activity;
    }
  | {
      type: "turn_end";
      turnId: number;
      tokens: TurnTokenUsage;
      durationMs?: number | undefined;
      endedAt: string; // ISO-8601
    }
  | {
      type: "turn_duration";
      turnId: number;
      durationMs: number;
    }
  | {
      type: "compaction";
      at: string; // ISO-8601
    }
  | {
      type: "session_end";
      endedAt: string; // ISO-8601
    }
  | {
      type: "progress";
      turnId?: number | undefined;
      activityId?: string | undefined;
    }
  | {
      type: "parse_error";
      message: string;
      rawLine?: string | undefined;
    };

// ─── Parser interface ─────────────────────────────────────────────────────

export interface Parser {
  readonly tool: SupportedTool;
  readonly version: string;
  parse(line: string): SessionEvent[];
  end(): SessionEvent[];
}

// ─── Configuration ────────────────────────────────────────────────────────
// All size limits are in characters. Set any limit to 0 to omit that field
// entirely, or Infinity to disable truncation.

export interface SessionCoreConfig {
  /** Max chars for bash stdout/stderr stored in BashActivity.output. */
  bashOutputMaxChars: number;
  /** Max chars for thinking block excerpts. */
  thinkingExcerptMaxChars: number;
  /** Max chars for file edit old/new strings. */
  editStringMaxChars: number;
  /** Max chars for agent prompt excerpts. */
  agentPromptMaxChars: number;
  /** Max chars for error messages on activities. */
  errorMaxChars: number;
  /** Max chars for AskUserActivity.answer. */
  answerMaxChars: number;
  /** Max file paths stored in SearchActivity.matchedFiles. */
  searchMatchedFilesMax: number;
}

export const DEFAULT_CONFIG: SessionCoreConfig = {
  bashOutputMaxChars: 120,
  thinkingExcerptMaxChars: 200,
  editStringMaxChars: 500,
  agentPromptMaxChars: 200,
  errorMaxChars: 500,
  answerMaxChars: 500,
  searchMatchedFilesMax: 20,
};
