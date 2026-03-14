import type { SessionSnapshot, TurnSummary, SummaryItem } from "@kno-lens/view";

/** Case-insensitive substring match. Single source of truth for search matching. */
export function textContains(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

/** Check if an item's label or detail contains the search query. */
export function itemMatchesSearch(item: SummaryItem, query: string): boolean {
  if (textContains(item.label, query)) return true;
  if (item.detail && textContains(item.detail, query)) return true;
  return false;
}

/** A single match snippet showing why a turn was returned. */
export interface SearchSnippet {
  /** Where the match was found. */
  source: "prompt" | "label" | "detail" | "response";
  /** Text before the match. */
  before: string;
  /** The matched substring. */
  match: string;
  /** Text after the match. */
  after: string;
}

/** Search results for one turn. */
export interface TurnSearchResult {
  turnId: number;
  snippets: SearchSnippet[];
}

const CONTEXT_CHARS = 30;

/** Build a snippet from a string that contains the query. */
function extractSnippet(
  text: string,
  query: string,
  source: SearchSnippet["source"],
): SearchSnippet | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return null;

  const matchEnd = idx + query.length;
  const beforeStart = Math.max(0, idx - CONTEXT_CHARS);
  const afterEnd = Math.min(text.length, matchEnd + CONTEXT_CHARS);

  return {
    source,
    before: (beforeStart > 0 ? "\u2026" : "") + text.slice(beforeStart, idx),
    match: text.slice(idx, matchEnd),
    after: text.slice(matchEnd, afterEnd) + (afterEnd < text.length ? "\u2026" : ""),
  };
}

/** Search a single turn summary, returning snippets for all matches. */
function searchTurn(summary: TurnSummary, query: string): SearchSnippet[] {
  const snippets: SearchSnippet[] = [];

  // Search prompt
  const promptSnippet = extractSnippet(summary.prompt, query, "prompt");
  if (promptSnippet) snippets.push(promptSnippet);

  // Search response text
  if (summary.response) {
    const responseSnippet = extractSnippet(summary.response, query, "response");
    if (responseSnippet) snippets.push(responseSnippet);
  }

  // Search item labels and details
  for (const item of summary.items) {
    const labelSnippet = extractSnippet(item.label, query, "label");
    if (labelSnippet) snippets.push(labelSnippet);

    if (item.detail) {
      const detailSnippet = extractSnippet(item.detail, query, "detail");
      if (detailSnippet) snippets.push(detailSnippet);
    }
  }

  return snippets;
}

/** Search all turns in a snapshot. Returns only turns that matched. */
export function searchSnapshot(
  snapshot: SessionSnapshot,
  query: string,
): Map<number, TurnSearchResult> {
  const results = new Map<number, TurnSearchResult>();
  if (!query.trim()) return results;

  // Preserve the query as-is (trailing space in "rm " is significant)
  for (const [id, summary] of Object.entries(snapshot.summaries)) {
    const turnId = Number(id);
    const snippets = searchTurn(summary, query);
    if (snippets.length > 0) {
      results.set(turnId, { turnId, snippets });
    }
  }

  return results;
}
