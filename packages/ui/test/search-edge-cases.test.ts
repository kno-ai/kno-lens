import { describe, it, expect } from "vitest";
import { searchSnapshot, textContains, itemMatchesSearch } from "../src/search.js";
import type { SessionSnapshot, TurnSummary, SummaryItem } from "@kno-lens/view";

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

function makeItem(overrides: Partial<SummaryItem> = {}): SummaryItem {
  return {
    importance: "medium",
    category: "bash",
    label: "default label",
    activityIds: ["a1"],
    ...overrides,
  };
}

// ─── textContains ────────────────────────────────────────────────

describe("textContains", () => {
  it("matches case-insensitively", () => {
    expect(textContains("Hello World", "hello")).toBe(true);
    expect(textContains("Hello World", "WORLD")).toBe(true);
  });

  it("returns false for non-matches", () => {
    expect(textContains("Hello", "xyz")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(textContains("", "a")).toBe(false);
    expect(textContains("a", "")).toBe(true); // empty query matches anything
  });
});

// ─── itemMatchesSearch ───────────────────────────────────────────

describe("itemMatchesSearch", () => {
  it("matches in label", () => {
    expect(itemMatchesSearch(makeItem({ label: "Ran rm file.ts" }), "rm ")).toBe(true);
  });

  it("matches in detail", () => {
    expect(
      itemMatchesSearch(makeItem({ label: "Command", detail: "npm install" }), "install"),
    ).toBe(true);
  });

  it("does not match when neither label nor detail contains query", () => {
    expect(itemMatchesSearch(makeItem({ label: "Read file", detail: "ok" }), "delete")).toBe(false);
  });

  it("handles undefined detail", () => {
    expect(itemMatchesSearch(makeItem({ label: "Read file" }), "Read")).toBe(true);
    expect(itemMatchesSearch(makeItem({ label: "Read file" }), "delete")).toBe(false);
  });
});

// ─── searchSnapshot edge cases ───────────────────────────────────

describe("searchSnapshot edge cases", () => {
  it("preserves trailing whitespace in query (rm vs rm )", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({
        turnId: 1,
        prompt: "fix something",
        items: [
          makeItem({ label: "Ran rm old-file.ts" }),
          makeItem({ label: "Ran npm run format" }), // contains "rm" but not "rm "
        ],
      }),
    });

    // "rm " (with space) should match only the first item
    const withSpace = searchSnapshot(snapshot, "rm ");
    expect(withSpace.size).toBe(1);
    const snippets = withSpace.get(1)!.snippets;
    expect(snippets).toHaveLength(1);
    expect(snippets[0]!.match).toBe("rm ");

    // "rm" (no space) should match both items
    const noSpace = searchSnapshot(snapshot, "rm");
    expect(noSpace.size).toBe(1);
    expect(noSpace.get(1)!.snippets).toHaveLength(2);
  });

  it("handles items with no detail field", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({
        turnId: 1,
        prompt: "do something",
        items: [makeItem({ label: "Edited src/auth.ts" })],
      }),
    });
    const results = searchSnapshot(snapshot, "auth");
    expect(results.size).toBe(1);
  });

  it("handles turns with empty items array", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "explain something", items: [] }),
    });
    // Only prompt should be searched
    const results = searchSnapshot(snapshot, "explain");
    expect(results.size).toBe(1);
    expect(results.get(1)!.snippets[0]!.source).toBe("prompt");
  });

  it("handles special characters in query without crashing", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "file (test).ts [bracket] {brace}" }),
    });
    // These are regex-special but we use indexOf, not regex
    expect(() => searchSnapshot(snapshot, "(test)")).not.toThrow();
    expect(searchSnapshot(snapshot, "(test)").size).toBe(1);
    expect(() => searchSnapshot(snapshot, "[bracket]")).not.toThrow();
    expect(searchSnapshot(snapshot, "[bracket]").size).toBe(1);
    expect(() => searchSnapshot(snapshot, "{brace}")).not.toThrow();
    expect(searchSnapshot(snapshot, "{brace}").size).toBe(1);
    // Regex quantifiers
    expect(() => searchSnapshot(snapshot, ".*")).not.toThrow();
    expect(() => searchSnapshot(snapshot, "a+b?")).not.toThrow();
  });

  it("handles unicode and emoji in queries", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "Fix the café login" }),
    });
    const results = searchSnapshot(snapshot, "café");
    expect(results.size).toBe(1);
    expect(results.get(1)!.snippets[0]!.match).toBe("café");
  });

  it("handles very long prompt without crashing", () => {
    const longPrompt = "x".repeat(100_000) + "NEEDLE" + "y".repeat(100_000);
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: longPrompt }),
    });
    const results = searchSnapshot(snapshot, "NEEDLE");
    expect(results.size).toBe(1);
    const snippet = results.get(1)!.snippets[0]!;
    expect(snippet.match).toBe("NEEDLE");
    // Context should be truncated
    expect(snippet.before.startsWith("\u2026")).toBe(true);
    expect(snippet.after.endsWith("\u2026")).toBe(true);
  });

  it("returns empty map for snapshot with no summaries", () => {
    const snapshot = makeSnapshot({});
    expect(searchSnapshot(snapshot, "anything").size).toBe(0);
  });

  it("searches across multiple turns", () => {
    const snapshot = makeSnapshot({
      1: makeSummary({ turnId: 1, prompt: "first turn with auth" }),
      2: makeSummary({ turnId: 2, prompt: "second turn no match" }),
      3: makeSummary({ turnId: 3, prompt: "third turn with auth too" }),
    });
    const results = searchSnapshot(snapshot, "auth");
    expect(results.size).toBe(2);
    expect(results.has(1)).toBe(true);
    expect(results.has(2)).toBe(false);
    expect(results.has(3)).toBe(true);
  });
});
