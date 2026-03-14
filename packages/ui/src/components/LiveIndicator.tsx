import { useState, useEffect } from "preact/hooks";
import type { LiveTurnState, LiveActivity } from "@kno-lens/view";

/** Extract the last non-empty line — catches Claude's short transitional phrases. */
function lastLine(text: string): string {
  const line =
    text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .pop() ?? text;
  return line.trim();
}

/** Format elapsed seconds as a compact string: "5s", "1m 23s", "1h 2m". */
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Ticking elapsed time for a running activity. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(since).getTime();
  if (isNaN(start)) return null;

  const ms = now - start;
  if (ms < 2000) return null; // don't show for first 2s — too noisy for quick tools

  return <span class="live-activity__elapsed">{formatElapsed(ms)}</span>;
}

/** Activities that benefit from an elapsed timer (long-running by nature). */
const LONG_RUNNING_KINDS = new Set(["agent", "bash", "mcp_call"]);

function ActivityRow({ activity }: { activity: LiveActivity }) {
  const showElapsed = LONG_RUNNING_KINDS.has(activity.kind);

  return (
    <div class="live-activity">
      {showElapsed && <span class="live-dot live-dot--muted" />}
      <span class="live-activity__label" title={activity.label}>
        {activity.label}
      </span>
      {showElapsed && <Elapsed since={activity.startedAt} />}
    </div>
  );
}

interface LiveIndicatorProps {
  live: LiveTurnState | null;
}

export function LiveIndicator({ live }: LiveIndicatorProps) {
  const inTurn = live != null && live.turnId != null;

  if (!inTurn) return null;

  const hasActivities = live!.completedCount > 0 || live!.runningActivities.length > 0;

  return (
    <div class="live-indicator">
      <div class="turn-header">
        <div class="turn-header__prompt" title={live!.prompt}>
          <span class="turn-header__turn-num">{live!.turnId}</span>
          {live!.prompt}
        </div>
        {hasActivities && (
          <div class="live-indicator__counts">
            {live!.completedCount} done
            {live!.errorCount > 0 && (
              <>
                , <span class="turn-header__stat--error">{live!.errorCount} err</span>
              </>
            )}
          </div>
        )}
      </div>
      {live!.runningActivities.length > 0 &&
        live!.runningActivities.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
      {!live!.runningActivities.length && live!.lastText && (
        <div class="live-activity">
          <span class="live-dot live-dot--muted" />
          <span class="live-activity__label" title={live!.lastText}>
            {lastLine(live!.lastText)}
          </span>
        </div>
      )}
    </div>
  );
}
