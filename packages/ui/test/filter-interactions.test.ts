import { describe, it, expect } from "vitest";
import {
  CATEGORY_FILTERS,
  SMART_FILTERS,
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

  it("category and smart filters have unique ids", () => {
    const ids = ALL_FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("smart filter queries are non-empty and distinct", () => {
    const queries = SMART_FILTERS.map((f) => f.query);
    expect(queries.every((q) => q.length > 0)).toBe(true);
    expect(new Set(queries).size).toBe(queries.length);
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

// ─── Filter/search mutual exclusivity (logic verification) ──────

describe("filter and search mutual exclusivity", () => {
  it("smart filters have a query that can be used for search", () => {
    for (const sf of SMART_FILTERS) {
      expect(sf.query.length).toBeGreaterThan(0);
      expect(sf.kind).toBe("smart");
    }
  });

  it("category filters are distinct from smart filters", () => {
    for (const cf of CATEGORY_FILTERS) {
      expect(cf.kind).toBe("category");
      expect(cf.id.startsWith("cat:")).toBe(true);
    }
    for (const sf of SMART_FILTERS) {
      expect(sf.kind).toBe("smart");
      expect(sf.id.startsWith("smart:")).toBe(true);
    }
  });

  it("getFilter returns correct types for each prefix", () => {
    const cat = getFilter("cat:edits");
    expect(cat?.kind).toBe("category");

    const smart = getFilter("smart:deletes");
    expect(smart?.kind).toBe("smart");
    if (smart?.kind === "smart") {
      expect(smart.query).toBe("rm ");
    }
  });
});
