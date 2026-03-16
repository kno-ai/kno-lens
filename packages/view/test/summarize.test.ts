import { describe, it, expect, beforeEach } from "vitest";
import type { Turn } from "@kno-lens/core";
import { summarizeTurn } from "../src/summary/summarize.js";
import { DEFAULT_SUMMARY_CONFIG } from "../src/summary/config.js";
import type { SummaryConfig } from "../src/summary/config.js";
import { makeActivity, resetCounters } from "./helpers.js";

function makeTurn(activities: ReturnType<typeof makeActivity>[], overrides?: Partial<Turn>): Turn {
  return {
    id: 1,
    status: "done",
    prompt: "test prompt",
    steps: activities.map((a) => ({
      kind: "activity" as const,
      activity: {
        ...a,
        status: a.status === "running" ? "done" : a.status,
        endedAt: "2025-01-01T00:01:45Z",
      },
    })),
    startedAt: "2025-01-01T00:01:00Z",
    endedAt: "2025-01-01T00:02:00Z",
    durationMs: 1000,
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      models: [],
    },
    errorCount: 0,
    ...overrides,
  };
}

describe("summarizeTurn", () => {
  const config = DEFAULT_SUMMARY_CONFIG;

  beforeEach(() => resetCounters());

  // ─── Classification ──────────────────────────────────────────────

  it("classifies file edits as high importance", () => {
    const turn = makeTurn([makeActivity("file_edit")]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("file_edited");
  });

  it("classifies file creates as high importance", () => {
    const turn = makeTurn([makeActivity("file_write", "done", { isNew: true })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("file_created");
  });

  it("classifies failed bash as high importance", () => {
    const turn = makeTurn([makeActivity("bash", "error", { exitCode: 1 })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("bash_error");
    expect(summary.items[0]!.detail).toBe("exit 1");
  });

  it("classifies successful bash as medium importance", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "ls -la" })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("medium");
    expect(summary.items[0]!.category).toBe("bash");
  });

  it("classifies rm command as file_deleted", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "rm -rf dist" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("file_deleted");
    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.stats.filesDeleted).toBe(1);
  });

  it("classifies git rm as file_deleted", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "git rm src/old.ts" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("file_deleted");
  });

  it("classifies rimraf as file_deleted", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "rimraf node_modules" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("file_deleted");
  });

  it("classifies npm test as test_run", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "npm test" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("test_run");
  });

  it("classifies vitest as test_run", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "vitest run" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("test_run");
  });

  it("classifies npm install as package_install", () => {
    const turn = makeTurn([makeActivity("bash", "done", { command: "npm install express" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("package_install");
  });

  it("does not misclassify npm rm as file_deleted", () => {
    // npm rm is npm uninstall, not a file delete
    const turn = makeTurn([makeActivity("bash", "done", { command: "npm rm express" })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("bash");
  });

  it("classifies error bash before checking command patterns", () => {
    // Errors take precedence over command classification
    const turn = makeTurn([makeActivity("bash", "error", { command: "npm test", exitCode: 1 })]);
    const summary = summarizeTurn(turn, config);
    expect(summary.items[0]!.category).toBe("bash_error");
  });

  it("classifies file reads as medium importance", () => {
    const turn = makeTurn([makeActivity("file_read", "done")]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("medium");
    expect(summary.items[0]!.category).toBe("file_read");
  });

  it("classifies agent as high importance", () => {
    const turn = makeTurn([makeActivity("agent", "done")]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("agent");
  });

  it("classifies ask_user as high importance", () => {
    const turn = makeTurn([makeActivity("ask_user", "done")]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("ask_user");
  });

  it("classifies mcp_call as low importance", () => {
    const turn = makeTurn([makeActivity("mcp_call", "done")]);
    const showAll: SummaryConfig = { ...config, defaultMinImportance: "low" };
    const summary = summarizeTurn(turn, showAll);

    expect(summary.items[0]!.importance).toBe("low");
    expect(summary.items[0]!.category).toBe("mcp_call");
  });

  it("classifies file_write overwrite as file_edited", () => {
    const turn = makeTurn([makeActivity("file_write", "done", { isNew: false })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.importance).toBe("high");
    expect(summary.items[0]!.category).toBe("file_edited");
  });

  it("classifies failed bash without exitCode", () => {
    const turn = makeTurn([makeActivity("bash", "error", { exitCode: undefined })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.category).toBe("bash_error");
    expect(summary.items[0]!.detail).toBeUndefined();
  });

  it("classifies search without resultCount", () => {
    const turn = makeTurn([makeActivity("search", "done", { resultCount: undefined })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.category).toBe("search");
    expect(summary.items[0]!.detail).toBeUndefined();
  });

  it("classifies search with singular result", () => {
    const turn = makeTurn([makeActivity("search", "done", { resultCount: 1 })]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.detail).toBe("1 result");
  });

  // ─── Ordering ────────────────────────────────────────────────────

  it("preserves step ordering in items", () => {
    const turn = makeTurn([
      makeActivity("file_read", "done"),
      makeActivity("file_edit", "done"),
      makeActivity("bash", "done", { command: "ls -la" }),
    ]);
    const noGroup: SummaryConfig = { ...config, groupConsecutive: false };
    const summary = summarizeTurn(turn, noGroup);

    expect(summary.items.map((i) => i.category)).toEqual(["file_read", "file_edited", "bash"]);
  });

  // ─── Grouping ────────────────────────────────────────────────────

  it("groups consecutive same-category items", () => {
    const turn = makeTurn([
      makeActivity("file_read", "done", { path: "a.ts" }),
      makeActivity("file_read", "done", { path: "b.ts" }),
      makeActivity("file_read", "done", { path: "c.ts" }),
    ]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.label).toBe("Read 3 files");
    expect(summary.items[0]!.activityIds).toHaveLength(3);
  });

  it("does not group non-consecutive same-category items", () => {
    const turn = makeTurn([
      makeActivity("file_read", "done", { path: "a.ts" }),
      makeActivity("file_edit", "done"),
      makeActivity("file_read", "done", { path: "b.ts" }),
    ]);
    const summary = summarizeTurn(turn, config);

    const categories = summary.items.map((i) => i.category);
    expect(categories).toEqual(["file_read", "file_edited", "file_read"]);
  });

  it("caps grouped detail strings near 500 characters", () => {
    // Use search activities which carry detail (resultCount)
    // with long patterns that produce long detail strings via grouping
    const activities = Array.from({ length: 10 }, (_, i) =>
      makeActivity("search", "done", { pattern: "x".repeat(50), resultCount: i + 100 }),
    );
    const turn = makeTurn(activities);
    const summary = summarizeTurn(turn, config);

    expect(summary.items).toHaveLength(1);
    // 10 detail strings concatenated would be long uncapped.
    // The cap stops appending once prev.detail exceeds 500.
    expect(summary.items[0]!.detail).toBeDefined();
    expect(summary.items[0]!.detail!.length).toBeLessThan(1000);
  });

  it("uses highest importance when grouping mixed-importance items", () => {
    // Override one file_read to high, others stay medium
    const turn = makeTurn([
      makeActivity("file_read", "done", { path: "a.ts" }),
      makeActivity("file_read", "done", { path: "b.ts" }),
    ]);
    const custom: SummaryConfig = {
      ...config,
      importance: { file_read: "high" },
    };
    const summary = summarizeTurn(turn, custom);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.importance).toBe("high");
  });

  it("respects groupConsecutive: false", () => {
    const turn = makeTurn([
      makeActivity("file_read", "done", { path: "a.ts" }),
      makeActivity("file_read", "done", { path: "b.ts" }),
    ]);
    const noGroup: SummaryConfig = { ...config, groupConsecutive: false };
    const summary = summarizeTurn(turn, noGroup);

    expect(summary.items).toHaveLength(2);
  });

  // ─── Config overrides ────────────────────────────────────────────

  it("applies importance overrides from config", () => {
    const turn = makeTurn([makeActivity("file_read", "done")]);
    const custom: SummaryConfig = {
      ...config,
      importance: { file_read: "high" },
    };
    const summary = summarizeTurn(turn, custom);

    expect(summary.items[0]!.importance).toBe("high");
  });

  it("filters items below defaultMinImportance", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done"), // high
      makeActivity("file_read", "done"), // medium
      makeActivity("mcp_call", "done"), // low
    ]);
    const highOnly: SummaryConfig = {
      ...config,
      defaultMinImportance: "high",
      groupConsecutive: false,
    };
    const summary = summarizeTurn(turn, highOnly);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.category).toBe("file_edited");
  });

  it("shows all items when defaultMinImportance is low", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done"), // high
      makeActivity("file_read", "done"), // medium
      makeActivity("mcp_call", "done"), // low
    ]);
    const showAll: SummaryConfig = {
      ...config,
      defaultMinImportance: "low",
      groupConsecutive: false,
    };
    const summary = summarizeTurn(turn, showAll);

    expect(summary.items).toHaveLength(3);
  });

  it("hides categories set to hidden", () => {
    const turn = makeTurn([makeActivity("file_read", "done"), makeActivity("file_edit", "done")]);
    const custom: SummaryConfig = {
      ...config,
      importance: { file_read: "hidden" },
    };
    const summary = summarizeTurn(turn, custom);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.category).toBe("file_edited");
  });

  // ─── maxVisibleItems ─────────────────────────────────────────────

  it("truncates items beyond maxVisibleItems", () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity("file_edit", "done", { path: `file${i}.ts` }),
    );
    const turn = makeTurn(activities);
    const limited: SummaryConfig = {
      ...config,
      maxVisibleItems: 5,
      groupConsecutive: false,
    };
    const summary = summarizeTurn(turn, limited);

    expect(summary.items).toHaveLength(6); // 5 + "and N more"
    expect(summary.items[5]!.label).toBe("…and 15 more");
    expect(summary.items[5]!.category).toBe("other");
  });

  it("does not truncate when items <= maxVisibleItems", () => {
    const turn = makeTurn([makeActivity("file_edit", "done"), makeActivity("bash", "done")]);
    const limited: SummaryConfig = {
      ...config,
      maxVisibleItems: 5,
      groupConsecutive: false,
    };
    const summary = summarizeTurn(turn, limited);

    expect(summary.items).toHaveLength(2);
    expect(summary.items.every((i) => i.category !== "other")).toBe(true);
  });

  it("handles maxVisibleItems of 0", () => {
    const turn = makeTurn([makeActivity("file_edit", "done"), makeActivity("bash", "done")]);
    const limited: SummaryConfig = {
      ...config,
      maxVisibleItems: 0,
      groupConsecutive: false,
    };
    const summary = summarizeTurn(turn, limited);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.label).toBe("…and 2 more");
  });

  // ─── Stats ───────────────────────────────────────────────────────

  it("computes stats correctly", () => {
    const turn = makeTurn([
      makeActivity("file_write", "done", { isNew: true }),
      makeActivity("file_edit", "done"),
      makeActivity("file_read", "done"),
      makeActivity("file_read", "done"),
      makeActivity("bash", "done"),
      makeActivity("bash", "error", { exitCode: 1 }),
      makeActivity("search", "done"),
    ]);
    const summary = summarizeTurn(turn, config);

    expect(summary.stats.filesCreated).toBe(1);
    expect(summary.stats.filesEdited).toBe(1);
    expect(summary.stats.filesRead).toBe(2);
    expect(summary.stats.commandsRun).toBe(2); // includes the failed one
    expect(summary.stats.commandsFailed).toBe(1);
    expect(summary.stats.searchesRun).toBe(1);
    expect(summary.stats.errors).toBe(1);
  });

  // ─── Text-only turns ─────────────────────────────────────────────

  it("returns empty items for text-only turns", () => {
    const turn: Turn = {
      id: 1,
      status: "done",
      prompt: "What is 2+2?",
      steps: [{ kind: "text", text: "4", at: "2025-01-01T00:01:00Z" }],
      startedAt: "2025-01-01T00:01:00Z",
      endedAt: "2025-01-01T00:02:00Z",
      durationMs: 1000,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: [],
      },
      errorCount: 0,
    };
    const summary = summarizeTurn(turn, config);

    expect(summary.items).toHaveLength(0);
    expect(summary.stats.filesCreated).toBe(0);
    expect(summary.stats.filesEdited).toBe(0);
    expect(summary.stats.errors).toBe(0);
  });

  // ─── Activity IDs ────────────────────────────────────────────────

  it("preserves activity IDs on grouped items", () => {
    const a1 = makeActivity("file_read", "done", { path: "a.ts" });
    const a2 = makeActivity("file_read", "done", { path: "b.ts" });
    const turn = makeTurn([a1, a2]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items[0]!.activityIds).toContain(a1.id);
    expect(summary.items[0]!.activityIds).toContain(a2.id);
  });

  it("generates expandedDetail with file paths when grouping file_read items", () => {
    const a1 = makeActivity("file_read", "done", { path: "src/a.ts" });
    const a2 = makeActivity("file_read", "done", { path: "src/b.ts" });
    const a3 = makeActivity("file_read", "done", { path: "src/c.ts" });
    const turn = makeTurn([a1, a2, a3]);
    const summary = summarizeTurn(turn, config);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.expandedDetail).toHaveLength(3);
    expect(summary.items[0]!.expandedDetail![0]!.text).toBe("a.ts");
    expect(summary.items[0]!.expandedDetail![0]!.filePath).toBe("src/a.ts");
    expect(summary.items[0]!.expandedDetail![0]!.activityId).toBe(a1.id);
    expect(summary.items[0]!.expandedDetail![0]!.style).toBe("path");
  });

  // ─── Prompt passthrough ──────────────────────────────────────────

  it("includes the prompt in the summary", () => {
    const turn = makeTurn([], { prompt: "Fix the bug" });
    const summary = summarizeTurn(turn, config);

    expect(summary.prompt).toBe("Fix the bug");
    expect(summary.turnId).toBe(1);
  });

  // ─── Expanded detail extraction ───────────────────────────────────

  it("shows line count detail for file_edit instead of expanded detail", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", {
        path: "src/app.ts",
        oldString: "const x = 1",
        newString: "const x = 2",
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    // Edit details are now shown via View Diff action, not inline
    expect(summary.items[0]!.expandedDetail).toBeUndefined();
    expect(summary.items[0]!.detail).toBe("1 line modified");
  });

  it("extracts bash expanded detail with output and exit code", () => {
    const turn = makeTurn([
      makeActivity("bash", "error", {
        command: "npm test",
        output: "FAIL src/app.test.ts",
        exitCode: 1,
        durationMs: 3500,
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    const detail = summary.items[0]!.expandedDetail!;
    expect(detail).toBeDefined();
    expect(detail[0]).toEqual({ text: "FAIL src/app.test.ts", style: "code" });
    expect(detail[1]).toEqual({ text: "exit 1 · 3.5s", style: "code" });
  });

  it("extracts search expanded detail with matched files", () => {
    const turn = makeTurn([
      makeActivity("search", "done", {
        pattern: "TODO",
        resultCount: 3,
        matchedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    const detail = summary.items[0]!.expandedDetail!;
    expect(detail).toHaveLength(3);
    expect(detail[0]).toEqual({ text: "a.ts", style: "path", filePath: "src/a.ts" });
    expect(detail[2]).toEqual({ text: "c.ts", style: "path", filePath: "src/c.ts" });
  });

  it("extracts ask_user expanded detail with question and answer", () => {
    const turn = makeTurn([
      makeActivity("ask_user", "done", {
        question: "Should I proceed?",
        answer: "Yes, go ahead",
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    const detail = summary.items[0]!.expandedDetail!;
    expect(detail).toHaveLength(2);
    expect(detail[0]).toEqual({ text: "Should I proceed?" });
    expect(detail[1]).toEqual({ text: "Yes, go ahead", style: "code" });
  });

  it("extracts agent expanded detail with subagent type and prompt", () => {
    const turn = makeTurn([
      makeActivity("agent", "done", {
        description: "investigate tests",
        subagentType: "Explore",
        prompt: "Find failing tests",
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    const detail = summary.items[0]!.expandedDetail!;
    expect(detail).toHaveLength(2);
    expect(detail[0]).toEqual({ text: "Explore" });
    expect(detail[1]).toEqual({ text: "Find failing tests", style: "code" });
  });

  it("returns undefined expandedDetail when no detail data available", () => {
    const turn = makeTurn([makeActivity("file_read", "done", { path: "src/foo.ts" })]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.expandedDetail).toBeUndefined();
  });

  it("caps search matched files at 5 in expanded detail", () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`);
    const turn = makeTurn([
      makeActivity("search", "done", {
        pattern: "TODO",
        resultCount: 10,
        matchedFiles: files,
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.expandedDetail).toHaveLength(5);
  });

  it("merges line count details when grouping edits", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", { path: "a.ts", oldString: "old-a", newString: "new-a" }),
      makeActivity("file_edit", "done", { path: "b.ts", oldString: "old-b", newString: "new-b" }),
    ]);
    const summary = summarizeTurn(turn, config);

    // Grouped into 1 item with expandedDetail for file paths, detail strings merged
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.detail).toBe("1 line modified, 1 line modified");
    // expandedDetail should list individual file paths
    expect(summary.items[0]!.expandedDetail).toHaveLength(2);
    expect(summary.items[0]!.expandedDetail![0]!.text).toBe("a.ts");
    expect(summary.items[0]!.expandedDetail![0]!.filePath).toBe("a.ts");
    expect(summary.items[0]!.expandedDetail![1]!.text).toBe("b.ts");
    expect(summary.items[0]!.expandedDetail![1]!.filePath).toBe("b.ts");
  });

  // ─── editLinesSummary edge cases ────────────────────────────────

  it("returns undefined detail when edit has no old or new string", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", {
        path: "src/app.ts",
        oldString: undefined,
        newString: undefined,
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.detail).toBeUndefined();
  });

  it("counts multiline edit strings correctly", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", {
        path: "src/app.ts",
        oldString: "line1\nline2\nline3",
        newString: "line1\nline2\nline3\nline4\nline5",
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.detail).toBe("5 lines modified");
  });

  it("handles edit with only oldString (deletion)", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", {
        path: "src/app.ts",
        oldString: "removed line",
        newString: undefined,
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.detail).toBe("1 line modified");
  });

  it("handles edit with only newString (insertion)", () => {
    const turn = makeTurn([
      makeActivity("file_edit", "done", {
        path: "src/app.ts",
        oldString: undefined,
        newString: "new\nlines\nadded",
      }),
    ]);
    const summary = summarizeTurn(turn, { ...config, groupConsecutive: false });

    expect(summary.items[0]!.detail).toBe("3 lines modified");
  });

  // ─── extractResponse ───────────────────────────────────────────

  it("extracts the last text response from a turn", () => {
    const turn: Turn = {
      id: 1,
      status: "done",
      prompt: "What is 2+2?",
      steps: [
        { kind: "text", text: "Let me think about that.", at: "2025-01-01T00:01:00Z" },
        {
          kind: "activity",
          activity: makeActivity("file_read", "done"),
        },
        { kind: "text", text: "The answer is 4.", at: "2025-01-01T00:01:05Z" },
      ],
      startedAt: "2025-01-01T00:01:00Z",
      endedAt: "2025-01-01T00:02:00Z",
      durationMs: 1000,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: [],
      },
      errorCount: 0,
    };
    const summary = summarizeTurn(turn, config);

    // Should return the last text step
    expect(summary.response).toBe("The answer is 4.");
  });

  it("returns undefined response when turn has no text steps", () => {
    const turn = makeTurn([makeActivity("file_edit", "done")]);
    const summary = summarizeTurn(turn, config);

    expect(summary.response).toBeUndefined();
  });

  it("skips whitespace-only text steps", () => {
    const turn: Turn = {
      id: 1,
      status: "done",
      prompt: "Do something",
      steps: [
        { kind: "text", text: "Real content here.", at: "2025-01-01T00:01:00Z" },
        { kind: "text", text: "   \n  \t  ", at: "2025-01-01T00:01:05Z" },
      ],
      startedAt: "2025-01-01T00:01:00Z",
      endedAt: "2025-01-01T00:02:00Z",
      durationMs: 1000,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: [],
      },
      errorCount: 0,
    };
    const summary = summarizeTurn(turn, config);

    expect(summary.response).toBe("Real content here.");
  });

  it("truncates response longer than 300 characters", () => {
    const longText = "x".repeat(400);
    const turn: Turn = {
      id: 1,
      status: "done",
      prompt: "Explain",
      steps: [{ kind: "text", text: longText, at: "2025-01-01T00:01:00Z" }],
      startedAt: "2025-01-01T00:01:00Z",
      endedAt: "2025-01-01T00:02:00Z",
      durationMs: 1000,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: [],
      },
      errorCount: 0,
    };
    const summary = summarizeTurn(turn, config);

    expect(summary.response).toBeDefined();
    expect(summary.response!.length).toBe(301); // 300 + "…"
    expect(summary.response!.endsWith("…")).toBe(true);
  });

  it("does not truncate response at exactly 300 characters", () => {
    const exactText = "y".repeat(300);
    const turn: Turn = {
      id: 1,
      status: "done",
      prompt: "Explain",
      steps: [{ kind: "text", text: exactText, at: "2025-01-01T00:01:00Z" }],
      startedAt: "2025-01-01T00:01:00Z",
      endedAt: "2025-01-01T00:02:00Z",
      durationMs: 1000,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: [],
      },
      errorCount: 0,
    };
    const summary = summarizeTurn(turn, config);

    expect(summary.response).toBe(exactText);
    expect(summary.response!.endsWith("…")).toBe(false);
  });
});
