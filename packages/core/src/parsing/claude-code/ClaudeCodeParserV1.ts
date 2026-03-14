import type {
  Activity,
  ActivityStatus,
  AgentActivity,
  AskUserActivity,
  BashActivity,
  FileEditActivity,
  FileReadActivity,
  FileWriteActivity,
  McpActivity,
  Parser,
  SearchActivity,
  FetchActivity,
  TaskActivity,
  UnknownActivity,
  SessionEvent,
  SessionMeta,
  SupportedTool,
  TurnTokenUsage,
  SessionCoreConfig,
} from "../events.js";
import { DEFAULT_CONFIG } from "../events.js";
import { SCHEMA_VERSION } from "../../version.js";

// ─── Raw JSONL record shapes ──────────────────────────────────────────────

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface RawContentItem {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  source?: Record<string, unknown>;
}

interface RawMessage {
  role?: string;
  model?: string;
  id?: string;
  content?: string | RawContentItem[];
  stop_reason?: string | null;
  usage?: RawUsage;
}

interface RawRecord {
  type: string;
  subtype?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
  slug?: string;
  message?: RawMessage;
  requestId?: string;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  durationMs?: number;
  costUSD?: number;
}

// ─── Continuation detection ──────────────────────────────────────────────

const CONTINUATION_PREFIX = "This session is being continued from a previous conversation";

// ─── Parser state ─────────────────────────────────────────────────────────

export class ClaudeCodeParserV1 implements Parser {
  readonly tool: SupportedTool = "claude-code";
  readonly version = SCHEMA_VERSION;

  private config: SessionCoreConfig;
  private sessionStarted = false;
  private currentTurnId = 0;
  private seenMessageIds = new Set<string>();
  private pendingToolUses = new Map<string, Activity>();
  private turnTokens: TurnTokenUsage = emptyTokenUsage();
  private turnCostUsd = 0;
  private turnStartedAt: string | undefined;
  private turnEndedAt: string | undefined;
  private turnDurationMs: number | undefined;
  private lastTimestamp: string | undefined;

  constructor(config?: Partial<SessionCoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  parse(line: string): SessionEvent[] {
    const trimmed = line.trim();
    if (trimmed === "") return [];

    let record: RawRecord;
    try {
      record = JSON.parse(trimmed) as RawRecord;
    } catch {
      return [{ type: "parse_error", message: "Invalid JSON", rawLine: truncate(trimmed, 200) }];
    }

    if (typeof record !== "object" || record === null || !("type" in record)) {
      return [{ type: "parse_error", message: "Record missing type field" }];
    }

    // Skip sidechain records
    if (record.isSidechain === true) return [];

    if (record.timestamp) {
      this.lastTimestamp = record.timestamp;
    }

    // Accumulate cost from any record that carries it
    if (record.costUSD != null && this.currentTurnId > 0) {
      this.turnCostUsd += record.costUSD;
    }

    // Deduplication: assistant messages can stutter (same message.id + requestId
    // appearing multiple times). Only dedupe finalized messages — those with a
    // stop_reason. Intermediate streaming chunks (stop_reason: null) share the
    // same message.id but carry progressively more content.
    if (
      record.type === "assistant" &&
      record.message?.id &&
      record.requestId &&
      record.message.stop_reason != null
    ) {
      const dedupeKey = `${record.message.id}:${record.requestId}:${record.message.stop_reason}`;
      if (this.seenMessageIds.has(dedupeKey)) return [];
      this.seenMessageIds.add(dedupeKey);
    }

    switch (record.type) {
      case "user":
        return this.handleUser(record);
      case "assistant":
        return this.handleAssistant(record);
      case "system":
        return this.handleSystem(record);
      case "progress":
        return this.handleProgress(record);
      case "file-history-snapshot":
      case "last-prompt":
      case "queue-operation":
      case "summary":
        return [];
      default:
        return [];
    }
  }

  end(): SessionEvent[] {
    const events: SessionEvent[] = [];

    // Flush orphaned activities (tool_use with no matching tool_result)
    for (const [id, activity] of this.pendingToolUses) {
      const orphaned: Activity = {
        ...activity,
        status: "error",
        error: "Session ended before tool result received",
      };
      events.push({
        type: "activity_end",
        turnId: this.currentTurnId,
        activityId: id,
        activity: orphaned,
      });
    }
    this.pendingToolUses.clear();

    if (this.currentTurnId > 0 && this.turnStartedAt) {
      events.push(this.closeTurn(this.lastTimestamp ?? ""));
    }

    events.push({
      type: "session_end",
      endedAt: this.lastTimestamp ?? "",
    });
    return events;
  }

  // ─── Record handlers ──────────────────────────────────────────────────

  private handleUser(record: RawRecord): SessionEvent[] {
    const events: SessionEvent[] = [];
    const content = record.message?.content;

    // Emit session_start on first meaningful record
    if (!this.sessionStarted) {
      this.sessionStarted = true;

      // Detect continuation before emitting session_start so meta is correct
      const promptText = this.extractUserPrompt(content);
      const isContinuation = promptText?.startsWith(CONTINUATION_PREFIX) === true;

      const meta = this.extractSessionMeta(record, isContinuation);
      events.push({ type: "session_start", meta });
    }

    // Tool results come as content array items with type: "tool_result"
    if (Array.isArray(content)) {
      const hasToolResults = content.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          (item as RawContentItem).type === "tool_result",
      );
      if (hasToolResults) {
        return [...events, ...this.handleToolResults(record, content as RawContentItem[])];
      }
    }

    // Otherwise this is a new user prompt → new turn
    const promptText = this.extractUserPrompt(content);
    if (!promptText) return events;

    // Close previous turn if open
    if (this.currentTurnId > 0 && this.turnStartedAt) {
      events.push(this.closeTurn(this.ts(record)));
    }

    this.currentTurnId++;
    this.turnTokens = emptyTokenUsage();
    this.turnCostUsd = 0;
    this.turnStartedAt = record.timestamp;
    this.turnEndedAt = undefined;
    this.turnDurationMs = undefined;

    // Detect attachments (images, etc.) in user prompt
    const hasAttachments = this.detectAttachments(content);

    const turnStart: SessionEvent = {
      type: "turn_start",
      turnId: this.currentTurnId,
      prompt: promptText,
      at: this.ts(record),
    };
    if (hasAttachments) {
      (turnStart as { hasAttachments?: boolean }).hasAttachments = true;
    }
    events.push(turnStart);

    return events;
  }

  private handleAssistant(record: RawRecord): SessionEvent[] {
    if (this.currentTurnId === 0) return [];

    const events: SessionEvent[] = [];
    const message = record.message;
    if (!message) return events;

    // Accumulate token usage
    if (message.usage) {
      this.accumulateTokens(message.usage, message.model);
    }

    // Process content items
    const content = message.content;
    if (!Array.isArray(content)) return events;

    const at = this.ts(record);

    for (const item of content) {
      if (typeof item !== "object" || item === null) continue;
      const ci = item as RawContentItem;

      if (ci.type === "thinking" && ci.thinking) {
        events.push({
          type: "thinking",
          turnId: this.currentTurnId,
          excerpt: truncate(ci.thinking, this.config.thinkingExcerptMaxChars),
          at,
        });
      }

      if (ci.type === "tool_use" && ci.id && ci.name) {
        const activity = this.makeToolActivity(ci, record.timestamp);
        this.pendingToolUses.set(ci.id, activity);
        events.push({ type: "activity_start", turnId: this.currentTurnId, activity });
      }

      if (ci.type === "text" && ci.text) {
        events.push({
          type: "text_output",
          turnId: this.currentTurnId,
          text: ci.text,
          at,
        });
      }
    }

    // stop_reason "end_turn" means the assistant is done — emit turn_end
    // immediately so live consumers (LiveTurnModel) reset between turns.
    // If system/turn_duration arrives later, it's ignored (turn already closed).
    if (message.stop_reason === "end_turn" && this.turnStartedAt) {
      this.turnEndedAt = at;
      events.push(this.closeTurn(at));
    }

    return events;
  }

  private handleSystem(record: RawRecord): SessionEvent[] {
    const events: SessionEvent[] = [];

    if (record.subtype === "turn_duration" && record.durationMs != null && this.currentTurnId > 0) {
      this.turnDurationMs = record.durationMs;
      if (this.turnStartedAt) {
        // Turn still open (no end_turn seen yet) — close it now with durationMs
        events.push(this.closeTurn(this.ts(record)));
      } else {
        // Turn already closed by end_turn — emit duration update so
        // downstream consumers (SessionBuilder) can attach the value.
        events.push({
          type: "turn_duration",
          turnId: this.currentTurnId,
          durationMs: record.durationMs,
        });
      }
    }

    if (record.subtype === "compact_boundary") {
      events.push({
        type: "compaction",
        at: this.ts(record),
      });
    }

    return events;
  }

  private handleProgress(_record: RawRecord): SessionEvent[] {
    return [
      {
        type: "progress",
        turnId: this.currentTurnId > 0 ? this.currentTurnId : undefined,
      },
    ];
  }

  // ─── Turn closing ─────────────────────────────────────────────────────

  private closeTurn(fallbackEndedAt: string): SessionEvent {
    if (this.turnCostUsd > 0) {
      this.turnTokens.estimatedCostUsd = this.turnCostUsd;
    }

    const event: SessionEvent = {
      type: "turn_end",
      turnId: this.currentTurnId,
      tokens: { ...this.turnTokens },
      durationMs: this.turnDurationMs,
      endedAt: this.turnEndedAt ?? fallbackEndedAt,
    };

    this.turnTokens = emptyTokenUsage();
    this.turnCostUsd = 0;
    this.turnStartedAt = undefined;
    this.turnEndedAt = undefined;
    this.turnDurationMs = undefined;

    return event;
  }

  // ─── Tool result processing ──────────────────────────────────────────

  private handleToolResults(record: RawRecord, content: RawContentItem[]): SessionEvent[] {
    const events: SessionEvent[] = [];

    for (const item of content) {
      if (item.type !== "tool_result" || !item.tool_use_id) continue;

      const pending = this.pendingToolUses.get(item.tool_use_id);
      if (!pending) continue;

      const isError = item.is_error === true || this.isErrorContent(item.content);
      const status: ActivityStatus = isError ? "error" : "done";
      const resultContent =
        typeof item.content === "string" ? item.content : JSON.stringify(item.content);

      const completed = this.enrichActivityWithResult(
        pending,
        status,
        resultContent,
        record.toolUseResult,
        record.timestamp,
        record.uuid,
      );

      this.pendingToolUses.delete(item.tool_use_id);
      events.push({
        type: "activity_end",
        turnId: this.currentTurnId,
        activityId: completed.id,
        activity: completed,
      });
    }

    return events;
  }

  private enrichActivityWithResult(
    activity: Activity,
    status: ActivityStatus,
    resultContent: string,
    toolUseResult: unknown,
    timestamp?: string,
    recordUuid?: string,
  ): Activity {
    const base = {
      ...activity,
      status,
      endedAt: timestamp,
      resultRecordUuid: recordUuid,
      error: status === "error" ? truncate(resultContent, this.config.errorMaxChars) : undefined,
    };

    const tur = toolUseResult as Record<string, unknown> | undefined;

    switch (activity.kind) {
      case "file_read": {
        return { ...base, kind: "file_read" } as FileReadActivity;
      }
      case "file_write": {
        const isNew = tur?.type === "create" || resultContent.includes("created successfully");
        return { ...base, kind: "file_write", isNew } as FileWriteActivity;
      }
      case "file_edit": {
        return { ...base, kind: "file_edit" } as FileEditActivity;
      }
      case "bash": {
        const bashResult = base as BashActivity;
        if (tur && typeof tur === "object") {
          bashResult.output = truncate(
            String(tur.stdout ?? resultContent),
            this.config.bashOutputMaxChars,
          );
          if (tur.stderr && String(tur.stderr).length > 0) {
            bashResult.output = truncate(String(tur.stderr), this.config.bashOutputMaxChars);
          }
          if (typeof tur.durationMs === "number") {
            bashResult.durationMs = tur.durationMs;
          }
        }
        const exitMatch = resultContent.match(/^Exit code (\d+)/);
        if (exitMatch?.[1] != null) {
          bashResult.exitCode = parseInt(exitMatch[1], 10);
          if (bashResult.exitCode !== 0) {
            bashResult.status = "error";
            bashResult.error = truncate(resultContent, this.config.errorMaxChars);
          }
        } else if (status !== "error") {
          bashResult.exitCode = 0;
        }
        return bashResult;
      }
      case "search": {
        const searchResult = base as SearchActivity;
        if (tur && typeof tur === "object") {
          if ("numFiles" in tur) {
            searchResult.resultCount = tur.numFiles as number;
          }
          searchResult.matchedFiles = this.extractMatchedFiles(tur);
        }
        return searchResult;
      }
      case "ask_user": {
        const askResult = base as AskUserActivity;
        if (typeof resultContent === "string" && resultContent.length > 0) {
          askResult.answer = truncate(resultContent, this.config.answerMaxChars);
        }
        return askResult;
      }
      case "agent": {
        const agentResult = base as AgentActivity;
        if (tur && typeof tur === "object") {
          const agentId = tur.agentId ?? tur.agent_id;
          if (typeof agentId === "string") {
            agentResult.agentSessionId = agentId;
          }
        }
        // Compute duration from timestamps
        if (agentResult.startedAt && agentResult.endedAt) {
          const ms =
            new Date(agentResult.endedAt).getTime() - new Date(agentResult.startedAt).getTime();
          if (ms > 0) agentResult.durationMs = ms;
        }
        return agentResult;
      }
      default:
        return base as Activity;
    }
  }

  // ─── Activity factory methods ────────────────────────────────────────

  private makeToolActivity(ci: RawContentItem, timestamp?: string): Activity {
    const name = ci.name ?? "unknown";
    const input = (ci.input ?? {}) as Record<string, unknown>;
    const id = ci.id ?? `unknown-${this.currentTurnId}-${this.pendingToolUses.size}`;
    const base = {
      id,
      status: "running" as const,
      startedAt: timestamp ?? this.lastTimestamp ?? "",
    };

    // MCP tools: mcp__server__toolName
    if (name.startsWith("mcp__")) {
      const parts = name.split("__");
      return {
        ...base,
        kind: "mcp_call",
        server: parts[1] ?? "unknown",
        toolName: parts.slice(2).join("__"),
        input,
      } satisfies McpActivity;
    }

    switch (name) {
      case "Read":
        return {
          ...base,
          kind: "file_read",
          path: String(input.file_path ?? ""),
        } satisfies FileReadActivity;

      case "Write":
        return {
          ...base,
          kind: "file_write",
          path: String(input.file_path ?? ""),
          isNew: true,
        } satisfies FileWriteActivity;

      case "Edit":
      case "MultiEdit":
        return {
          ...base,
          kind: "file_edit",
          path: String(input.file_path ?? ""),
          oldString:
            typeof input.old_string === "string"
              ? truncate(input.old_string, this.config.editStringMaxChars)
              : undefined,
          newString:
            typeof input.new_string === "string"
              ? truncate(input.new_string, this.config.editStringMaxChars)
              : undefined,
        } satisfies FileEditActivity;

      case "NotebookEdit":
        return {
          ...base,
          kind: "file_edit",
          path: String(input.notebook_path ?? input.file_path ?? ""),
        } satisfies FileEditActivity;

      case "Bash":
        return {
          ...base,
          kind: "bash",
          command: String(input.command ?? ""),
          description: typeof input.description === "string" ? input.description : undefined,
        } satisfies BashActivity;

      case "Grep":
        return {
          ...base,
          kind: "search",
          tool: "grep",
          pattern: String(input.pattern ?? ""),
          scope: typeof input.path === "string" ? input.path : undefined,
        } satisfies SearchActivity;

      case "Glob":
        return {
          ...base,
          kind: "search",
          tool: "glob",
          pattern: String(input.pattern ?? ""),
          scope: typeof input.path === "string" ? input.path : undefined,
        } satisfies SearchActivity;

      case "WebFetch":
        return {
          ...base,
          kind: "fetch",
          url: String(input.url ?? ""),
        } satisfies FetchActivity;

      case "WebSearch":
        return {
          ...base,
          kind: "fetch",
          url: String(input.query ?? ""),
        } satisfies FetchActivity;

      case "Agent":
        return {
          ...base,
          kind: "agent",
          description: typeof input.description === "string" ? input.description : undefined,
          subagentType: typeof input.subagent_type === "string" ? input.subagent_type : undefined,
          prompt:
            typeof input.prompt === "string"
              ? truncate(input.prompt, this.config.agentPromptMaxChars)
              : undefined,
        } satisfies AgentActivity;

      case "TaskCreate":
        return {
          ...base,
          kind: "task",
          operation: "create",
          subject: typeof input.description === "string" ? input.description : undefined,
        } satisfies TaskActivity;

      case "TaskUpdate":
        return {
          ...base,
          kind: "task",
          operation: "update",
          taskId: typeof input.task_id === "string" ? input.task_id : undefined,
          subject: typeof input.status === "string" ? input.status : undefined,
        } satisfies TaskActivity;

      case "TaskGet":
        return {
          ...base,
          kind: "task",
          operation: "get",
          taskId: typeof input.task_id === "string" ? input.task_id : undefined,
        } satisfies TaskActivity;

      case "TaskList":
        return {
          ...base,
          kind: "task",
          operation: "list",
        } satisfies TaskActivity;

      case "AskUserQuestion":
        return {
          ...base,
          kind: "ask_user",
          question: typeof input.question === "string" ? input.question : undefined,
        } satisfies AskUserActivity;

      // Tools that map to unknown but are recognized names
      case "ExitPlanMode":
      case "EnterPlanMode":
      case "EnterWorktree":
      case "ExitWorktree":
      case "Skill":
      case "ToolSearch":
      case "CronCreate":
      case "CronDelete":
      case "CronList":
        return {
          ...base,
          kind: "unknown",
          rawToolName: name,
          rawInput: input,
        } satisfies UnknownActivity;

      default:
        return {
          ...base,
          kind: "unknown",
          rawToolName: name,
          rawInput: input,
        } satisfies UnknownActivity;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private extractSessionMeta(record: RawRecord, isContinuation: boolean): SessionMeta {
    const cwd = record.cwd ?? "";
    const projectName = cwd.split("/").pop() ?? cwd;

    const meta: SessionMeta = {
      id: record.sessionId ?? record.uuid ?? "unknown",
      tool: "claude-code",
      schemaVersion: this.version,
      projectPath: cwd,
      projectName,
      slug: record.slug,
      gitBranch: record.gitBranch,
      startedAt: this.ts(record),
      cliVersion: record.version,
    };

    if (isContinuation) {
      meta.isContinuation = true;
    }

    return meta;
  }

  private extractUserPrompt(content: unknown): string | undefined {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return undefined;

    const textParts: string[] = [];
    for (const item of content) {
      if (typeof item === "object" && item !== null) {
        const ci = item as RawContentItem;
        if (ci.type === "text" && ci.text) {
          textParts.push(ci.text);
        }
      }
    }
    return textParts.length > 0 ? textParts.join("\n") : undefined;
  }

  private detectAttachments(content: unknown): boolean {
    if (!Array.isArray(content)) return false;
    return content.some((item) => {
      if (typeof item !== "object" || item === null) return false;
      const ci = item as RawContentItem;
      return ci.type === "image";
    });
  }

  /**
   * Extract file paths from structured toolUseResult.filenames.
   * No heuristic parsing — only uses the structured array provided
   * by the Grep/Glob tool infrastructure.
   */
  private extractMatchedFiles(toolUseResult: Record<string, unknown>): string[] | undefined {
    const max = this.config.searchMatchedFilesMax;
    if (max === 0) return undefined;
    if (!Array.isArray(toolUseResult.filenames)) return undefined;

    const filenames = toolUseResult.filenames as unknown[];
    const paths: string[] = [];
    for (const f of filenames) {
      if (typeof f === "string" && f.length > 0) {
        paths.push(f);
        if (paths.length >= max) break;
      }
    }
    return paths.length > 0 ? paths : undefined;
  }

  private accumulateTokens(usage: RawUsage, model?: string): void {
    this.turnTokens.inputTokens += usage.input_tokens ?? 0;
    this.turnTokens.outputTokens += usage.output_tokens ?? 0;
    this.turnTokens.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    this.turnTokens.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    if (model && !this.turnTokens.models.includes(model)) {
      this.turnTokens.models.push(model);
    }
  }

  private isErrorContent(content: unknown): boolean {
    if (typeof content === "string") {
      return content.includes("<tool_use_error>") || content.startsWith("Exit code ");
    }
    return false;
  }

  /** Deterministic timestamp: record's own → last seen → empty string.
   *  Never invents a timestamp — output depends only on log content. */
  private ts(record?: RawRecord): string {
    return record?.timestamp ?? this.lastTimestamp ?? "";
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────

function truncate(s: string, max: number): string | undefined {
  if (max === 0) return undefined;
  if (!Number.isFinite(max) || s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function emptyTokenUsage(): TurnTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    models: [],
  };
}
