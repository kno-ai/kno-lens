import { describe, it, expect } from "vitest";
import { searchSnapshot } from "../src/search.js";
import type { SessionSnapshot, TurnSummary } from "@kno-lens/view";

function makeSummary(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    turnId: 1,
    prompt: "default prompt",
    items: [],
    stats: {
      filesCreated: 0,
      filesEdited: 0,
      filesRead: 0,
      commandsRun: 0,
      commandsFailed: 0,
      searchesRun: 0,
      errors: 0,
    },
    ...overrides,
  };
}

function makeSnapshot(summaries: Record<number, TurnSummary>): SessionSnapshot {
  return {
    session: {
      id: "test-session",
      status: "done",
      turns: [],
    } as any,
    summaries,
    summaryConfigVersion: "1.0.0",
  };
}

describe("searchSnapshot", () => {
  it("finds matches in prompts", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "Fix the login bug" }),
    });
    const results = searchSnapshot(snapshot, "login");
    expect(results.size).toBe(1);
    const result = results.get(1)!;
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0]!.source).toBe("prompt");
    expect(result.snippets[0]!.match).toBe("login");
  });

  it("finds matches in item labels", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({
        turnId: 1,
        prompt: "do something",
        items: [
          {
            importance: "high",
            category: "file_edited",
            label: "Edited src/auth.ts",
            activityIds: ["a1"],
          },
        ],
      }),
    });
    const results = searchSnapshot(snapshot, "auth");
    expect(results.size).toBe(1);
    const snippets = results.get(1)!.snippets;
    expect(snippets.some((s) => s.source === "label")).toBe(true);
    expect(snippets.find((s) => s.source === "label")!.match).toBe("auth");
  });

  it("finds matches in item details", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({
        turnId: 1,
        prompt: "run tests",
        items: [
          {
            importance: "medium",
            category: "bash",
            label: "Ran command",
            detail: "npm run test:unit",
            activityIds: ["a1"],
          },
        ],
      }),
    });
    const results = searchSnapshot(snapshot, "unit");
    expect(results.size).toBe(1);
    const snippets = results.get(1)!.snippets;
    expect(snippets.some((s) => s.source === "detail")).toBe(true);
    expect(snippets.find((s) => s.source === "detail")!.match).toBe("unit");
  });

  it("is case-insensitive", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "Fix the Login Bug" }),
    });
    const results = searchSnapshot(snapshot, "login");
    expect(results.size).toBe(1);
    // The match preserves original case from the text
    expect(results.get(1)!.snippets[0]!.match).toBe("Login");
  });

  it("returns empty map for empty query", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "some prompt" }),
    });
    expect(searchSnapshot(snapshot, "").size).toBe(0);
    expect(searchSnapshot(snapshot, "   ").size).toBe(0);
  });

  it("returns empty map when no matches", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "Fix the bug" }),
    });
    const results = searchSnapshot(snapshot, "zzzznotfound");
    expect(results.size).toBe(0);
  });

  it("snippets have correct before/match/after structure", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "Please fix the login bug now" }),
    });
    const results = searchSnapshot(snapshot, "login");
    const snippet = results.get(1)!.snippets[0]!;
    expect(snippet.before).toBe("Please fix the ");
    expect(snippet.match).toBe("login");
    expect(snippet.after).toBe(" bug now");
  });

  it("snippets are truncated with ellipsis for long text", () => {
    const longBefore = "a".repeat(50);
    const longAfter = "b".repeat(50);
    const prompt = `${longBefore}TARGET${longAfter}`;
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt }),
    });
    const results = searchSnapshot(snapshot, "TARGET");
    const snippet = results.get(1)!.snippets[0]!;
    // before should start with ellipsis since text is truncated
    expect(snippet.before.startsWith("\u2026")).toBe(true);
    // after should end with ellipsis since text is truncated
    expect(snippet.after.endsWith("\u2026")).toBe(true);
    expect(snippet.match).toBe("TARGET");
  });

  it("multiple matches in one turn produce multiple snippets", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({
        turnId: 1,
        prompt: "Fix the auth module",
        items: [
          {
            importance: "high",
            category: "file_edited",
            label: "Edited auth.ts",
            detail: "Updated auth logic",
            activityIds: ["a1"],
          },
        ],
      }),
    });
    const results = searchSnapshot(snapshot, "auth");
    const snippets = results.get(1)!.snippets;
    // Should match in prompt, label, and detail
    expect(snippets.length).toBe(3);
    const sources = snippets.map((s) => s.source);
    expect(sources).toContain("prompt");
    expect(sources).toContain("label");
    expect(sources).toContain("detail");
  });
});
