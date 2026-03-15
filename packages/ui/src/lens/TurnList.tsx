import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import { TurnSummary } from "./TurnSummary.js";

interface TurnListProps {
  snapshot: SessionSnapshot;
  live: LiveTurnState | null;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
}

/** Find the most recent turn (completed or live). */
function latestTurnId(snapshot: SessionSnapshot, liveTurnId: number | null): number | null {
  if (liveTurnId != null) return liveTurnId;
  const turns = snapshot.session.turns;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn && snapshot.summaries[turn.id]) return turn.id;
  }
  return null;
}

export function TurnList({ snapshot, live, onDrillDown, onOpenFile, onShowDiff }: TurnListProps) {
  const turns = snapshot.session.turns;
  const liveTurnId = live?.turnId ?? null;

  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const id = latestTurnId(snapshot, liveTurnId);
    return id != null ? new Set([id]) : new Set();
  });

  // Turns the user manually collapsed — never auto-expand these again
  const userCollapsed = useRef<Set<number>>(new Set());
  const prevLiveTurnId = useRef(liveTurnId);
  const prevLatestCompleted = useRef<number | null>(null);

  // Auto-expand new live turns (only when turnId changes)
  useEffect(() => {
    if (liveTurnId != null && liveTurnId !== prevLiveTurnId.current) {
      prevLiveTurnId.current = liveTurnId;
      userCollapsed.current.delete(liveTurnId);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(liveTurnId);
        return next;
      });
    }
  }, [liveTurnId]);

  // Auto-expand latest completed turn (only when it changes)
  useEffect(() => {
    let latest: number | null = null;
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t && snapshot.summaries[t.id]) {
        latest = t.id;
        break;
      }
    }
    if (
      latest != null &&
      latest !== prevLatestCompleted.current &&
      !userCollapsed.current.has(latest)
    ) {
      prevLatestCompleted.current = latest;
      setExpanded((prev) => {
        if (prev.has(latest)) return prev;
        const next = new Set(prev);
        next.add(latest);
        return next;
      });
    }
  }, [snapshot, turns]);

  const toggle = useCallback((turnId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
        userCollapsed.current.add(turnId);
      } else {
        next.add(turnId);
        userCollapsed.current.delete(turnId);
      }
      // Cap expanded set to avoid unbounded growth
      if (next.size > 100) {
        const ids = [...next];
        return new Set(ids.slice(-50));
      }
      return next;
    });
  }, []);

  const reversed = [...turns].reverse();

  return (
    <ul class="turn-list">
      {reversed.map((turn) => {
        const summary = snapshot.summaries[turn.id] ?? null;
        const isLive = turn.id === liveTurnId;

        // Skip turns with no summary and not live (shouldn't happen, but defensive)
        if (!summary && !isLive) {
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

        return (
          <TurnSummary
            key={turn.id}
            summary={summary}
            turn={turn}
            live={isLive ? live : null}
            expanded={expanded.has(turn.id)}
            onToggle={() => toggle(turn.id)}
            onDrillDown={onDrillDown}
            onOpenFile={onOpenFile}
            onShowDiff={onShowDiff}
          />
        );
      })}
    </ul>
  );
}
