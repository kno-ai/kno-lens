import { useState, useRef, useMemo, useEffect, useCallback } from "preact/hooks";
import type { SessionSnapshot } from "@kno-lens/view";
import type { CategoryFilter } from "../filter.js";
import type { TurnSearchResult } from "../search.js";
import { turnMatchesCategory } from "../filter.js";
import { TurnSummary } from "./TurnSummary.js";

interface TurnListProps {
  snapshot: SessionSnapshot;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  activeFilter?: CategoryFilter | null | undefined;
  searchQuery?: string | undefined;
  searchResults?: Map<number, TurnSearchResult> | null | undefined;
  /** Turn currently shown in LiveIndicator — hidden here to avoid duplication. */
  liveTurnId?: number | null | undefined;
}

/** Find the most recent completed turn (one that has a summary). */
function latestCompletedId(snapshot: SessionSnapshot): number | null {
  const turns = snapshot.session.turns;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn && snapshot.summaries[turn.id]) return turn.id;
  }
  return null;
}

export function TurnList({
  snapshot,
  onDrillDown,
  onOpenFile,
  activeFilter,
  searchQuery,
  searchResults,
  liveTurnId,
}: TurnListProps) {
  const turns = snapshot.session.turns;
  const isSearching = searchResults != null;

  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const id = latestCompletedId(snapshot);
    return id != null ? new Set([id]) : new Set();
  });

  // Auto-expand when a new turn completes. Never auto-collapse.
  const lastAutoExpanded = useRef<number | null>(latestCompletedId(snapshot));

  useEffect(() => {
    const currentLatest = latestCompletedId(snapshot);
    if (currentLatest != null && currentLatest !== lastAutoExpanded.current) {
      lastAutoExpanded.current = currentLatest;
      setExpanded((prev) => {
        if (prev.has(currentLatest)) return prev;
        const next = new Set(prev);
        next.add(currentLatest);
        return next;
      });
    }
  }, [snapshot]);

  const toggle = useCallback((turnId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, []);

  // When searching, auto-expand all matching turns; otherwise use manual state
  const effectiveExpanded = useMemo(() => {
    if (!isSearching) return expanded;
    const searchExpanded = new Set(expanded);
    for (const turnId of searchResults.keys()) {
      searchExpanded.add(turnId);
    }
    return searchExpanded;
  }, [isSearching, searchResults, expanded]);

  // Display most recent first
  const reversed = [...turns].reverse();

  return (
    <ul class="turn-list">
      {reversed.map((turn) => {
        // Hide the active turn — LiveIndicator already shows it
        if (turn.id === liveTurnId && !snapshot.summaries[turn.id]) {
          return null;
        }

        const summary = snapshot.summaries[turn.id];

        // When filtering by category, hide non-matching turns
        if (activeFilter && summary && !turnMatchesCategory(summary, activeFilter)) {
          return null;
        }
        if (activeFilter && !summary) {
          return null;
        }

        // When searching, hide non-matching turns
        if (isSearching && !searchResults.has(turn.id)) {
          return null;
        }

        if (!summary) {
          // Active turn without summary — minimal header
          return (
            <li key={turn.id} class="turn-item">
              <div class="turn-header">
                <div class="turn-header__prompt" title={turn.prompt}>
                  <span class="turn-header__turn-num">{turn.id}</span>
                  {turn.prompt}
                </div>
              </div>
            </li>
          );
        }

        const turnResult = isSearching ? searchResults.get(turn.id) : undefined;

        return (
          <TurnSummary
            key={turn.id}
            summary={summary}
            expanded={effectiveExpanded.has(turn.id)}
            onToggle={() => toggle(turn.id)}
            onDrillDown={onDrillDown}
            onOpenFile={onOpenFile}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            searchSnippets={turnResult?.snippets}
          />
        );
      })}
    </ul>
  );
}
