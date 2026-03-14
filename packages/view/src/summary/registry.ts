import type { ImportanceLevel } from "./config.js";

/**
 * Display properties for a known activity kind.
 * The registry is the single source of truth for how activities
 * render in the UI — icons, colors, filter grouping, and defaults.
 */
export interface CategoryDef {
  /** Unicode icon character. */
  icon: string;
  /** CSS color token — maps to --vscode-charts-{colorToken} or similar. */
  colorToken: string;
  /** Filter group this kind belongs to. */
  filterGroup: string;
  /** Default importance when no config override is set. */
  defaultImportance: ImportanceLevel;
  /** Label template when grouping N consecutive items of this kind. */
  groupLabel: (count: number) => string;
}

const DEFAULT_DEF: CategoryDef = {
  icon: "\u2022", // bullet
  colorToken: "muted",
  filterGroup: "other",
  defaultImportance: "low",
  groupLabel: (n) => `${n} actions`,
};

/**
 * Registry of known activity kinds → display properties.
 *
 * The keys here are the "display category" strings used on SummaryItems.
 * Most map 1:1 from ActivityKind, but a few ActivityKinds produce
 * different display categories based on metadata:
 *   - file_write → "file_created" or "file_edited" (based on isNew)
 *   - bash → "bash" or "bash_error" (based on status)
 *
 * Unknown/unregistered category strings get DEFAULT_DEF automatically.
 */
const REGISTRY: Record<string, CategoryDef> = {
  file_created: {
    icon: "\uff0b", // fullwidth +
    colorToken: "green",
    filterGroup: "edits",
    defaultImportance: "high",
    groupLabel: (n) => `Created ${n} files`,
  },
  file_edited: {
    icon: "\u25cf", // filled circle
    colorToken: "orange",
    filterGroup: "edits",
    defaultImportance: "high",
    groupLabel: (n) => `Edited ${n} files`,
  },
  file_read: {
    icon: "\u25a0", // filled square
    colorToken: "blue",
    filterGroup: "reads",
    defaultImportance: "medium",
    groupLabel: (n) => `Read ${n} files`,
  },
  bash: {
    icon: "\u25b6", // play triangle
    colorToken: "blue",
    filterGroup: "commands",
    defaultImportance: "medium",
    groupLabel: (n) => `Ran ${n} commands`,
  },
  bash_error: {
    icon: "\u2716", // heavy x
    colorToken: "red",
    filterGroup: "errors",
    defaultImportance: "high",
    groupLabel: (n) => `${n} commands failed`,
  },
  search: {
    icon: "\u25ce", // bullseye
    colorToken: "yellow",
    filterGroup: "search",
    defaultImportance: "medium",
    groupLabel: (n) => `${n} searches`,
  },
  fetch: {
    icon: "\u2913", // downwards arrow to bar
    colorToken: "blue",
    filterGroup: "search",
    defaultImportance: "medium",
    groupLabel: (n) => `Fetched ${n} URLs`,
  },
  agent: {
    icon: "\u2b22", // black hexagon
    colorToken: "magenta",
    filterGroup: "agents",
    defaultImportance: "high",
    groupLabel: (n) => `${n} agents`,
  },
  ask_user: {
    icon: "\u25c8", // white diamond containing black small diamond
    colorToken: "yellow",
    filterGroup: "other",
    defaultImportance: "high",
    groupLabel: (n) => `${n} prompts`,
  },
  mcp_call: {
    icon: "\u25c6", // black diamond
    colorToken: "muted",
    filterGroup: "other",
    defaultImportance: "low",
    groupLabel: (n) => `${n} MCP calls`,
  },
  error: {
    icon: "\u2716", // heavy x
    colorToken: "red",
    filterGroup: "errors",
    defaultImportance: "high",
    groupLabel: (n) => `${n} errors`,
  },
};

/** Look up display properties for a category string. Unknown kinds get defaults. */
export function getCategoryDef(category: string): CategoryDef {
  return REGISTRY[category] ?? DEFAULT_DEF;
}

/** All known category strings that have registry entries. */
export function knownCategories(): string[] {
  return Object.keys(REGISTRY);
}

/**
 * All known filter groups, derived from the registry.
 * Returns unique group names in registry order, excluding "other".
 */
export function knownFilterGroups(): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const def of Object.values(REGISTRY)) {
    if (def.filterGroup !== "other" && !seen.has(def.filterGroup)) {
      seen.add(def.filterGroup);
      groups.push(def.filterGroup);
    }
  }
  return groups;
}

/**
 * Get all category strings that belong to a given filter group.
 */
export function categoriesForGroup(group: string): Set<string> {
  const result = new Set<string>();
  for (const [category, def] of Object.entries(REGISTRY)) {
    if (def.filterGroup === group) {
      result.add(category);
    }
  }
  return result;
}
