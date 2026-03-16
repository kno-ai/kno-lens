/**
 * Shared turn detail component used by both Lens (expanded turn) and
 * Explorer (detail pane). One implementation, same visual language.
 */
import { useState, useEffect } from "preact/hooks";
import type { TurnSummary, SummaryItem, LiveTurnState } from "@kno-lens/view";
import { categoryIcon, categoryIconClass, formatDurationShort, formatTokens } from "../utils.js";

// ─── Props ────────────────────────────────────────────────────

export interface TurnDetailProps {
  /** Completed turn summary (null for live-only turns). */
  summary: TurnSummary | null;
  /** Turn-level data for counts row. */
  turn: {
    id: number;
    prompt: string;
    startedAt: string;
    durationMs?: number | undefined;
    tokenUsage: { inputTokens?: number | undefined; outputTokens?: number | undefined };
  };
  /** Live state when this turn is active. */
  live: LiveTurnState | null;
  /** Show the prompt text inside the detail. Explorer shows it; Lens already has it in the header. */
  showPrompt?: boolean;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  onDrillDown?: ((activityId: string) => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────

export function TurnDetail({
  summary,
  turn,
  live,
  showPrompt,
  onOpenFile,
  onShowDiff,
  onDrillDown,
}: TurnDetailProps) {
  const isLive = live != null && live.turnId === turn.id;

  // Use pre-computed counts from summary, or live state for active turns
  const c = summary?.counts;
  const lc = isLive ? live.activityCounts : null;
  const edits = c?.edits ?? lc?.edits ?? 0;
  const deletes = c?.deletes ?? lc?.deletes ?? 0;
  const cmds = c?.commands ?? lc?.commands ?? 0;
  const reads = c?.reads ?? lc?.reads ?? 0;
  const searches = c?.searches ?? lc?.searches ?? 0;
  const tokens = c?.tokens ?? 0;
  const durationMs = c?.durationMs ?? 0;

  const response = isLive ? live.lastText : summary?.response;

  return (
    <div class={`turn-detail${isLive ? " turn-detail--live" : ""}`}>
      {/* Prompt (optional — Explorer shows it, Lens already has it in the header) */}
      {showPrompt && (
        <CollapsibleText
          text={summary?.prompt ?? turn.prompt}
          class="turn-detail__prompt"
          clampClass="turn-detail__prompt--clamped"
        />
      )}

      {/* Response */}
      {response && (
        <CollapsibleText
          text={response}
          class="turn-detail__response"
          clampClass="turn-detail__response--clamped"
          clampThreshold={200}
        />
      )}

      {/* Live phase indicators */}
      {isLive && <LivePhase live={live} />}

      {/* Counts row — only show if there's something beyond the turn number */}
      {(edits > 0 ||
        deletes > 0 ||
        cmds > 0 ||
        reads > 0 ||
        searches > 0 ||
        tokens > 0 ||
        durationMs > 0) && (
        <div class="turn-detail__counts">
          <Count label="Turn" value={turn.id} />
          {edits > 0 && <Count label="Edits" value={edits} />}
          {deletes > 0 && <Count label="Deletes" value={deletes} />}
          {cmds > 0 && <Count label="Commands" value={cmds} />}
          {reads > 0 && <Count label="Reads" value={reads} />}
          {searches > 0 && <Count label="Searches" value={searches} />}
          {durationMs > 0 && <Count label="Duration" value={formatDurationShort(durationMs)} />}
          {tokens > 0 && <Count label="Tokens" value={formatTokens(tokens)} />}
        </div>
      )}

      {/* Activity items — live completed activities */}
      {isLive && live.completedActivities.length > 0 && (
        <>
          <div class="turn-detail__section-label">
            Activity
            {live.lastCompleted && <TickingAge since={live.lastCompleted.startedAt} />}
          </div>
          <div class="turn-detail__items">
            {live.completedActivities.map((act) => (
              <LiveActivityItem key={act.id} act={act} onOpenFile={onOpenFile} />
            ))}
          </div>
        </>
      )}

      {/* Activity items — completed turn summary */}
      {!isLive && summary && summary.items.length > 0 && (
        <>
          <div class="turn-detail__section-label">Activity</div>
          <div class="turn-detail__items">
            {summary.items.map((item, i) => (
              <DetailItem
                key={i}
                item={item}
                onOpenFile={onOpenFile}
                onShowDiff={onShowDiff}
                onDrillDown={onDrillDown}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

// ─── Ticking components ───────────────────────────────────────

/** Shows "Xs ago" next to the Activity label, ticking every second. */
function TickingAge({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(since).getTime();
  if (isNaN(start)) return null;
  const s = Math.floor((now - start) / 1000);
  if (s < 2) return null;

  return (
    <span class="turn-detail__section-age">
      {s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`}
    </span>
  );
}

// ─── Subcomponents ────────────────────────────────────────────

function Count({ label, value }: { label: string; value: string | number }) {
  return (
    <div class="turn-detail__count">
      <span class="turn-detail__count-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function CollapsibleText({
  text,
  class: cls,
  clampClass,
  clampThreshold = 120,
}: {
  text: string;
  class: string;
  clampClass: string;
  clampThreshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > clampThreshold || text.includes("\n");

  return (
    <div
      class={`${cls}${!expanded && isLong ? ` ${clampClass}` : ""}`}
      onClick={isLong ? () => setExpanded((v) => !v) : undefined}
      style={isLong ? { cursor: "pointer" } : undefined}
    >
      {text}
    </div>
  );
}

function LivePhase({ live }: { live: LiveTurnState }) {
  const hasRunning = live.runningActivities.length > 0;
  const isThinking = live.isThinking && !hasRunning;

  if (!isThinking && !hasRunning) return null;

  return (
    <div class="turn-detail__live-section">
      {isThinking && (
        <div class="turn-detail__live-phase turn-detail__live-phase--thinking">Thinking…</div>
      )}
      {hasRunning &&
        live.runningActivities.map((act) => (
          <div key={act.id} class="turn-detail__live-activity">
            <span class="turn-detail__live-activity-label">{act.label}</span>
          </div>
        ))}
    </div>
  );
}

function LiveActivityItem({
  act,
  onOpenFile,
}: {
  act: {
    id: string;
    label: string;
    kind: string;
    status?: string | undefined;
    filePath?: string | undefined;
  };
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  const clickable = act.filePath && onOpenFile;
  return (
    <div
      class={`turn-detail__item${clickable ? " turn-detail__item--clickable" : ""}`}
      onClick={clickable ? () => onOpenFile!(act.filePath!) : undefined}
      title={act.filePath ?? act.label}
    >
      <span class={categoryIconClass(act.kind)}>{categoryIcon(act.kind)}</span>
      <span class="turn-detail__item-label">
        {clickable && act.filePath && act.label.includes(act.filePath) ? (
          <>
            {act.label.slice(0, act.label.indexOf(act.filePath))}
            <span class="turn-detail__item-label--link">
              {act.filePath.split("/").slice(-2).join("/")}
            </span>
          </>
        ) : (
          act.label
        )}
      </span>
      {act.status === "error" && (
        <span class="turn-detail__item-detail" style="color: var(--vscode-charts-red)">
          error
        </span>
      )}
    </div>
  );
}

function shortPath(fullPath: string): string {
  const parts = fullPath.split("/");
  return parts.length > 1 ? parts.slice(-2).join("/") : fullPath;
}

function DetailItem({
  item,
  onOpenFile,
  onShowDiff,
  onDrillDown,
}: {
  item: SummaryItem;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  onDrillDown?: ((activityId: string) => void) | undefined;
}) {
  const isPlaceholder = item.activityIds.length === 0;
  const canOpenFile = onOpenFile && item.filePath;
  const canDiff =
    item.category === "file_edited" && item.detail && onShowDiff && item.activityIds.length === 1;
  const canDrillDown = onDrillDown && item.activityIds.length === 1;

  const handleClick = () => {
    if (canDiff) onShowDiff!(item.activityIds[0]!);
    else if (canOpenFile) onOpenFile(item.filePath!);
    else if (canDrillDown) onDrillDown!(item.activityIds[0]!);
  };

  const clickable = !isPlaceholder && (canDiff || canOpenFile || canDrillDown);

  if (isPlaceholder) {
    return (
      <div class="turn-detail__item turn-detail__item--placeholder">
        <span class="turn-detail__item-label">{item.label}</span>
      </div>
    );
  }

  const hasSubItems =
    item.expandedDetail && item.expandedDetail.length > 0 && item.activityIds.length > 1;

  return (
    <div>
      <div
        class={`turn-detail__item${clickable ? " turn-detail__item--clickable" : ""}`}
        onClick={clickable ? handleClick : undefined}
        title={item.filePath ?? item.label}
      >
        <span class={categoryIconClass(item.category)}>{categoryIcon(item.category)}</span>
        <span class="turn-detail__item-label">{item.label}</span>
        {item.detail && !hasSubItems && <span class="turn-detail__item-detail">{item.detail}</span>}
      </div>
      {!hasSubItems && clickable && item.filePath && (
        <div class="turn-detail__subitems">
          <div
            class="turn-detail__subitem turn-detail__subitem--link"
            onClick={() => {
              if (canDiff) onShowDiff!(item.activityIds[0]!);
              else if (canOpenFile) onOpenFile!(item.filePath!);
            }}
            title={item.filePath}
          >
            {shortPath(item.filePath)}
          </div>
        </div>
      )}
      {hasSubItems && (
        <div class="turn-detail__subitems">
          {item.expandedDetail!.map((line, i) => {
            const path = line.filePath ?? (line.style === "path" ? line.text : undefined);
            const subClickable = path && onOpenFile;
            return (
              <div
                key={i}
                class={`turn-detail__subitem${subClickable ? " turn-detail__subitem--link" : ""}`}
                onClick={subClickable ? () => onOpenFile!(path) : undefined}
                title={line.filePath}
              >
                {line.filePath ? shortPath(line.filePath) : line.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
