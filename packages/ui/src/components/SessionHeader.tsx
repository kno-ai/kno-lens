import type { SessionSnapshot } from "@kno-lens/view";
import { formatDuration, formatTokens } from "../utils.js";

interface SessionHeaderProps {
  session: SessionSnapshot["session"];
  onFilter?: ((filter: string) => void) | undefined;
}

export function SessionHeader({ session, onFilter }: SessionHeaderProps) {
  const { meta, stats } = session;
  const name = meta.slug ?? (meta.id.length > 12 ? meta.id.slice(0, 8) + "…" : meta.id);

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

  // Session activity summary — clickable to filter
  const activity: Array<{ label: string; filter: string }> = [];
  if (stats.filesWritten.length > 0) {
    activity.push({
      label: `${stats.filesWritten.length} edit${stats.filesWritten.length === 1 ? "" : "s"}`,
      filter: "edits",
    });
  }
  if (stats.commandsRun > 0) {
    activity.push({
      label: `${stats.commandsRun} cmd${stats.commandsRun === 1 ? "" : "s"}`,
      filter: "commands",
    });
  }
  if (stats.errorCount > 0) {
    activity.push({
      label: `${stats.errorCount} error${stats.errorCount === 1 ? "" : "s"}`,
      filter: "errors",
    });
  }

  return (
    <div class="session-header">
      <h2 class="session-header__name" title={meta.slug ?? meta.id}>
        {name}
      </h2>
      <div class="session-header__meta">
        {meta.gitBranch && <span>{meta.gitBranch}</span>}
        <span>
          {stats.totalTurns} turn{stats.totalTurns === 1 ? "" : "s"}
        </span>
        {totalTokens > 0 && <span>{formatTokens(totalTokens)}</span>}
        {stats.activeDurationMs > 0 && <span>{formatDuration(stats.activeDurationMs)}</span>}
      </div>
      {activity.length > 0 && (
        <div class="session-header__activity">
          {activity.map((a, i) => (
            <span
              key={i}
              class={`session-header__activity-stat${onFilter ? " session-header__activity--clickable" : ""}`}
              data-filter={a.filter}
              onClick={onFilter ? () => onFilter(a.filter) : undefined}
              title={onFilter ? `Filter: ${a.label}` : undefined}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
