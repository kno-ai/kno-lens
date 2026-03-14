import { describe, it, expect } from "vitest";
import { CATEGORY_FILTERS, SMART_FILTERS, getFilter, turnMatchesCategory } from "../src/filter.js";
import type { CategoryFilter } from "../src/filter.js";
import type { TurnSummary } from "@kno-lens/view";

function makeTurnSummary(categories: string[]): TurnSummary {
  return {
    turnId: 1,
    prompt: "test prompt",
    items: categories.map((category, i) => ({
      importance: "medium" as const,
      category,
      label: `item-${i}`,
      activityIds: [`act-${i}`],
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

describe("CATEGORY_FILTERS", () => {
  it("is derived from the registry and has expected groups", () => {
    expect(CATEGORY_FILTERS.length).toBeGreaterThan(0);
    const ids = CATEGORY_FILTERS.map((f) => f.id);
    expect(ids).toContain("cat:edits");
    expect(ids).toContain("cat:commands");
    expect(ids).toContain("cat:errors");
    expect(ids).toContain("cat:search");
    expect(ids).toContain("cat:agents");
  });

  it("all have kind 'category' and id prefix 'cat:'", () => {
    for (const f of CATEGORY_FILTERS) {
      expect(f.kind).toBe("category");
      expect(f.id).toMatch(/^cat:/);
      expect(f.categories).toBeInstanceOf(Set);
      expect(f.categories.size).toBeGreaterThan(0);
    }
  });

  it("has capitalized labels", () => {
    for (const f of CATEGORY_FILTERS) {
      expect(f.label[0]).toBe(f.label[0]!.toUpperCase());
    }
  });
});

describe("SMART_FILTERS", () => {
  it("has expected entries", () => {
    expect(SMART_FILTERS).toHaveLength(3);
    const ids = SMART_FILTERS.map((f) => f.id);
    expect(ids).toContain("smart:deletes");
    expect(ids).toContain("smart:installs");
    expect(ids).toContain("smart:tests");
  });

  it("all have kind 'smart' and id prefix 'smart:'", () => {
    for (const f of SMART_FILTERS) {
      expect(f.kind).toBe("smart");
      expect(f.id).toMatch(/^smart:/);
      expect(f.query).toBeTruthy();
    }
  });
});

describe("getFilter", () => {
  it("finds category filters by id", () => {
    const f = getFilter("cat:edits");
    expect(f).toBeDefined();
    expect(f!.kind).toBe("category");
    expect(f!.id).toBe("cat:edits");
  });

  it("finds smart filters by id", () => {
    const f = getFilter("smart:tests");
    expect(f).toBeDefined();
    expect(f!.kind).toBe("smart");
    expect(f!.id).toBe("smart:tests");
  });

  it("returns undefined for unknown id", () => {
    expect(getFilter("cat:nonexistent")).toBeUndefined();
    expect(getFilter("unknown")).toBeUndefined();
    expect(getFilter("")).toBeUndefined();
  });
});

describe("turnMatchesCategory", () => {
  it("returns true when turn has matching items", () => {
    const summary = makeTurnSummary(["file_edited", "bash"]);
    const filter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, filter)).toBe(true);
  });

  it("returns true when only one item matches", () => {
    const summary = makeTurnSummary(["bash", "file_created"]);
    const filter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, filter)).toBe(true);
  });

  it("returns false when turn has no matching items", () => {
    const summary = makeTurnSummary(["bash", "search"]);
    const filter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, filter)).toBe(false);
  });

  it("returns false for empty items", () => {
    const summary = makeTurnSummary([]);
    const filter = getFilter("cat:edits") as CategoryFilter;
    expect(turnMatchesCategory(summary, filter)).toBe(false);
  });
});
