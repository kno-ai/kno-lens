import * as preact from "preact";
import { useState, useCallback } from "preact/hooks";
import type { TurnSummary as TurnSummaryData, SummaryItem, ItemDetailLine } from "@kno-lens/view";
import type { CategoryFilter } from "../filter.js";
import type { SearchSnippet } from "../search.js";
import { itemMatchesSearch } from "../search.js";
import { categoryIcon, categoryIconClass } from "../utils.js";

interface TurnSummaryProps {
  summary: TurnSummaryData;
  expanded: boolean;
  onToggle: () => void;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  activeFilter?: CategoryFilter | null | undefined;
  searchQuery?: string | undefined;
  searchSnippets?: SearchSnippet[] | undefined;
}

export function TurnSummary({
  summary,
  expanded,
  onToggle,
  onDrillDown,
  onOpenFile,
  activeFilter,
  searchQuery,
  searchSnippets,
}: TurnSummaryProps) {
  const { stats } = summary;
  const hasSnippets = searchSnippets && searchSnippets.length > 0;
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleItem = useCallback((index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const hasErrors = stats.commandsFailed > 0;
  const turnClass = [
    "turn-item",
    hasErrors && "turn-item--error",
    expanded && "turn-item--expanded",
  ]
    .filter(Boolean)
    .join(" ");

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
      {expanded && summary.items.length > 0 && (
        <div class="turn-body">
          {summary.items.map((item, i) => {
            const dimByFilter = activeFilter ? !activeFilter.categories.has(item.category) : false;
            const dimBySearch = searchQuery ? !itemMatchesSearch(item, searchQuery) : false;
            return (
              <SummaryItemRow
                key={i}
                item={item}
                onDrillDown={onDrillDown}
                onOpenFile={onOpenFile}
                dimmed={dimByFilter || dimBySearch}
                searchQuery={searchQuery}
                itemExpanded={expandedItems.has(i)}
                onToggleExpand={() => toggleItem(i)}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

const SNIPPET_SOURCE_LABEL: Record<SearchSnippet["source"], string> = {
  prompt: "prompt",
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
  if (stats.filesRead > 0) parts.push({ label: `${stats.filesRead} read` });
  if (stats.commandsRun > 0) parts.push({ label: `${stats.commandsRun} cmd` });
  if (stats.commandsFailed > 0)
    parts.push({ label: `${stats.commandsFailed} failed`, error: true });
  if (stats.searchesRun > 0) parts.push({ label: `${stats.searchesRun} search` });

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
  onDrillDown,
  onOpenFile,
  dimmed,
  searchQuery,
  itemExpanded,
  onToggleExpand,
}: {
  item: SummaryItem;
  onDrillDown?: ((activityId: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
  dimmed?: boolean | undefined;
  searchQuery?: string | undefined;
  itemExpanded?: boolean | undefined;
  onToggleExpand?: (() => void) | undefined;
}) {
  const hasDetail = item.expandedDetail && item.expandedDetail.length > 0;
  const canOpenFile = onOpenFile && item.filePath;
  const expandable = hasDetail || canOpenFile || (onDrillDown && item.activityIds[0] != null);

  const handleClick = () => {
    if (hasDetail) {
      onToggleExpand?.();
    } else if (canOpenFile) {
      onOpenFile(item.filePath!);
    } else {
      const firstActivityId = item.activityIds[0];
      if (onDrillDown && firstActivityId != null) {
        onDrillDown(firstActivityId);
      }
    }
  };

  const classes = [
    "summary-item",
    expandable && "summary-item--clickable",
    item.importance === "low" && "summary-item--low",
    dimmed && "summary-item--dimmed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div class={classes} onClick={handleClick}>
        <span class={categoryIconClass(item.category)}>{categoryIcon(item.category)}</span>
        <span class="summary-item__label" title={item.label}>
          {highlightText(item.label, searchQuery)}
        </span>
        {item.detail && (
          <span class="summary-item__detail" title={item.detail}>
            {highlightText(item.detail, searchQuery)}
          </span>
        )}
      </div>
      {itemExpanded && item.expandedDetail && (
        <div class="item-detail">
          {item.expandedDetail.map((line, i) => (
            <DetailLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailLine({ line }: { line: ItemDetailLine }) {
  const styleClass = line.style ? `item-detail__line--${line.style}` : "";
  return (
    <div class={`item-detail__line ${styleClass}`}>
      {line.style === "added" && <span class="item-detail__prefix">+</span>}
      {line.style === "removed" && <span class="item-detail__prefix">-</span>}
      <span class="item-detail__text">{line.text}</span>
    </div>
  );
}
