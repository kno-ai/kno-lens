/**
 * Shared session metadata line used by both Lens and Explorer headers.
 * Renders: branch · turns · edits · commands · errors · duration · tokens
 */
import type { SessionSnapshot } from "@kno-lens/view";
import { formatDuration, formatTokens } from "../utils.js";

interface SessionMetaProps {
  session: SessionSnapshot["session"];
  class?: string;
}

export function SessionMeta({ session, class: cls }: SessionMetaProps) {
  const { meta, stats } = session;
  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

  return (
    <div class={cls ?? "session-meta"}>
      {meta.gitBranch && <span>{meta.gitBranch}</span>}
      <span>
        {stats.totalTurns} turn{stats.totalTurns === 1 ? "" : "s"}
      </span>
      {stats.filesWritten.length > 0 && (
        <span>
          {stats.filesWritten.length} edit{stats.filesWritten.length === 1 ? "" : "s"}
        </span>
      )}
      {stats.commandsRun > 0 && (
        <span>
          {stats.commandsRun} command{stats.commandsRun === 1 ? "" : "s"}
        </span>
      )}
      {stats.errorCount > 0 && (
        <span>
          {stats.errorCount} error{stats.errorCount === 1 ? "" : "s"}
        </span>
      )}
      {stats.activeDurationMs > 0 && <span>{formatDuration(stats.activeDurationMs)}</span>}
      {totalTokens > 0 && <span>{formatTokens(totalTokens)}</span>}
    </div>
  );
}
