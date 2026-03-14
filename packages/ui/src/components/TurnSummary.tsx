import * as preact from "preact";
import { useState, useCallback, useMemo } from "preact/hooks";
import type { TurnSummary as TurnSummaryData, SummaryItem, ItemDetailLine } from "@kno-lens/view";
import type { CategoryFilter } from "../filter.js";
import type { SearchSnippet } from "../search.js";
import { itemMatchesSearch } from "../search.js";
import { categoryIcon, categoryIconClass } from "../utils.js";

const EDIT_CATEGORIES = new Set(["file_created", "file_edited", "file_deleted"]);

interface TurnSummaryProps {
  summary: TurnSummaryData;
  expanded: boolean;
  onToggle: () => void;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  activeFilter?: CategoryFilter | null | undefined;
  searchQuery?: string | undefined;
  searchSnippets?: SearchSnippet[] | undefined;
}

/** Build a compact summary of destructive/error actions in the other tier. */
function otherActionsSummary(items: SummaryItem[]): string {
  const DESTRUCTIVE: Record<string, string> = {
    bash_error: "failed",
    error: "error",
    file_deleted: "deleted",
  };
  const counts: Record<string, number> = {};
  for (const item of items) {
    const label = DESTRUCTIVE[item.category];
    if (label) {
      counts[label] = (counts[label] ?? 0) + item.activityIds.length;
    }
  }
  const parts = Object.entries(counts).map(([label, n]) => `${n} ${label}`);
  return parts.join(", ");
}

export function TurnSummary({
  summary,
  expanded,
  onToggle,
  onDrillDown,
  onOpenFile,
  onShowDiff,
  activeFilter,
  searchQuery,
  searchSnippets,
}: TurnSummaryProps) {
  const { stats } = summary;
  const hasSnippets = searchSnippets && searchSnippets.length > 0;
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [othersExpanded, setOthersExpanded] = useState(false);

  const toggleItem = useCallback((index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Partition items into edit tier and other tier, preserving original indices
  const { editItems, otherItems } = useMemo(() => {
    const edits: Array<{ item: SummaryItem; index: number }> = [];
    const others: Array<{ item: SummaryItem; index: number }> = [];
    summary.items.forEach((item, i) => {
      if (EDIT_CATEGORIES.has(item.category)) {
        edits.push({ item, index: i });
      } else {
        others.push({ item, index: i });
      }
    });
    return { editItems: edits, otherItems: others };
  }, [summary.items]);

  // When searching, auto-expand other actions so matches are visible
  const effectiveOthersExpanded = othersExpanded || !!searchQuery;
  // When filtering by category, expand others if the filter targets non-edit categories
  const filterExpandsOthers = activeFilter
    ? otherItems.some((e) => activeFilter.categories.has(e.item.category))
    : false;
  const showOthers = effectiveOthersExpanded || filterExpandsOthers;

  const hasErrors = stats.commandsFailed > 0;
  const turnClass = [
    "turn-item",
    hasErrors && "turn-item--error",
    expanded && "turn-item--expanded",
  ]
    .filter(Boolean)
    .join(" ");

  const renderItem = ({ item, index }: { item: SummaryItem; index: number }) => {
    const dimByFilter = activeFilter ? !activeFilter.categories.has(item.category) : false;
    const dimBySearch = searchQuery ? !itemMatchesSearch(item, searchQuery) : false;
    return (
      <SummaryItemRow
        key={index}
        item={item}
        onDrillDown={onDrillDown}
        onOpenFile={onOpenFile}
        onShowDiff={onShowDiff}
        dimmed={dimByFilter || dimBySearch}
        searchQuery={searchQuery}
        itemExpanded={expandedItems.has(index)}
        onToggleExpand={() => toggleItem(index)}
      />
    );
  };

  return (
    <li class={turnClass}>
      <div class="turn-header" onClick={onToggle}>
        <div class="turn-header__prompt" title={summary.prompt}>
          <span class="turn-header__turn-num">{summary.turnId}</span>
          {highlightText(summary.prompt, searchQuery)}
        </div>
        <StatsBadges stats={stats} />
      </div>
      {hasSnippets && !expanded && (
        <div class="turn-snippets">
          {searchSnippets.map((s, i) => (
            <SnippetRow key={i} snippet={s} />
          ))}
        </div>
      )}
      {expanded && (
        <div class="turn-body">
          {/* Tier 0: Answer */}
          {summary.response && (
            <div class="turn-response">{highlightText(summary.response, searchQuery)}</div>
          )}
          {/* Tier 1: Edits */}
          {editItems.length > 0 && editItems.map(renderItem)}
          {/* Tier 2: Other actions (collapsed) */}
          {otherItems.length > 0 && (
            <div class="turn-other-actions">
              <div class="turn-other-toggle" onClick={() => setOthersExpanded((prev) => !prev)}>
                <span class="turn-other-toggle__label">
                  {showOthers
                    ? `\u25b4 ${otherItems.length} more action${otherItems.length === 1 ? "" : "s"}`
                    : `\u25be ${otherItems.length} more action${otherItems.length === 1 ? "" : "s"} \u2026`}
                </span>
                <span class="turn-other-toggle__detail">
                  {otherActionsSummary(otherItems.map((e) => e.item))}
                </span>
              </div>
              {showOthers && otherItems.map(renderItem)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const SNIPPET_SOURCE_LABEL: Record<SearchSnippet["source"], string> = {
  prompt: "prompt",
  response: "answer",
  label: "activity",
  detail: "detail",
};

function SnippetRow({ snippet }: { snippet: SearchSnippet }) {
  return (
    <div class="snippet">
      <span class="snippet__source">{SNIPPET_SOURCE_LABEL[snippet.source]}</span>
      <span class="snippet__text">
        {snippet.before}
        <mark class="snippet__match">{snippet.match}</mark>
        {snippet.after}
      </span>
    </div>
  );
}

function StatsBadges({ stats }: { stats: TurnSummaryData["stats"] }) {
  const parts: Array<{ label: string; error?: boolean }> = [];
  if (stats.filesCreated > 0) parts.push({ label: `+${stats.filesCreated} created` });
  if (stats.filesEdited > 0) parts.push({ label: `${stats.filesEdited} edited` });
  if (stats.filesDeleted > 0) parts.push({ label: `${stats.filesDeleted} deleted`, error: true });
  if (stats.commandsFailed > 0)
    parts.push({ label: `${stats.commandsFailed} failed`, error: true });

  if (parts.length === 0) return null;

  return (
    <div class="turn-header__stats">
      {parts.map((p, i) => (
        <span key={i} class={`turn-header__stat${p.error ? " turn-header__stat--error" : ""}`}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

/** Highlight all occurrences of `query` within `text` using <mark>. */
function highlightText(text: string, query: string | undefined): preact.JSX.Element | string {
  if (!query) return text;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;

  const parts: (string | preact.JSX.Element)[] = [];
  let cursor = 0;
  let pos = idx;
  let key = 0;
  while (pos !== -1) {
    if (pos > cursor) parts.push(text.slice(cursor, pos));
    parts.push(
      <mark key={key++} class="snippet__match">
        {text.slice(pos, pos + query.length)}
      </mark>,
    );
    cursor = pos + query.length;
    pos = lower.indexOf(qLower, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function SummaryItemRow({
  item,
  onOpenFile,
  onShowDiff,
  dimmed,
  searchQuery,
  itemExpanded,
  onToggleExpand,
}: {
  item: SummaryItem;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  onShowDiff?: ((activityId: string) => void) | undefined;
  dimmed?: boolean | undefined;
  searchQuery?: string | undefined;
  itemExpanded?: boolean | undefined;
  onToggleExpand?: (() => void) | undefined;
}) {
  const hasDetail = item.expandedDetail && item.expandedDetail.length > 0;
  const canOpenFile = onOpenFile && item.filePath;
  // Only file_edit activities produce a detail string ("N lines modified").
  // file_write overwrites share the "file_edited" category but have no detail
  // and the connector can't show diffs for them — so we require detail here
  // to avoid a silent no-op click.
  const canDiffSingle =
    item.category === "file_edited" &&
    item.detail &&
    onShowDiff &&
    item.activityIds.length === 1 &&
    item.activityIds[0] != null;

  // Three action types:
  //   expand (in-place)  — items with expandedDetail
  //   open tab           — single file open or single diff
  //   none               — static info, not clickable
  const opensTab = !hasDetail && (canDiffSingle || canOpenFile);
  const actionable = hasDetail || opensTab;

  const handleClick = () => {
    if (hasDetail) {
      onToggleExpand?.();
    } else if (canDiffSingle) {
      onShowDiff!(item.activityIds[0]);
    } else if (canOpenFile) {
      onOpenFile(item.filePath!);
    }
  };

  const classes = [
    "summary-item",
    actionable && "summary-item--clickable",
    opensTab && "summary-item--link",
    item.importance === "low" && "summary-item--low",
    dimmed && "summary-item--dimmed",
  ]
    .filter(Boolean)
    .join(" ");

  const isEditDetail = item.detail && item.category === "file_edited";
  const canShowDiff =
    isEditDetail && onShowDiff && item.activityIds.length === 1 && item.activityIds[0] != null;

  return (
    <div>
      <div class={classes} onClick={actionable ? handleClick : undefined}>
        <span class={categoryIconClass(item.category)}>{categoryIcon(item.category)}</span>
        <span class="summary-item__label" title={item.label}>
          {highlightText(item.label, searchQuery)}
        </span>
        {!isEditDetail && item.detail && (
          <span class="summary-item__detail" title={item.detail}>
            {highlightText(item.detail, searchQuery)}
          </span>
        )}
      </div>
      {isEditDetail &&
        (canShowDiff ? (
          <span
            class="summary-item__diff-link"
            title="View Diff"
            onClick={(e) => {
              e.stopPropagation();
              onShowDiff!(item.activityIds[0]);
            }}
          >
            {item.detail}
          </span>
        ) : (
          <span class="summary-item__edit-detail">{item.detail}</span>
        ))}
      {itemExpanded && item.expandedDetail && (
        <div class="item-detail">
          {item.expandedDetail.map((line, i) => {
            let lineClick: (() => void) | undefined;
            // Path-style lines are clickable: use filePath if set, fall back to text
            const path = line.filePath ?? (line.style === "path" ? line.text : undefined);
            if (path && onOpenFile) {
              lineClick = () => onOpenFile!(path);
            }
            return <DetailLine key={i} line={line} onClick={lineClick} />;
          })}
        </div>
      )}
    </div>
  );
}

function DetailLine({
  line,
  onClick,
}: {
  line: ItemDetailLine;
  onClick?: (() => void) | undefined;
}) {
  const styleClass = line.style ? `item-detail__line--${line.style}` : "";
  const clickable = !!onClick;
  return (
    <div
      class={`item-detail__line ${styleClass}${clickable ? " item-detail__line--clickable" : ""}`}
      onClick={onClick}
    >
      {line.style === "added" && <span class="item-detail__prefix">+</span>}
      {line.style === "removed" && <span class="item-detail__prefix">-</span>}
      <span class="item-detail__text">{line.text}</span>
    </div>
  );
}
