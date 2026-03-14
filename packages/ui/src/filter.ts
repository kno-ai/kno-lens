import type { SessionSnapshot, TurnSummary } from "@kno-lens/view";
import { knownFilterGroups, categoriesForGroup } from "@kno-lens/view";

// ─── Category filters (registry-driven) ─────────────────────────────────

export interface CategoryFilter {
  kind: "category";
  id: string;
  label: string;
  categories: Set<string>;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CATEGORY_FILTERS: CategoryFilter[] = knownFilterGroups().map((group) => ({
  kind: "category",
  id: `cat:${group}`,
  label: capitalize(group),
  categories: categoriesForGroup(group),
}));

// ─── Smart filters (canned search queries) ──────────────────────────────

export interface SmartFilter {
  kind: "smart";
  id: string;
  label: string;
  /** Search query to execute. */
  query: string;
}

export const SMART_FILTERS: SmartFilter[] = [
  { kind: "smart", id: "smart:deletes", label: "Deletes", query: "rm " },
  { kind: "smart", id: "smart:installs", label: "Installs", query: "install" },
  { kind: "smart", id: "smart:tests", label: "Tests", query: "test" },
];

// ─── Unified filter type ─────────────────────────────────────────────────

export type Filter = CategoryFilter | SmartFilter;

export const ALL_FILTERS: Filter[] = [...CATEGORY_FILTERS, ...SMART_FILTERS];

export function getFilter(id: string): Filter | undefined {
  return ALL_FILTERS.find((f) => f.id === id);
}

// ─── Category filter helpers ─────────────────────────────────────────────

export function turnMatchesCategory(summary: TurnSummary, filter: CategoryFilter): boolean {
  return summary.items.some((item) => filter.categories.has(item.category));
}

export function countMatches(snapshot: SessionSnapshot, filter: CategoryFilter): number {
  let count = 0;
  for (const summary of Object.values(snapshot.summaries)) {
    for (const item of summary.items) {
      if (filter.categories.has(item.category)) {
        count += item.activityIds.length;
      }
    }
  }
  return count;
}
