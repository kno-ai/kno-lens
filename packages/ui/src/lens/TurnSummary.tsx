import { useState, useEffect } from "preact/hooks";
import type { TurnSummary as TurnSummaryData, LiveTurnState } from "@kno-lens/view";
import { TurnDetail } from "../shared/TurnDetail.js";
import { formatDurationShort } from "../utils.js";

interface TurnSummaryProps {
  summary: TurnSummaryData | null;
  turn: {
    id: number;
    prompt: string;
    startedAt: string;
    durationMs?: number | undefined;
    tokenUsage: { inputTokens?: number | undefined; outputTokens?: number | undefined };
    errorCount: number;
  };
  live: LiveTurnState | null;
  expanded: boolean;
  onToggle: () => void;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
}

/** Ticking elapsed time. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(since).getTime();
  if (isNaN(start)) return null;
  const ms = now - start;
  if (ms < 2000) return null;

  return <span class="live-indicator__elapsed">{formatDurationShort(ms)}</span>;
}

/** Does this turn have any content worth expanding? */
function hasDetail(
  summary: TurnSummaryData | null,
  live: LiveTurnState | null,
  isLive: boolean,
): boolean {
  if (isLive) return true;
  // Completed turns always have at least the counts row (Turn N + stats)
  return summary != null;
}

export function TurnSummary({
  summary,
  turn,
  live,
  expanded,
  onToggle,
  onDrillDown,
  onOpenFile,
  onShowDiff,
}: TurnSummaryProps) {
  const isLive = live != null && live.turnId === turn.id;
  const prompt = summary?.prompt ?? turn.prompt;
  const expandable = hasDetail(summary, live, isLive);

  const turnClass = [
    "turn-item",
    isLive && "turn-item--live",
    expanded && expandable && "turn-item--expanded",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li class={turnClass}>
      <div
        class={`turn-header${expandable ? "" : " turn-header--static"}`}
        onClick={expandable ? onToggle : undefined}
      >
        <div class="turn-header__prompt" title={prompt}>
          {prompt}
        </div>
        {isLive && <Elapsed since={live.startedAt} />}
      </div>
      {expanded && expandable && (
        <TurnDetail
          summary={summary}
          turn={turn}
          live={isLive ? live : null}
          onDrillDown={onDrillDown}
          onOpenFile={onOpenFile}
          onShowDiff={onShowDiff}
        />
      )}
    </li>
  );
}
