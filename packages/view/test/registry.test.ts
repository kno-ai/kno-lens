import { describe, it, expect } from "vitest";
import {
  getCategoryDef,
  knownCategories,
  knownFilterGroups,
  categoriesForGroup,
} from "../src/summary/registry.js";

describe("getCategoryDef", () => {
  it("returns correct def for file_edited", () => {
    const def = getCategoryDef("file_edited");
    expect(def.icon).toBe("\u25cf");
    expect(def.colorToken).toBe("orange");
    expect(def.filterGroup).toBe("edits");
    expect(def.defaultImportance).toBe("high");
    expect(def.groupLabel(3)).toBe("Edited 3 files");
  });

  it("returns correct def for file_created", () => {
    const def = getCategoryDef("file_created");
    expect(def.colorToken).toBe("green");
    expect(def.filterGroup).toBe("edits");
    expect(def.defaultImportance).toBe("high");
    expect(def.groupLabel(2)).toBe("Created 2 files");
  });

  it("returns correct def for bash", () => {
    const def = getCategoryDef("bash");
    expect(def.colorToken).toBe("blue");
    expect(def.filterGroup).toBe("commands");
    expect(def.defaultImportance).toBe("medium");
    expect(def.groupLabel(5)).toBe("Ran 5 commands");
  });

  it("returns correct def for bash_error", () => {
    const def = getCategoryDef("bash_error");
    expect(def.colorToken).toBe("red");
    expect(def.filterGroup).toBe("errors");
    expect(def.defaultImportance).toBe("high");
    expect(def.groupLabel(2)).toBe("2 commands failed");
  });

  it("returns correct def for agent", () => {
    const def = getCategoryDef("agent");
    expect(def.colorToken).toBe("magenta");
    expect(def.filterGroup).toBe("agents");
    expect(def.defaultImportance).toBe("high");
    expect(def.groupLabel(1)).toBe("1 agents");
  });

  it("returns default def for unknown category", () => {
    const def = getCategoryDef("completely_unknown_thing");
    expect(def.icon).toBe("\u2022");
    expect(def.colorToken).toBe("muted");
    expect(def.filterGroup).toBe("other");
    expect(def.defaultImportance).toBe("low");
    expect(def.groupLabel(4)).toBe("4 actions");
  });
});

describe("knownCategories", () => {
  it("returns all registered categories", () => {
    const categories = knownCategories();
    expect(categories).toContain("file_created");
    expect(categories).toContain("file_edited");
    expect(categories).toContain("file_read");
    expect(categories).toContain("bash");
    expect(categories).toContain("bash_error");
    expect(categories).toContain("search");
    expect(categories).toContain("fetch");
    expect(categories).toContain("agent");
    expect(categories).toContain("ask_user");
    expect(categories).toContain("mcp_call");
    expect(categories).toContain("error");
    expect(categories).toHaveLength(11);
  });
});

describe("knownFilterGroups", () => {
  it("returns unique groups excluding 'other'", () => {
    const groups = knownFilterGroups();
    expect(groups).not.toContain("other");
    expect(groups).toContain("edits");
    expect(groups).toContain("reads");
    expect(groups).toContain("commands");
    expect(groups).toContain("errors");
    expect(groups).toContain("search");
    expect(groups).toContain("agents");
    // No duplicates
    expect(new Set(groups).size).toBe(groups.length);
  });
});

describe("categoriesForGroup", () => {
  it("returns correct set for edits group", () => {
    const cats = categoriesForGroup("edits");
    expect(cats).toEqual(new Set(["file_created", "file_edited"]));
  });

  it("returns correct set for errors group", () => {
    const cats = categoriesForGroup("errors");
    expect(cats).toEqual(new Set(["bash_error", "error"]));
  });

  it("returns correct set for search group", () => {
    const cats = categoriesForGroup("search");
    expect(cats).toEqual(new Set(["search", "fetch"]));
  });

  it("returns correct set for commands group", () => {
    const cats = categoriesForGroup("commands");
    expect(cats).toEqual(new Set(["bash"]));
  });

  it("returns correct set for agents group", () => {
    const cats = categoriesForGroup("agents");
    expect(cats).toEqual(new Set(["agent"]));
  });

  it("returns empty set for unknown group", () => {
    const cats = categoriesForGroup("nonexistent_group");
    expect(cats.size).toBe(0);
  });
});
