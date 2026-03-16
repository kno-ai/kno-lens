import { describe, it, expect } from "vitest";
import { ClaudeCodeParserV1 } from "../src/parsing/claude-code/ClaudeCodeParserV1.js";
import { SessionBuilder } from "../src/SessionBuilder.js";
import type { SessionEvent } from "../src/parsing/events.js";

function parseAll(parser: ClaudeCodeParserV1, ...lines: string[]): SessionEvent[] {
  const events = lines.flatMap((line) => parser.parse(line));
  events.push(...parser.end());
  return events;
}

function userPrompt(prompt: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "user",
    parentUuid: opts.parentUuid ?? null,
    isSidechain: false,
    userType: "external",
    cwd: "/home/dev/project",
    sessionId: "test-session",
    version: "2.1.74",
    gitBranch: "main",
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
      id: opts.messageId ?? `msg-${toolId}`,
      type: "message",
      role: "assistant",
      content: [{ type: "tool_use", id: toolId, name: toolName, input }],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      },
    },
    requestId: `req-${toolId}`,
    uuid: `asst-${toolId}`,
    timestamp: opts.timestamp ?? "2026-03-10T14:00:02.000Z",
    sessionId: "test-session",
    version: "2.1.74",
    cwd: "/home/dev/project",
    gitBranch: "main",
  });
}

function toolResult(toolUseId: string, content: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "user",
    parentUuid: opts.parentUuid ?? `asst-${toolUseId}`,
    isSidechain: false,
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: toolUseId, content, is_error: opts.is_error ?? false },
      ],
    },
    toolUseResult: opts.toolUseResult ?? {},
    uuid: opts.uuid ?? `result-${toolUseId}`,
    timestamp: opts.timestamp ?? "2026-03-10T14:00:03.000Z",
    sessionId: "test-session",
    version: "2.1.74",
    cwd: "/home/dev/project",
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
      id: opts.messageId ?? "msg-end",
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
    requestId: "req-end",
    uuid: "asst-end",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:05.000Z",
    sessionId: "test-session",
    version: "2.1.74",
    cwd: "/home/dev/project",
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
    sessionId: "test-session",
    version: "2.1.74",
  });
}

describe("SessionBuilder", () => {
  it("builds a complete session from events", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Read config"),
      assistantToolUse("Read", "toolu_r1", { file_path: "/tmp/db.ts" }),
      toolResult("toolu_r1", "file content"),
      assistantEndTurn("Here's what I found."),
      systemTurnDuration(5000),
    );

    const session = SessionBuilder.from(events);

    expect(session.meta.id).toBe("test-session");
    expect(session.meta.tool).toBe("claude-code");
    expect(session.status).toBe("ended");
    expect(session.turns).toHaveLength(1);
  });

  it("assembles ordered TurnSteps", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Read config"),
      assistantToolUse("Read", "toolu_r1", { file_path: "/tmp/db.ts" }),
      toolResult("toolu_r1", "file content"),
      assistantEndTurn("Here's what I found."),
    );

    const session = SessionBuilder.from(events);
    const steps = session.turns[0]!.steps;

    // activity_start → activity_end → text_output
    expect(steps).toHaveLength(2); // activity + text
    expect(steps[0]!.kind).toBe("activity");
    expect(steps[1]!.kind).toBe("text");
  });

  it("updates activities with completed status", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Read file"),
      assistantToolUse("Read", "toolu_r1", { file_path: "/tmp/test.ts" }),
      toolResult("toolu_r1", "contents"),
      assistantEndTurn("Done."),
    );

    const session = SessionBuilder.from(events);
    const actStep = session.turns[0]!.steps.find((s) => s.kind === "activity");
    if (actStep?.kind === "activity") {
      expect(actStep.activity.status).toBe("done");
    } else {
      throw new Error("Expected activity step");
    }
  });

  it("computes SessionStats", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Work"),
      assistantToolUse("Read", "toolu_r1", { file_path: "/tmp/a.ts" }),
      toolResult("toolu_r1", "contents"),
      assistantToolUse(
        "Write",
        "toolu_w1",
        { file_path: "/tmp/b.ts", content: "x" },
        { messageId: "msg-w1", requestId: "req-w1" },
      ),
      toolResult("toolu_w1", "File created", { toolUseResult: { type: "create" } }),
      assistantToolUse(
        "Bash",
        "toolu_b1",
        { command: "npm test" },
        { messageId: "msg-b1", requestId: "req-b1" },
      ),
      toolResult("toolu_b1", "Tests passed", { toolUseResult: { stdout: "ok" } }),
      assistantEndTurn("All done.", { costUSD: 0.05 }),
      systemTurnDuration(3000),
    );

    const session = SessionBuilder.from(events);

    expect(session.stats.totalTurns).toBe(1);
    expect(session.stats.completedTurns).toBe(1);
    expect(session.stats.filesRead).toEqual(["/tmp/a.ts"]);
    expect(session.stats.filesWritten).toEqual(["/tmp/b.ts"]);
    expect(session.stats.commandsRun).toBe(1);
    expect(session.stats.totalInputTokens).toBeGreaterThan(0);
    expect(session.stats.totalOutputTokens).toBeGreaterThan(0);
    expect(session.stats.activeDurationMs).toBe(3000);
  });

  it("handles multi-turn sessions", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("First"),
      assistantEndTurn("Answer 1"),
      systemTurnDuration(1000),
      userPrompt("Second", { uuid: "user-002", timestamp: "2026-03-10T14:01:00.000Z" }),
      assistantEndTurn("Answer 2", { messageId: "msg-end-2", requestId: "req-end-2" }),
      systemTurnDuration(2000),
    );

    const session = SessionBuilder.from(events);

    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]!.id).toBe(1);
    expect(session.turns[1]!.id).toBe(2);
    expect(session.stats.totalTurns).toBe(2);
    expect(session.stats.completedTurns).toBe(2);
    expect(session.stats.activeDurationMs).toBe(3000);
  });

  it("counts errors in stats", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Run"),
      assistantToolUse("Bash", "toolu_b1", { command: "bad-cmd" }),
      toolResult("toolu_b1", "Exit code 1\nCommand not found", { is_error: true }),
      assistantEndTurn("That failed."),
    );

    const session = SessionBuilder.from(events);

    expect(session.stats.errorCount).toBe(1);
    expect(session.turns[0]!.errorCount).toBe(1);
  });

  it("counts filesDeleted for bash commands matching delete patterns", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Clean up"),
      assistantToolUse("Bash", "toolu_d1", { command: "rm -rf dist" }),
      toolResult("toolu_d1", ""),
      assistantToolUse("Bash", "toolu_d2", { command: "git rm old-file.ts" }),
      toolResult("toolu_d2", "rm 'old-file.ts'"),
      assistantToolUse("Bash", "toolu_d3", { command: "npm test" }),
      toolResult("toolu_d3", "Tests passed"),
      assistantEndTurn("Cleaned up."),
    );

    const session = SessionBuilder.from(events);

    expect(session.stats.filesDeleted).toBe(2); // rm and git rm, not npm test
    expect(session.stats.commandsRun).toBe(3); // all three are commands
  });

  it("sets endedAt on session meta", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Hello"),
      assistantEndTurn("Hi", { timestamp: "2026-03-10T14:05:00.000Z" }),
    );

    const session = SessionBuilder.from(events);

    expect(session.endedAt).toBe("2026-03-10T14:05:00.000Z");
  });

  it("computes wallClockDurationMs from start/end timestamps", () => {
    const parser = new ClaudeCodeParserV1();
    const events = parseAll(
      parser,
      userPrompt("Hello", { timestamp: "2026-03-10T14:00:00.000Z" }),
      assistantEndTurn("Hi", { timestamp: "2026-03-10T14:10:00.000Z" }),
    );

    const session = SessionBuilder.from(events);

    // 10 minutes = 600,000ms
    expect(session.stats.wallClockDurationMs).toBe(600_000);
  });

  it("throws when no session_start event", () => {
    expect(() => SessionBuilder.from([])).toThrow("No session_start event received");
  });
});
