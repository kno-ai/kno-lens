import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClaudeCodeParserV1 } from "../../src/parsing/claude-code/ClaudeCodeParserV1.js";
import type { SessionEvent } from "../../src/parsing/events.js";

function parseFixture(fixtureName: string): SessionEvent[] {
  const fixturePath = resolve(__dirname, "../../../../test/fixtures/claude-code", fixtureName);
  const content = readFileSync(fixturePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");

  const parser = new ClaudeCodeParserV1();
  const events: SessionEvent[] = [];
  for (const line of lines) {
    events.push(...parser.parse(line));
  }
  events.push(...parser.end());
  return events;
}

describe("E2E: basic-session.jsonl", () => {
  const events = parseFixture("basic-session.jsonl");

  it("starts with session_start", () => {
    expect(events[0]).toMatchObject({
      type: "session_start",
      meta: {
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        tool: "claude-code",
        projectPath: "/home/dev/projects/rds-manager",
        projectName: "rds-manager",
        gitBranch: "main",
        cliVersion: "2.1.74",
      },
    });
  });

  it("detects the slug", () => {
    const sessionStart = events[0];
    expect(sessionStart).toMatchObject({
      meta: { slug: "warm-crimson-eagle" },
    });
  });

  it("produces exactly one turn", () => {
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts).toHaveLength(1);
    expect(turnStarts[0]).toMatchObject({
      turnId: 1,
      prompt: expect.stringContaining("connection pool exhaustion"),
    });
  });

  it("captures file_read activity from Read tool", () => {
    const reads = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "file_read",
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({
      activity: {
        path: "/home/dev/projects/rds-manager/src/config/database.ts",
      },
    });
  });

  it("captures bash activity from Bash tool", () => {
    const bashes = events.filter((e) => e.type === "activity_start" && e.activity.kind === "bash");
    expect(bashes).toHaveLength(1);
    expect(bashes[0]).toMatchObject({
      activity: {
        command: expect.stringContaining("grep -r"),
      },
    });
  });

  it("captures text_output events", () => {
    const textOutputs = events.filter((e) => e.type === "text_output");
    expect(textOutputs.length).toBeGreaterThanOrEqual(1);
  });

  it("completes activities with results", () => {
    const actEnds = events.filter((e) => e.type === "activity_end");
    expect(actEnds.length).toBeGreaterThanOrEqual(2); // read + bash at minimum
    for (const e of actEnds) {
      if (e.type === "activity_end") {
        expect(["done", "error"]).toContain(e.activity.status);
      }
    }
  });

  it("has turn_end with token totals", () => {
    const turnEnds = events.filter((e) => e.type === "turn_end");
    expect(turnEnds.length).toBeGreaterThanOrEqual(1);
    const last = turnEnds[turnEnds.length - 1];
    if (last?.type === "turn_end") {
      expect(last.tokens.inputTokens).toBeGreaterThan(0);
      expect(last.tokens.outputTokens).toBeGreaterThan(0);
      expect(last.tokens.models).toContain("claude-sonnet-4-6");
    }
  });

  it("ends with session_end", () => {
    expect(events[events.length - 1]).toMatchObject({ type: "session_end" });
  });
});

describe("E2E: multi-turn-with-errors.jsonl", () => {
  const events = parseFixture("multi-turn-with-errors.jsonl");

  it("has two turns (two user prompts)", () => {
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts).toHaveLength(2);
  });

  it("turn 1 prompt is about updating database config", () => {
    const turnStart = events.find((e) => e.type === "turn_start");
    expect(turnStart).toMatchObject({
      turnId: 1,
      prompt: expect.stringContaining("connection pool"),
    });
  });

  it("turn 2 prompt is about running tests", () => {
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts[1]).toMatchObject({
      prompt: expect.stringContaining("test suite"),
    });
  });

  it("captures file_edit activity with old/new strings", () => {
    const edits = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "file_edit",
    );
    expect(edits).toHaveLength(1);
    if (edits[0]?.type === "activity_start" && edits[0].activity.kind === "file_edit") {
      expect(edits[0].activity.oldString).toContain("max: 10");
      expect(edits[0].activity.newString).toContain("RDS_POOL_MAX");
    }
  });

  it("captures file_write for new health-check file", () => {
    const writes = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "file_write",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      activity: {
        path: "/home/dev/projects/rds-manager/src/config/health-check.ts",
      },
    });
  });

  it("marks the Write result as isNew", () => {
    const writeEnds = events.filter(
      (e) => e.type === "activity_end" && e.activity.kind === "file_write",
    );
    expect(writeEnds).toHaveLength(1);
    if (writeEnds[0]?.type === "activity_end" && writeEnds[0].activity.kind === "file_write") {
      expect(writeEnds[0].activity.isNew).toBe(true);
    }
  });

  it("captures bash error with exit code 1", () => {
    const bashEnds = events.filter(
      (e) =>
        e.type === "activity_end" && e.activity.kind === "bash" && e.activity.status === "error",
    );
    expect(bashEnds.length).toBeGreaterThanOrEqual(1);
    if (bashEnds[0]?.type === "activity_end" && bashEnds[0].activity.kind === "bash") {
      expect(bashEnds[0].activity.exitCode).toBe(1);
    }
  });

  it("captures search activity from Grep", () => {
    const searches = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "search",
    );
    expect(searches).toHaveLength(1);
    expect(searches[0]).toMatchObject({
      activity: { tool: "grep", pattern: "concurrent orders" },
    });
  });

  it("has search result count from toolUseResult", () => {
    const searchEnds = events.filter(
      (e) => e.type === "activity_end" && e.activity.kind === "search",
    );
    expect(searchEnds).toHaveLength(1);
    if (searchEnds[0]?.type === "activity_end" && searchEnds[0].activity.kind === "search") {
      expect(searchEnds[0].activity.resultCount).toBe(1);
    }
  });

  it("emits text_output for intermediate assistant text", () => {
    const textOutputs = events.filter((e) => e.type === "text_output");
    expect(textOutputs.length).toBeGreaterThanOrEqual(1);
  });

  it("assigns sequential turnIds", () => {
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts[0]).toMatchObject({ turnId: 1 });
    expect(turnStarts[1]).toMatchObject({ turnId: 2 });
  });
});

describe("E2E: mcp-and-progress.jsonl", () => {
  const events = parseFixture("mcp-and-progress.jsonl");

  it("captures MCP tool calls with server and tool name", () => {
    const mcpStarts = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "mcp_call",
    );
    expect(mcpStarts.length).toBeGreaterThanOrEqual(1);
    expect(mcpStarts[0]).toMatchObject({
      activity: {
        server: "kno",
        toolName: "kno_vault_status",
      },
    });
  });

  it("captures parallel tool calls (MCP + Grep in same message)", () => {
    const mcpStarts = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "mcp_call",
    );
    const searchStarts = events.filter(
      (e) => e.type === "activity_start" && e.activity.kind === "search",
    );
    expect(mcpStarts.length).toBe(2); // vault_status + page_show
    expect(searchStarts.length).toBe(1);
  });

  it("emits progress events for progress records", () => {
    const progresses = events.filter((e) => e.type === "progress");
    expect(progresses.length).toBeGreaterThanOrEqual(1);
  });

  it("emits text_output referencing notification worker", () => {
    const textOutputs = events.filter((e) => e.type === "text_output");
    const hasWorkerRef = textOutputs.some(
      (e) => e.type === "text_output" && e.text.includes("notification-worker.ts"),
    );
    expect(hasWorkerRef).toBe(true);
  });

  it("tracks opus model", () => {
    const turnEnds = events.filter((e) => e.type === "turn_end");
    const hasOpus = turnEnds.some(
      (e) => e.type === "turn_end" && e.tokens.models.includes("claude-opus-4-6"),
    );
    expect(hasOpus).toBe(true);
  });
});
