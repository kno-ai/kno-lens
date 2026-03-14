import { describe, it, expect } from "vitest";
import {
  CATEGORY_FILTERS,
  ALL_FILTERS,
  getFilter,
  turnMatchesCategory,
  countMatches,
} from "../src/filter.js";
import type { CategoryFilter } from "../src/filter.js";
import type { TurnSummary, SessionSnapshot } from "@kno-lens/view";

function makeTurnSummary(
  turnId: number,
  categories: string[],
  prompt = "test prompt",
): TurnSummary {
  return {
    turnId,
    prompt,
    items: categories.map((category, i) => ({
      importance: "medium" as const,
      category,
      label: `item-${i}`,
      activityIds: [`act-${turnId}-${i}`],
    })),
    stats: {
      filesCreated: 0,
      filesEdited: 0,
      filesDeleted: 0,
      filesRead: 0,
      commandsRun: 0,
      commandsFailed: 0,
      searchesRun: 0,
      errors: 0,
    },
  };
}

function makeSnapshot(summaries: Record<number, TurnSummary>): SessionSnapshot {
  return {
    session: {
      id: "test",
      status: "done",
      turns: Object.values(summaries).map((s) => ({
        id: s.turnId,
        status: "done",
        prompt: s.prompt,
      })),
    } as any,
    summaries,
    summaryConfigVersion: "1.0.0",
  };
}

// ─── Filter group coverage ───────────────────────────────────────

describe("filter groups cover all known categories", () => {
  it("every category filter has a non-empty categories set", () => {
    for (const f of CATEGORY_FILTERS) {
      expect(f.categories.size).toBeGreaterThan(0);
    }
  });

  it("all filters have unique ids", () => {
    const ids = ALL_FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("deletes filter includes file_deleted category", () => {
    const deletesFilter = getFilter("cat:deletes") as CategoryFilter;
    expect(deletesFilter).toBeDefined();
    expect(deletesFilter.categories.has("file_deleted")).toBe(true);
  });

  it("commands filter includes derived test_run and package_install categories", () => {
    const cmdsFilter = getFilter("cat:commands") as CategoryFilter;
    expect(cmdsFilter.categories.has("test_run")).toBe(true);
    expect(cmdsFilter.categories.has("package_install")).toBe(true);
  });
});

// ─── turnMatchesCategory edge cases ──────────────────────────────

describe("turnMatchesCategory edge cases", () => {
  it("returns false when items have unknown categories", () => {
    const summary = makeTurnSummary(1, ["unknown_thing", "another_unknown"]);
    const editFilter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, editFilter)).toBe(false);
  });

  it("matches when one of many items is in the filter group", () => {
    const summary = makeTurnSummary(1, [
      "bash",
      "search",
      "file_edited", // this matches "edits"
      "mcp_call",
    ]);
    const editFilter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, editFilter)).toBe(true);
  });

  it("matches file_deleted in deletes filter", () => {
    const summary = makeTurnSummary(1, ["file_deleted"]);
    const deletesFilter = getFilter("cat:deletes") as CategoryFilter;
    expect(turnMatchesCategory(summary, deletesFilter)).toBe(true);
  });
});

// ─── countMatches ────────────────────────────────────────────────

describe("countMatches", () => {
  it("counts total matching activity ids across turns", () => {
    const snapshot = makeSnapshot({
      1: makeTurnSummary(1, ["file_edited", "bash"]),
      2: makeTurnSummary(2, ["file_created", "file_edited"]),
      3: makeTurnSummary(3, ["bash", "bash"]),
    });
    const editFilter = getFilter("cat:edits") as CategoryFilter;
    // Turn 1: file_edited (1 activityId), Turn 2: file_created + file_edited (2)
    // Turn 3: no edits
    expect(countMatches(snapshot, editFilter)).toBe(3);
  });

  it("returns 0 when no matches", () => {
    const snapshot = makeSnapshot({
      1: makeTurnSummary(1, ["bash", "search"]),
    });
    const editFilter = getFilter("cat:edits") as CategoryFilter;
    expect(countMatches(snapshot, editFilter)).toBe(0);
  });

  it("returns 0 for empty snapshot", () => {
    const snapshot = makeSnapshot({});
    const editFilter = getFilter("cat:edits") as CategoryFilter;
    expect(countMatches(snapshot, editFilter)).toBe(0);
  });
});

// ─── Filter type verification ────────────────────────────────────

describe("filter type verification", () => {
  it("all filters are category filters", () => {
    for (const f of ALL_FILTERS) {
      expect(f.kind).toBe("category");
      expect(f.id.startsWith("cat:")).toBe(true);
    }
  });

  it("getFilter returns category type", () => {
    const cat = getFilter("cat:edits");
    expect(cat?.kind).toBe("category");
  });

  it("getFilter returns undefined for unknown prefixes", () => {
    expect(getFilter("smart:deletes")).toBeUndefined();
    expect(getFilter("unknown")).toBeUndefined();
  });
});
