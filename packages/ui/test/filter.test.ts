import { describe, it, expect } from "vitest";
import { CATEGORY_FILTERS, getFilter, turnMatchesCategory } from "../src/filter.js";
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
      filesDeleted: 0,
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

  it("edits filter includes file_created and file_edited", () => {
    const editsFilter = getFilter("cat:edits") as CategoryFilter;
    expect(editsFilter.categories.has("file_created")).toBe(true);
    expect(editsFilter.categories.has("file_edited")).toBe(true);
  });

  it("deletes filter includes file_deleted", () => {
    const deletesFilter = getFilter("cat:deletes") as CategoryFilter;
    expect(deletesFilter).toBeDefined();
    expect(deletesFilter.categories.has("file_deleted")).toBe(true);
  });

  it("commands filter includes derived categories", () => {
    const cmdsFilter = getFilter("cat:commands") as CategoryFilter;
    expect(cmdsFilter.categories.has("bash")).toBe(true);
    expect(cmdsFilter.categories.has("test_run")).toBe(true);
    expect(cmdsFilter.categories.has("package_install")).toBe(true);
  });
});

describe("getFilter", () => {
  it("finds category filters by id", () => {
    const f = getFilter("cat:edits");
    expect(f).toBeDefined();
    expect(f!.kind).toBe("category");
    expect(f!.id).toBe("cat:edits");
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

  it("returns true for file_deleted in deletes filter", () => {
    const summary = makeTurnSummary(["file_deleted", "bash"]);
    const filter = getFilter("cat:deletes") as CategoryFilter;
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
