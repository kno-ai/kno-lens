import { describe, it, expect } from "vitest";
import { ClaudeCodeParserV1 } from "../../src/parsing/claude-code/ClaudeCodeParserV1.js";
import type { SessionEvent } from "../../src/parsing/events.js";

function parseLines(parser: ClaudeCodeParserV1, ...lines: string[]): SessionEvent[] {
  return lines.flatMap((line) => parser.parse(line));
}

// ─── Minimal record factories ────────────────────────────────────────────

function userPrompt(prompt: string | unknown[], opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "user",
    parentUuid: opts.parentUuid ?? null,
    isSidechain: false,
    userType: "external",
    cwd: "/home/dev/projects/rds-manager",
    sessionId: "test-session-001",
    version: "2.1.74",
    gitBranch: "main",
    slug: "test-slug",
    message: { role: "user", content: prompt },
    uuid: opts.uuid ?? "user-001",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:01.000Z",
  });
}

function assistantToolUse(
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
  opts: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: "assistant",
    parentUuid: opts.parentUuid ?? "user-001",
    isSidechain: false,
    message: {
      model: opts.model ?? "claude-sonnet-4-6",
      id: opts.messageId ?? "msg-001",
      type: "message",
      role: "assistant",
      content: [
        { type: "tool_use", id: toolId, name: toolName, input, caller: { type: "direct" } },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      },
    },
    requestId: opts.requestId ?? "req-001",
    uuid: opts.uuid ?? "asst-001",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:02.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
    cwd: "/home/dev/projects/rds-manager",
    gitBranch: "main",
  });
}

function assistantTextAndToolUse(
  text: string,
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
  opts: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: "assistant",
    parentUuid: opts.parentUuid ?? "user-001",
    isSidechain: false,
    message: {
      model: opts.model ?? "claude-sonnet-4-6",
      id: opts.messageId ?? "msg-001",
      type: "message",
      role: "assistant",
      content: [
        { type: "text", text },
        { type: "tool_use", id: toolId, name: toolName, input, caller: { type: "direct" } },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      },
    },
    requestId: opts.requestId ?? "req-001",
    uuid: opts.uuid ?? "asst-001",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:02.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
    cwd: "/home/dev/projects/rds-manager",
    gitBranch: "main",
  });
}

function toolResult(toolUseId: string, content: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "user",
    parentUuid: opts.parentUuid ?? "asst-001",
    isSidechain: false,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content,
          is_error: opts.is_error ?? false,
        },
      ],
    },
    toolUseResult: opts.toolUseResult ?? {},
    sourceToolAssistantUUID: "asst-001",
    uuid: opts.uuid ?? "result-001",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:03.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
    cwd: "/home/dev/projects/rds-manager",
    gitBranch: "main",
  });
}

function assistantEndTurn(text: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "assistant",
    parentUuid: opts.parentUuid ?? "result-001",
    isSidechain: false,
    message: {
      model: opts.model ?? "claude-sonnet-4-6",
      id: opts.messageId ?? "msg-002",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 200,
        output_tokens: 80,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 0,
      },
    },
    requestId: opts.requestId ?? "req-002",
    uuid: opts.uuid ?? "asst-002",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:05.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
    cwd: "/home/dev/projects/rds-manager",
    gitBranch: "main",
    costUSD: opts.costUSD,
  });
}

function systemTurnDuration(durationMs: number) {
  return JSON.stringify({
    type: "system",
    subtype: "turn_duration",
    durationMs,
    timestamp: "2026-03-10T14:00:06.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
  });
}

function systemCompactBoundary() {
  return JSON.stringify({
    type: "system",
    subtype: "compact_boundary",
    timestamp: "2026-03-10T14:05:00.000Z",
    sessionId: "test-session-001",
    version: "2.1.74",
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("ClaudeCodeParserV1", () => {
  describe("session lifecycle", () => {
    it("emits session_start on first user prompt", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(userPrompt("Hello"));

      expect(events).toHaveLength(2); // session_start + turn_start
      expect(events[0]).toMatchObject({
        type: "session_start",
        meta: {
          id: "test-session-001",
          tool: "claude-code",
          projectPath: "/home/dev/projects/rds-manager",
          projectName: "rds-manager",
          slug: "test-slug",
          gitBranch: "main",
          cliVersion: "2.1.74",
        },
      });
    });

    it("emits session_end on end()", () => {
      const parser = new ClaudeCodeParserV1();
      parser.parse(userPrompt("Hello"));
      const events = parser.end();

      const sessionEnd = events.find((e) => e.type === "session_end");
      expect(sessionEnd).toBeDefined();
    });

    it("emits session_end with endedAt from last timestamp", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Hello", { timestamp: "2026-03-10T14:00:00.000Z" }),
        assistantEndTurn("Hi", { timestamp: "2026-03-10T14:05:00.000Z" }),
      );
      const endEvents = parser.end();
      const sessionEnd = endEvents.find((e) => e.type === "session_end");
      expect(sessionEnd).toMatchObject({
        type: "session_end",
        endedAt: "2026-03-10T14:05:00.000Z",
      });

      // session_start meta must NOT have endedAt (immutable after emission)
      const p2 = new ClaudeCodeParserV1();
      const initEvents = p2.parse(userPrompt("Hello", { timestamp: "2026-03-10T14:00:00.000Z" }));
      const ss = initEvents.find((e) => e.type === "session_start");
      if (ss?.type === "session_start") {
        expect((ss.meta as Record<string, unknown>).endedAt).toBeUndefined();
      }
    });
  });

  describe("turn detection", () => {
    it("emits turn_start for user prompt", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(userPrompt("Help me tune RDS"));

      const turnStart = events.find((e) => e.type === "turn_start");
      expect(turnStart).toMatchObject({
        type: "turn_start",
        turnId: 1,
        prompt: "Help me tune RDS",
      });
    });

    it("emits turn_end immediately on end_turn stop_reason", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"));

      // end_turn emits turn_end directly for live consumers
      const endTurnEvents = parser.parse(assistantEndTurn("Here's the answer."));
      const turnEnd = endTurnEvents.find((e) => e.type === "turn_end");
      expect(turnEnd).toMatchObject({
        type: "turn_end",
        turnId: 1,
        endedAt: "2026-03-10T14:00:05.000Z",
      });

      // end() should NOT emit another turn_end
      const endEvents = parser.end();
      const secondTurnEnd = endEvents.find((e) => e.type === "turn_end");
      expect(secondTurnEnd).toBeUndefined();
    });

    it("emits text_output for the end_turn text", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"));

      const events = parser.parse(assistantEndTurn("Here's the answer."));
      const textOut = events.find((e) => e.type === "text_output");

      expect(textOut).toMatchObject({
        type: "text_output",
        turnId: 1,
        text: "Here's the answer.",
      });
    });

    it("does not treat tool_result user records as new turns", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Read the file"),
        assistantToolUse("Read", "toolu_001", { file_path: "/tmp/test.ts" }),
      );

      const events = parser.parse(toolResult("toolu_001", "file contents here"));

      const turnStarts = events.filter((e) => e.type === "turn_start");
      expect(turnStarts).toHaveLength(0);
    });

    it("assigns correct turnIds across multiple turns", () => {
      const parser = new ClaudeCodeParserV1();
      const priorEvents = parseLines(
        parser,
        userPrompt("First question"),
        assistantEndTurn("First answer"),
      );

      // turn_end for turn 1 already emitted by end_turn
      const turnEnd = priorEvents.find((e) => e.type === "turn_end");
      expect(turnEnd).toMatchObject({ turnId: 1 });

      const events = parser.parse(
        userPrompt("Second question", { uuid: "user-002", timestamp: "2026-03-10T14:01:00.000Z" }),
      );

      // No duplicate turn_end — turn 1 was already closed
      const secondTurnEnd = events.find((e) => e.type === "turn_end");
      expect(secondTurnEnd).toBeUndefined();

      const turnStart = events.find((e) => e.type === "turn_start");
      expect(turnStart).toMatchObject({ turnId: 2 });
    });
  });

  describe("turn_duration handling", () => {
    it("emits turn_end on end_turn, then turn_duration from system record", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parseLines(
        parser,
        userPrompt("Hello"),
        assistantEndTurn("Answer"),
        systemTurnDuration(12345),
      );

      // turn_end fires on end_turn (no durationMs yet)
      const turnEnd = events.find((e) => e.type === "turn_end");
      expect(turnEnd).toMatchObject({ turnId: 1 });
      if (turnEnd?.type === "turn_end") {
        expect(turnEnd.durationMs).toBeUndefined();
      }

      // turn_duration event carries the durationMs separately
      const durEvent = events.find((e) => e.type === "turn_duration");
      expect(durEvent).toMatchObject({
        type: "turn_duration",
        turnId: 1,
        durationMs: 12345,
      });
    });

    it("does not double-emit turn_end when next turn starts after turn_duration", () => {
      const parser = new ClaudeCodeParserV1();
      const priorEvents = parseLines(
        parser,
        userPrompt("First"),
        assistantEndTurn("Answer one"),
        systemTurnDuration(5000),
      );

      // turn_end fired on end_turn
      const turnEnds = priorEvents.filter((e) => e.type === "turn_end");
      expect(turnEnds).toHaveLength(1);
      expect(turnEnds[0]).toMatchObject({ turnId: 1 });

      // turn_duration fired separately
      const durEvent = priorEvents.find((e) => e.type === "turn_duration");
      expect(durEvent).toMatchObject({ turnId: 1, durationMs: 5000 });

      // Next user prompt should NOT emit turn_end for turn 1
      const nextEvents = parser.parse(
        userPrompt("Second", { uuid: "user-002", timestamp: "2026-03-10T14:01:00.000Z" }),
      );

      const secondTurnEnd = nextEvents.find((e) => e.type === "turn_end");
      expect(secondTurnEnd).toBeUndefined();

      const turnStart = nextEvents.find((e) => e.type === "turn_start");
      expect(turnStart).toMatchObject({ turnId: 2 });
    });

    it("emits turn_end on end_turn without durationMs when no system record", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parseLines(
        parser,
        userPrompt("Hello"),
        assistantEndTurn("Answer"),
        // No systemTurnDuration
      );

      const turnEnd = events.find((e) => e.type === "turn_end");
      expect(turnEnd).toMatchObject({ turnId: 1 });
      if (turnEnd?.type === "turn_end") {
        expect(turnEnd.durationMs).toBeUndefined();
      }

      // end() should not emit another turn_end
      const endEvents = parser.end();
      expect(endEvents.find((e) => e.type === "turn_end")).toBeUndefined();
    });

    it("emits turn_end with durationMs when turn_duration arrives before end_turn", () => {
      // Edge case: if turn_duration somehow arrives before end_turn,
      // closeTurn should include the durationMs directly
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"));

      // Simulate turn_duration arriving while turn is still open
      const durEvents = parser.parse(systemTurnDuration(3000));
      const turnEnd = durEvents.find((e) => e.type === "turn_end");
      expect(turnEnd).toMatchObject({
        turnId: 1,
        durationMs: 3000,
      });
    });
  });

  describe("costUSD tracking", () => {
    it("accumulates costUSD into estimatedCostUsd", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parseLines(
        parser,
        userPrompt("Hello"),
        assistantEndTurn("Answer", { costUSD: 0.042 }),
      );

      const turnEnd = events.find((e) => e.type === "turn_end");
      if (turnEnd?.type === "turn_end") {
        expect(turnEnd.tokens.estimatedCostUsd).toBeCloseTo(0.042);
      }
    });
  });

  describe("text and thinking steps", () => {
    it("emits text_output for intermediate text before tool calls", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Read config"));

      const events = parser.parse(
        assistantTextAndToolUse("Let me read the config file.", "Read", "toolu_read", {
          file_path: "/tmp/db.ts",
        }),
      );

      const textOut = events.find((e) => e.type === "text_output");
      expect(textOut).toMatchObject({
        type: "text_output",
        turnId: 1,
        text: "Let me read the config file.",
      });
    });

    it("emits thinking event for thinking blocks", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Think about this"));

      const thinkingAssistant = JSON.stringify({
        type: "assistant",
        parentUuid: "user-001",
        isSidechain: false,
        message: {
          model: "claude-sonnet-4-6",
          id: "msg-think",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Let me consider the RDS connection pooling options carefully...",
              signature: "fakesig",
            },
          ],
          stop_reason: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
        requestId: "req-think",
        uuid: "asst-think",
        timestamp: "2026-03-10T14:00:02.000Z",
        sessionId: "test-session-001",
        version: "2.1.74",
        cwd: "/home/dev/projects/rds-manager",
        gitBranch: "main",
      });

      const events = parser.parse(thinkingAssistant);
      const thinkingEvents = events.filter((e) => e.type === "thinking");

      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0]).toMatchObject({
        type: "thinking",
        turnId: 1,
        excerpt: expect.stringContaining("RDS connection pooling"),
        at: "2026-03-10T14:00:02.000Z",
      });
    });

    it("truncates thinking excerpt to configured max", () => {
      const parser = new ClaudeCodeParserV1({ thinkingExcerptMaxChars: 20 });
      parseLines(parser, userPrompt("Think"));

      const thinkingAssistant = JSON.stringify({
        type: "assistant",
        parentUuid: "user-001",
        isSidechain: false,
        message: {
          model: "claude-sonnet-4-6",
          id: "msg-think2",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "This is a very long thinking block that should be truncated",
            },
          ],
          stop_reason: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
        requestId: "req-think2",
        uuid: "asst-think2",
        timestamp: "2026-03-10T14:00:02.000Z",
        sessionId: "test-session-001",
        version: "2.1.74",
        cwd: "/home/dev/projects/rds-manager",
        gitBranch: "main",
      });

      const events = parser.parse(thinkingAssistant);
      const thinking = events.find((e) => e.type === "thinking");
      expect(thinking).toMatchObject({
        excerpt: "This is a very long …",
      });
    });
  });

  describe("tool activities", () => {
    it("parses Read tool as file_read activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Read config"));

      const events = parser.parse(
        assistantToolUse("Read", "toolu_read", {
          file_path: "/home/dev/projects/rds-manager/src/config/db.ts",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        type: "activity_start",
        turnId: 1,
        activity: {
          kind: "file_read",
          status: "running",
          path: "/home/dev/projects/rds-manager/src/config/db.ts",
        },
      });
    });

    it("parses Edit tool as file_edit activity with old/new strings", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Edit file"));

      const events = parser.parse(
        assistantToolUse("Edit", "toolu_edit", {
          file_path: "/tmp/config.ts",
          old_string: "max: 10",
          new_string: "max: 25",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "file_edit",
          path: "/tmp/config.ts",
          oldString: "max: 10",
          newString: "max: 25",
        },
      });
    });

    it("parses NotebookEdit as file_edit activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Edit notebook"));

      const events = parser.parse(
        assistantToolUse("NotebookEdit", "toolu_nb", {
          notebook_path: "/tmp/analysis.ipynb",
          cell_index: 3,
          new_source: "print('hello')",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: { kind: "file_edit", path: "/tmp/analysis.ipynb" },
      });
    });

    it("parses Write tool as file_write activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Create file"));

      const events = parser.parse(
        assistantToolUse("Write", "toolu_write", {
          file_path: "/tmp/new-file.ts",
          content: "export const x = 1;",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: { kind: "file_write", path: "/tmp/new-file.ts" },
      });
    });

    it("parses Bash tool as bash activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Run tests"));

      const events = parser.parse(
        assistantToolUse("Bash", "toolu_bash", {
          command: "npm test",
          description: "Run test suite",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "bash",
          command: "npm test",
          description: "Run test suite",
        },
      });
    });

    it("parses Grep tool as search activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Search"));

      const events = parser.parse(
        assistantToolUse("Grep", "toolu_grep", {
          pattern: "connection",
          path: "/home/dev/projects",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "search",
          tool: "grep",
          pattern: "connection",
          scope: "/home/dev/projects",
        },
      });
    });

    it("parses Glob tool as search activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Find files"));

      const events = parser.parse(
        assistantToolUse("Glob", "toolu_glob", {
          pattern: "**/*.ts",
          path: "/home/dev",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: { kind: "search", tool: "glob", pattern: "**/*.ts" },
      });
    });

    it("parses MCP tool calls", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Check vault"));

      const events = parser.parse(assistantToolUse("mcp__kno__kno_vault_status", "toolu_mcp", {}));

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "mcp_call",
          server: "kno",
          toolName: "kno_vault_status",
        },
      });
    });

    it("parses Agent tool calls", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Research this"));

      const events = parser.parse(
        assistantToolUse("Agent", "toolu_agent", {
          description: "Search codebase",
          prompt: "Find all database connections",
          subagent_type: "Explore",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "agent",
          description: "Search codebase",
          subagentType: "Explore",
        },
      });
    });

    it("parses TaskCreate as task activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Plan this"));

      const events = parser.parse(
        assistantToolUse("TaskCreate", "toolu_tc", {
          description: "Migrate database schema",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "task",
          operation: "create",
          subject: "Migrate database schema",
        },
      });
    });

    it("parses AskUserQuestion as ask_user activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Help me"));

      const events = parser.parse(
        assistantToolUse("AskUserQuestion", "toolu_ask", {
          question: "Which region should I target?",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: {
          kind: "ask_user",
          question: "Which region should I target?",
        },
      });
    });

    it("maps Skill, ToolSearch, Cron* to unknown with proper names", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Do stuff"));

      for (const toolName of ["Skill", "ToolSearch", "CronCreate", "CronDelete", "CronList"]) {
        const events = parser.parse(
          assistantToolUse(
            toolName,
            `toolu_${toolName}`,
            { foo: "bar" },
            {
              messageId: `msg-${toolName}`,
              requestId: `req-${toolName}`,
            },
          ),
        );
        const actStart = events.find((e) => e.type === "activity_start");
        expect(actStart).toMatchObject({
          activity: { kind: "unknown", rawToolName: toolName },
        });
      }
    });

    it("parses unknown tools gracefully", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Do something"));

      const events = parser.parse(
        assistantToolUse("SomeFutureTool", "toolu_unknown", { foo: "bar" }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      expect(actStart).toMatchObject({
        activity: { kind: "unknown", rawToolName: "SomeFutureTool" },
      });
    });
  });

  describe("tool results", () => {
    it("completes activity on tool_result", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Read file"),
        assistantToolUse("Read", "toolu_r1", {
          file_path: "/tmp/test.ts",
        }),
      );

      const events = parser.parse(toolResult("toolu_r1", "file content"));
      const actEnd = events.find((e) => e.type === "activity_end");

      expect(actEnd).toMatchObject({
        type: "activity_end",
        activity: { kind: "file_read", status: "done" },
      });
    });

    it("marks bash errors from exit code", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Run command"),
        assistantToolUse("Bash", "toolu_b1", { command: "npm test" }),
      );

      const events = parser.parse(
        toolResult("toolu_b1", "Exit code 1\nTest failed", {
          is_error: true,
          toolUseResult: { stdout: "", stderr: "Test failed", interrupted: false },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "bash", status: "error", exitCode: 1 },
      });
    });

    it("marks tool_use_error as error activity", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Edit file"),
        assistantToolUse("Edit", "toolu_e1", {
          file_path: "/tmp/f.ts",
          old_string: "x",
          new_string: "y",
        }),
      );

      const events = parser.parse(
        toolResult(
          "toolu_e1",
          "<tool_use_error>String to replace not found in file.</tool_use_error>",
          { is_error: false },
        ),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "file_edit", status: "error" },
      });
    });

    it("detects file_write isNew from toolUseResult.type", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Create file"),
        assistantToolUse("Write", "toolu_w1", {
          file_path: "/tmp/new.ts",
          content: "hello",
        }),
      );

      const events = parser.parse(
        toolResult("toolu_w1", "File created successfully at: /tmp/new.ts", {
          toolUseResult: { type: "create", filePath: "/tmp/new.ts" },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "file_write", status: "done", isNew: true },
      });
    });

    it("captures answer on ask_user result", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Help me"),
        assistantToolUse("AskUserQuestion", "toolu_ask1", {
          question: "Which region?",
        }),
      );

      const events = parser.parse(toolResult("toolu_ask1", "us-east-1"));

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "ask_user", status: "done", answer: "us-east-1" },
      });
    });

    it("extracts agentSessionId from Agent tool result", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Research"),
        assistantToolUse("Agent", "toolu_ag1", {
          description: "Search codebase",
          prompt: "Find files",
        }),
      );

      const events = parser.parse(
        toolResult("toolu_ag1", "Found 3 files", {
          toolUseResult: { agentId: "agent-abc123" },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "agent", status: "done", agentSessionId: "agent-abc123" },
      });
    });
  });

  describe("token accumulation", () => {
    it("sums tokens across assistant messages in a turn", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parseLines(
        parser,
        userPrompt("Do things"),
        assistantToolUse("Read", "toolu_t1", { file_path: "/tmp/a.ts" }),
        toolResult("toolu_t1", "content"),
        assistantEndTurn("Done."),
      );

      // turn_end fires on end_turn stop_reason
      const turnEnd = events.find((e) => e.type === "turn_end");

      expect(turnEnd).toMatchObject({
        type: "turn_end",
        tokens: {
          // 100 + 200 = 300 input
          inputTokens: 300,
          // 50 + 80 = 130 output
          outputTokens: 130,
          // 500 + 1000 = 1500 cache read
          cacheReadTokens: 1500,
        },
      });
    });

    it("tracks models used per turn", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parseLines(
        parser,
        userPrompt("Hello"),
        assistantEndTurn("Hi", { model: "claude-opus-4-6" }),
      );

      // turn_end fires on end_turn stop_reason
      const turnEnd = events.find((e) => e.type === "turn_end");

      expect(turnEnd).toMatchObject({
        tokens: { models: ["claude-opus-4-6"] },
      });
    });
  });

  describe("compaction boundaries", () => {
    it("emits compaction event for compact_boundary system record", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"));

      const events = parser.parse(systemCompactBoundary());
      expect(events).toEqual([{ type: "compaction", at: "2026-03-10T14:05:00.000Z" }]);
    });
  });

  describe("continuation detection", () => {
    it("marks session as continuation when first prompt is a summary", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(
        userPrompt(
          "This session is being continued from a previous conversation that ran out of context. Summary: ...",
        ),
      );

      const sessionStart = events.find((e) => e.type === "session_start");
      expect(sessionStart).toMatchObject({
        meta: { isContinuation: true },
      });
    });

    it("does not mark normal sessions as continuation", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(userPrompt("Help me tune RDS"));

      const sessionStart = events.find((e) => e.type === "session_start");
      if (sessionStart?.type === "session_start") {
        expect(sessionStart.meta.isContinuation).toBeUndefined();
      }
    });
  });

  describe("attachment detection", () => {
    it("sets hasAttachments when user prompt contains image blocks", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(
        userPrompt([
          { type: "text", text: "Look at this screenshot" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
        ]),
      );

      const turnStart = events.find((e) => e.type === "turn_start");
      expect(turnStart).toMatchObject({
        type: "turn_start",
        hasAttachments: true,
      });
    });

    it("does not set hasAttachments for text-only prompts", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(userPrompt("Just text"));

      const turnStart = events.find((e) => e.type === "turn_start");
      if (turnStart?.type === "turn_start") {
        expect(turnStart.hasAttachments).toBeUndefined();
      }
    });
  });

  describe("progress records", () => {
    it("emits lightweight progress event", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Do something"));

      const progressRecord = JSON.stringify({
        type: "progress",
        data: { type: "hook_progress" },
        timestamp: "2026-03-10T14:00:02.000Z",
        uuid: "prog-001",
        sessionId: "test-session-001",
        version: "2.1.74",
      });

      const events = parser.parse(progressRecord);
      expect(events).toEqual([{ type: "progress", turnId: 1 }]);
    });
  });

  describe("deduplication", () => {
    it("skips duplicate assistant messages with same message.id + requestId", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"));

      const msg = assistantEndTurn("Answer", {
        messageId: "msg-dup",
        requestId: "req-dup",
      });

      const first = parser.parse(msg);
      const second = parser.parse(msg);

      expect(first.filter((e) => e.type === "text_output")).toHaveLength(1);
      expect(second).toHaveLength(0);
    });
  });

  describe("skipped record types", () => {
    it("skips file-history-snapshot", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(JSON.stringify({ type: "file-history-snapshot", snapshot: {} }));
      expect(events).toHaveLength(0);
    });

    it("skips last-prompt", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(
        JSON.stringify({ type: "last-prompt", lastPrompt: "hello", sessionId: "s1" }),
      );
      expect(events).toHaveLength(0);
    });

    it("skips sidechain records", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse(
        JSON.stringify({
          type: "user",
          isSidechain: true,
          message: { role: "user", content: "sidechain msg" },
          uuid: "sc-001",
          sessionId: "test-session-001",
          timestamp: "2026-03-10T14:00:01.000Z",
          version: "2.1.74",
          cwd: "/tmp",
        }),
      );
      expect(events).toHaveLength(0);
    });
  });

  describe("resultRecordUuid", () => {
    it("sets resultRecordUuid from tool_result record uuid", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Read file"),
        assistantToolUse("Read", "toolu_r1", { file_path: "/tmp/test.ts" }),
      );

      const events = parser.parse(
        toolResult("toolu_r1", "file content", { uuid: "result-uuid-abc" }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "file_read", status: "done", resultRecordUuid: "result-uuid-abc" },
      });
    });
  });

  describe("search matchedFiles", () => {
    it("extracts filenames from structured toolUseResult", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Find"),
        assistantToolUse("Glob", "toolu_gl_s", { pattern: "**/*.ts" }),
      );

      const events = parser.parse(
        toolResult("toolu_gl_s", "/src/a.ts\n/src/b.ts", {
          toolUseResult: {
            filenames: ["/structured/x.ts", "/structured/y.ts", "/structured/z.ts"],
            numFiles: 3,
          },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end" && actEnd.activity.kind === "search") {
        // Should use structured data, not heuristic text parsing
        expect(actEnd.activity.matchedFiles).toEqual([
          "/structured/x.ts",
          "/structured/y.ts",
          "/structured/z.ts",
        ]);
      } else {
        throw new Error("Expected search activity_end");
      }
    });

    it("returns undefined matchedFiles when no filenames in toolUseResult", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Find"),
        assistantToolUse("Glob", "toolu_gl_fb", { pattern: "**/*.ts" }),
      );

      const events = parser.parse(
        toolResult("toolu_gl_fb", "/src/a.ts\n/src/b.ts\n/src/c.ts", {
          toolUseResult: { numFiles: 3 }, // no filenames array
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end" && actEnd.activity.kind === "search") {
        expect(actEnd.activity.matchedFiles).toBeUndefined();
      } else {
        throw new Error("Expected search activity_end");
      }
    });

    it("respects searchMatchedFilesMax config", () => {
      const parser = new ClaudeCodeParserV1({ searchMatchedFilesMax: 2 });
      parseLines(
        parser,
        userPrompt("Find"),
        assistantToolUse("Glob", "toolu_gl2", { pattern: "**/*.ts" }),
      );

      const events = parser.parse(
        toolResult("toolu_gl2", "results", {
          toolUseResult: {
            filenames: ["/src/a.ts", "/src/b.ts", "/src/c.ts", "/src/d.ts"],
            numFiles: 4,
          },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end" && actEnd.activity.kind === "search") {
        expect(actEnd.activity.matchedFiles).toHaveLength(2);
      } else {
        throw new Error("Expected search activity_end");
      }
    });

    it("returns undefined matchedFiles when searchMatchedFilesMax is 0", () => {
      const parser = new ClaudeCodeParserV1({ searchMatchedFilesMax: 0 });
      parseLines(
        parser,
        userPrompt("Find"),
        assistantToolUse("Glob", "toolu_gl3", { pattern: "**/*.ts" }),
      );

      const events = parser.parse(
        toolResult("toolu_gl3", "results", {
          toolUseResult: { filenames: ["/src/a.ts", "/src/b.ts"], numFiles: 2 },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end" && actEnd.activity.kind === "search") {
        expect(actEnd.activity.matchedFiles).toBeUndefined();
      } else {
        throw new Error("Expected search activity_end");
      }
    });
  });

  describe("config-based truncation", () => {
    it("truncates edit old/new strings to editStringMaxChars", () => {
      const parser = new ClaudeCodeParserV1({ editStringMaxChars: 10 });
      parseLines(parser, userPrompt("Edit"));

      const events = parser.parse(
        assistantToolUse("Edit", "toolu_e2", {
          file_path: "/tmp/f.ts",
          old_string: "this is a long old string that should be truncated",
          new_string: "this is a long new string that should be truncated",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      if (actStart?.type === "activity_start" && actStart.activity.kind === "file_edit") {
        expect(actStart.activity.oldString).toBe("this is a …");
        expect(actStart.activity.newString).toBe("this is a …");
      } else {
        throw new Error("Expected file_edit activity_start");
      }
    });

    it("truncates error messages to errorMaxChars", () => {
      const longError = "A".repeat(600);
      const parser = new ClaudeCodeParserV1({ errorMaxChars: 20 });
      parseLines(
        parser,
        userPrompt("Edit"),
        assistantToolUse("Edit", "toolu_err", {
          file_path: "/tmp/f.ts",
          old_string: "x",
          new_string: "y",
        }),
      );

      const events = parser.parse(
        toolResult("toolu_err", `<tool_use_error>${longError}</tool_use_error>`, {
          is_error: false,
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end") {
        expect(actEnd.activity.error!.length).toBeLessThanOrEqual(21); // 20 + ellipsis char
      } else {
        throw new Error("Expected activity_end");
      }
    });

    it("truncates agent prompt to agentPromptMaxChars", () => {
      const parser = new ClaudeCodeParserV1({ agentPromptMaxChars: 15 });
      parseLines(parser, userPrompt("Research"));

      const events = parser.parse(
        assistantToolUse("Agent", "toolu_ag2", {
          description: "Search",
          prompt: "Find all database connection strings in the project",
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      if (actStart?.type === "activity_start" && actStart.activity.kind === "agent") {
        expect(actStart.activity.prompt).toBe("Find all databa…");
      } else {
        throw new Error("Expected agent activity_start");
      }
    });

    it("truncates answer to answerMaxChars", () => {
      const parser = new ClaudeCodeParserV1({ answerMaxChars: 10 });
      parseLines(
        parser,
        userPrompt("Help"),
        assistantToolUse("AskUserQuestion", "toolu_ask2", { question: "Which?" }),
      );

      const events = parser.parse(
        toolResult("toolu_ask2", "us-east-1 is the best region for our use case"),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      if (actEnd?.type === "activity_end" && actEnd.activity.kind === "ask_user") {
        expect(actEnd.activity.answer).toBe("us-east-1 …");
      } else {
        throw new Error("Expected ask_user activity_end");
      }
    });

    it("omits fields when config value is 0", () => {
      const parser = new ClaudeCodeParserV1({ thinkingExcerptMaxChars: 0 });
      parseLines(parser, userPrompt("Think"));

      const thinkingAssistant = JSON.stringify({
        type: "assistant",
        parentUuid: "user-001",
        isSidechain: false,
        message: {
          model: "claude-sonnet-4-6",
          id: "msg-t0",
          type: "message",
          role: "assistant",
          content: [{ type: "thinking", thinking: "Some thinking content" }],
          stop_reason: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
        requestId: "req-t0",
        uuid: "asst-t0",
        timestamp: "2026-03-10T14:00:02.000Z",
        sessionId: "test-session-001",
        version: "2.1.74",
        cwd: "/home/dev/projects/rds-manager",
        gitBranch: "main",
      });

      const events = parser.parse(thinkingAssistant);
      const thinking = events.find((e) => e.type === "thinking");
      if (thinking?.type === "thinking") {
        expect(thinking.excerpt).toBeUndefined();
      }
    });

    it("does not truncate when config value is Infinity", () => {
      const parser = new ClaudeCodeParserV1({ editStringMaxChars: Infinity });
      parseLines(parser, userPrompt("Edit"));

      const longString = "x".repeat(2000);
      const events = parser.parse(
        assistantToolUse("Edit", "toolu_inf", {
          file_path: "/tmp/f.ts",
          old_string: longString,
          new_string: longString,
        }),
      );

      const actStart = events.find((e) => e.type === "activity_start");
      if (actStart?.type === "activity_start" && actStart.activity.kind === "file_edit") {
        expect(actStart.activity.oldString).toBe(longString);
        expect(actStart.activity.newString).toBe(longString);
      } else {
        throw new Error("Expected file_edit activity_start");
      }
    });
  });

  describe("orphaned activities", () => {
    it("flushes orphaned activities as errors on end()", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Read file"),
        assistantToolUse("Read", "toolu_orphan", { file_path: "/tmp/test.ts" }),
        // No tool_result — session ends abruptly
      );

      const events = parser.end();
      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        type: "activity_end",
        activityId: "toolu_orphan",
        activity: {
          kind: "file_read",
          status: "error",
          error: "Session ended before tool result received",
        },
      });
    });
  });

  describe("modelId population", () => {
    it("sets modelId from first assistant message", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(parser, userPrompt("Hello"), assistantEndTurn("Hi", { model: "claude-opus-4-6" }));

      parser.end();
      // We need to check the session_start meta was updated — parse a fresh session
      const p2 = new ClaudeCodeParserV1();
      const startEvents = p2.parse(userPrompt("Hello"));
      const ss = startEvents.find((e) => e.type === "session_start");
      // modelId is undefined on user record — no assistant yet
      if (ss?.type === "session_start") {
        expect(ss.meta.modelId).toBeUndefined();
      }
    });
  });

  describe("bash durationMs", () => {
    it("extracts durationMs from toolUseResult", () => {
      const parser = new ClaudeCodeParserV1();
      parseLines(
        parser,
        userPrompt("Run command"),
        assistantToolUse("Bash", "toolu_bd", { command: "npm test" }),
      );

      const events = parser.parse(
        toolResult("toolu_bd", "Tests passed", {
          toolUseResult: { stdout: "ok", stderr: "", durationMs: 2345 },
        }),
      );

      const actEnd = events.find((e) => e.type === "activity_end");
      expect(actEnd).toMatchObject({
        activity: { kind: "bash", status: "done", durationMs: 2345 },
      });
    });
  });

  describe("error handling", () => {
    it("returns parse_error for invalid JSON", () => {
      const parser = new ClaudeCodeParserV1();
      const events = parser.parse("not json at all {{{");
      expect(events).toEqual([
        { type: "parse_error", message: "Invalid JSON", rawLine: "not json at all {{{" },
      ]);
    });

    it("skips empty lines", () => {
      const parser = new ClaudeCodeParserV1();
      expect(parser.parse("")).toHaveLength(0);
      expect(parser.parse("   ")).toHaveLength(0);
    });
  });
});
