import type { Activity, Turn } from "@kno-lens/core";
import { activityLabel } from "../live/labels.js";
import type { SummaryConfig } from "./config.js";
import type { ItemDetailLine, SummaryItem, TurnSummary, TurnSummaryStats } from "./types.js";
import { getCategoryDef } from "./registry.js";

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Summarize edit as a line count (e.g. "3 lines modified"). */
function editLinesSummary(
  oldStr: string | undefined,
  newStr: string | undefined,
): string | undefined {
  if (!oldStr && !newStr) return undefined;
  const oldLines = oldStr ? oldStr.split("\n").length : 0;
  const newLines = newStr ? newStr.split("\n").length : 0;
  const total = Math.max(oldLines, newLines);
  return `${total} line${total === 1 ? "" : "s"} modified`;
}

/** Extract the last text response from a completed turn (truncated for display). */
const MAX_RESPONSE_CHARS = 300;

function extractResponse(turn: Turn): string | undefined {
  // Walk steps in reverse to find the last text block
  for (let i = turn.steps.length - 1; i >= 0; i--) {
    const step = turn.steps[i];
    if (step && step.kind === "text" && step.text.trim()) {
      // Collapse multiple newlines and normalize whitespace for display
      const text = step.text
        .trim()
        .replace(/\n{2,}/g, " ")
        .replace(/\n/g, " ");
      if (text.length <= MAX_RESPONSE_CHARS) return text;
      return text.slice(0, MAX_RESPONSE_CHARS) + "…";
    }
  }
  return undefined;
}

// ─── Bash command classification ─────────────────────────────────────────

/**
 * Patterns to derive semantic categories from bash commands.
 * Matched against the command string at word boundaries, accounting for
 * compound commands (&&, ||, ;, |). Order matters — first match wins.
 * Errors take precedence (checked before these patterns).
 */
const DELETE_PATTERN = /(?:^|[;&|]\s*)(?:rm|git\s+rm|rimraf|unlink|del|erase|Remove-Item|ri)\b/;
const INSTALL_PATTERN =
  /(?:^|[;&|]\s*)(?:npm\s+(?:install|i|ci|add)|yarn\s+(?:add|install)|pnpm\s+(?:add|install|i)|pip\s+install|brew\s+install|apt(?:-get)?\s+install|cargo\s+install|go\s+install)\b/;
const TEST_PATTERN =
  /(?:^|[;&|]\s*)(?:npm\s+test|npm\s+run\s+test|yarn\s+test|pnpm\s+test|vitest|jest|pytest|cargo\s+test|go\s+test|make\s+test)\b/;

/** Derive a semantic category from a bash command string. Returns null if no pattern matches. */
function classifyBashCommand(
  command: string,
): "file_deleted" | "package_install" | "test_run" | null {
  if (DELETE_PATTERN.test(command)) return "file_deleted";
  if (TEST_PATTERN.test(command)) return "test_run";
  if (INSTALL_PATTERN.test(command)) return "package_install";
  return null;
}

// ─── Classification ──────────────────────────────────────────────────────

interface ClassifiedActivity {
  category: string;
  importance: "high" | "medium" | "low";
  label: string;
  detail?: string | undefined;
  activityId: string;
  expandedDetail?: ItemDetailLine[] | undefined;
  filePath?: string | undefined;
}

/**
 * Map an activity to its display category and extract metadata.
 * Most kinds map 1:1, but a few derive the category from metadata:
 *   - file_write → "file_created" or "file_edited"
 *   - bash with error status → "bash_error"
 */
/** Extract structured detail lines for inline expansion. */
function extractDetail(activity: Activity): ItemDetailLine[] | undefined {
  switch (activity.kind) {
    case "file_edit":
      // Edit details are shown via the View Diff action, not inline
      return undefined;
    case "bash": {
      const lines: ItemDetailLine[] = [];
      if (activity.output) lines.push({ text: activity.output, style: "code" });
      if (activity.error) lines.push({ text: activity.error, style: "error" });
      if (activity.exitCode != null && activity.exitCode !== 0) {
        const parts = [`exit ${activity.exitCode}`];
        if (activity.durationMs != null) parts.push(`${(activity.durationMs / 1000).toFixed(1)}s`);
        lines.push({ text: parts.join(" · "), style: "code" });
      } else if (activity.durationMs != null && activity.durationMs >= 1000) {
        lines.push({ text: `${(activity.durationMs / 1000).toFixed(1)}s`, style: "code" });
      }
      return lines.length > 0 ? lines : undefined;
    }
    case "search": {
      if (activity.matchedFiles && activity.matchedFiles.length > 0) {
        return activity.matchedFiles.slice(0, 5).map((f) => ({
          text: f.split("/").pop() ?? f,
          style: "path" as const,
          filePath: f,
        }));
      }
      return undefined;
    }
    case "ask_user": {
      const lines: ItemDetailLine[] = [];
      if (activity.question) lines.push({ text: activity.question });
      if (activity.answer) lines.push({ text: activity.answer, style: "code" });
      return lines.length > 0 ? lines : undefined;
    }
    case "agent": {
      const lines: ItemDetailLine[] = [];
      if (activity.subagentType) lines.push({ text: activity.subagentType });
      if (activity.prompt) lines.push({ text: activity.prompt, style: "code" });
      return lines.length > 0 ? lines : undefined;
    }
    default: {
      if (activity.error) return [{ text: activity.error, style: "error" }];
      return undefined;
    }
  }
}

function classifyActivity(activity: Activity): ClassifiedActivity {
  const base = {
    activityId: activity.id,
    label: activityLabel(activity),
    expandedDetail: extractDetail(activity),
  };

  // Extract file path for file-related activities
  const filePath =
    activity.kind === "file_read" || activity.kind === "file_write" || activity.kind === "file_edit"
      ? activity.path
      : undefined;

  // Kinds that derive category from metadata
  switch (activity.kind) {
    case "file_write": {
      const category = activity.isNew ? "file_created" : "file_edited";
      return {
        ...base,
        filePath,
        category,
        importance: getCategoryDef(category).defaultImportance as "high" | "medium" | "low",
      };
    }
    case "file_edit": {
      const editDetail = editLinesSummary(activity.oldString, activity.newString);
      return {
        ...base,
        filePath,
        category: "file_edited",
        importance: getCategoryDef("file_edited").defaultImportance as "high" | "medium" | "low",
        detail: editDetail,
      };
    }
    case "bash": {
      if (activity.status === "error") {
        return {
          ...base,
          category: "bash_error",
          importance: getCategoryDef("bash_error").defaultImportance as "high" | "medium" | "low",
          detail: activity.exitCode != null ? `exit ${activity.exitCode}` : undefined,
        };
      }
      const derivedCategory = classifyBashCommand(activity.command);
      const category = derivedCategory ?? "bash";
      return {
        ...base,
        category,
        importance: getCategoryDef(category).defaultImportance as "high" | "medium" | "low",
      };
    }
    case "search":
      return {
        ...base,
        category: "search",
        importance: getCategoryDef("search").defaultImportance as "high" | "medium" | "low",
        detail:
          activity.resultCount != null
            ? `${activity.resultCount} result${activity.resultCount === 1 ? "" : "s"}`
            : undefined,
      };
    case "agent": {
      const parts: string[] = [];
      if (activity.subagentType) parts.push(activity.subagentType);
      if (activity.durationMs != null) parts.push(formatDuration(activity.durationMs));
      return {
        ...base,
        category: "agent",
        importance: getCategoryDef("agent").defaultImportance as "high" | "medium" | "low",
        detail: parts.length > 0 ? parts.join(" · ") : activity.agentSessionId,
      };
    }
    default: {
      // 1:1 mapping — use the activity kind as category directly
      const def = getCategoryDef(activity.kind);
      return {
        ...base,
        filePath,
        category: activity.kind,
        importance: def.defaultImportance as "high" | "medium" | "low",
      };
    }
  }
}

// ─── Grouping ────────────────────────────────────────────────────────────

const IMPORTANCE_ORDER = { high: 3, medium: 2, low: 1 } as const;

function higherImportance(
  a: "high" | "medium" | "low",
  b: "high" | "medium" | "low",
): "high" | "medium" | "low" {
  return IMPORTANCE_ORDER[a] >= IMPORTANCE_ORDER[b] ? a : b;
}

const MAX_GROUPED_DETAIL_LINES = 8;

const FILE_CATEGORIES = new Set(["file_read", "file_edited", "file_created", "file_deleted"]);

function groupConsecutiveItems(items: SummaryItem[]): SummaryItem[] {
  const grouped: SummaryItem[] = [];

  for (const item of items) {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.category === item.category) {
      // For file categories, build expandedDetail from individual file paths.
      // Deduplicate: if the same file appears again, don't add a second entry.
      if (FILE_CATEGORIES.has(item.category)) {
        if (!prev.expandedDetail) {
          prev.expandedDetail = [];
          if (prev.filePath) {
            prev.expandedDetail.push({
              text: prev.filePath.split("/").pop() ?? prev.filePath,
              style: "path" as const,
              filePath: prev.filePath,
              activityId: prev.activityIds[0],
            });
          }
        }
        if (item.filePath && prev.expandedDetail.length < MAX_GROUPED_DETAIL_LINES) {
          const alreadyListed = prev.expandedDetail.some((d) => d.filePath === item.filePath);
          if (!alreadyListed) {
            prev.expandedDetail.push({
              text: item.filePath.split("/").pop() ?? item.filePath,
              style: "path" as const,
              filePath: item.filePath,
              activityId: item.activityIds[0],
            });
          }
        }
      }

      // Merge into the previous group
      prev.activityIds.push(...item.activityIds);
      const count = prev.activityIds.length;
      prev.label = getCategoryDef(item.category).groupLabel(count);
      prev.importance = higherImportance(prev.importance, item.importance);
      prev.filePath = undefined; // grouped items can't open a single file
      // Collect individual details (cap at a reasonable display length)
      if (prev.detail && item.detail) {
        if (prev.detail.length < 500) {
          prev.detail = `${prev.detail}, ${item.detail}`;
        }
      } else if (item.detail) {
        prev.detail = item.detail;
      }
      // Merge expanded detail lines for non-file categories (capped)
      if (!FILE_CATEGORIES.has(item.category) && item.expandedDetail) {
        if (!prev.expandedDetail) {
          prev.expandedDetail = [...item.expandedDetail];
        } else if (prev.expandedDetail.length < MAX_GROUPED_DETAIL_LINES) {
          prev.expandedDetail.push(
            ...item.expandedDetail.slice(0, MAX_GROUPED_DETAIL_LINES - prev.expandedDetail.length),
          );
        }
      }
    } else {
      grouped.push({
        ...item,
        activityIds: [...item.activityIds],
        expandedDetail: item.expandedDetail ? [...item.expandedDetail] : undefined,
      });
    }
  }

  return grouped;
}

// ─── Stats ───────────────────────────────────────────────────────────────

function computeStats(classified: ClassifiedActivity[]): TurnSummaryStats {
  const stats: TurnSummaryStats = {
    filesCreated: 0,
    filesEdited: 0,
    filesDeleted: 0,
    filesRead: 0,
    commandsRun: 0,
    commandsFailed: 0,
    searchesRun: 0,
    errors: 0,
  };

  for (const c of classified) {
    switch (c.category) {
      case "file_created":
        stats.filesCreated++;
        break;
      case "file_edited":
        stats.filesEdited++;
        break;
      case "file_deleted":
        stats.filesDeleted++;
        break;
      case "file_read":
        stats.filesRead++;
        break;
      case "bash":
      case "test_run":
      case "package_install":
        stats.commandsRun++;
        break;
      case "bash_error":
        stats.commandsFailed++;
        stats.errors++;
        break;
      case "search":
        stats.searchesRun++;
        break;
      case "error":
        stats.errors++;
        break;
    }
  }

  return stats;
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Pure function: Turn + config → TurnSummary. Deterministic. */
export function summarizeTurn(turn: Turn, config: SummaryConfig): TurnSummary {
  // 1. Classify all activities
  const classified: ClassifiedActivity[] = [];
  for (const step of turn.steps) {
    if (step.kind === "activity") {
      classified.push(classifyActivity(step.activity));
    }
  }

  // 2. Compute stats from classified activities (before filtering)
  const stats = computeStats(classified);

  // 3. Apply importance overrides from config
  for (const c of classified) {
    const override = config.importance[c.category];
    if (override && override !== "hidden") {
      c.importance = override;
    }
  }

  // 4. Filter out hidden categories and items below minimum importance
  const importanceRank: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const minRank = importanceRank[config.defaultMinImportance] ?? 2;

  const visible = classified.filter((c) => {
    const override = config.importance[c.category];
    if (override === "hidden") return false;
    return (importanceRank[c.importance] ?? 0) >= minRank;
  });

  // 5. Build SummaryItems
  let items: SummaryItem[] = visible.map((c) => ({
    importance: c.importance,
    category: c.category,
    label: c.label,
    detail: c.detail,
    activityIds: [c.activityId],
    expandedDetail: c.expandedDetail,
    filePath: c.filePath,
  }));

  // 6. Group consecutive same-category items
  if (config.groupConsecutive) {
    items = groupConsecutiveItems(items);
  }

  // 7. Apply maxVisibleItems
  if (items.length > config.maxVisibleItems) {
    const hidden = items.length - config.maxVisibleItems;
    items = items.slice(0, config.maxVisibleItems);
    items.push({
      importance: "low",
      category: "other",
      label: `…and ${hidden} more`,
      activityIds: [],
    });
  }

  return {
    turnId: turn.id,
    prompt: turn.prompt,
    items,
    stats,
    response: extractResponse(turn),
  };
}
