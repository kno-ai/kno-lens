import type { Activity } from "@kno-lens/core";

const MAX_LABEL_LENGTH = 60;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

/**
 * Shorten an absolute path to its most useful tail segments.
 * "/Users/foo/code/my-project/packages/core/src/index.ts"
 * → "packages/core/src/index.ts"
 *
 * Heuristic: keep everything after the last occurrence of a
 * well-known root marker (packages/, src/, lib/, app/, etc.),
 * or fall back to the last 3 path segments.
 */
function shortPath(p: string): string {
  if (!p.startsWith("/")) return p;
  const markers = ["packages/", "apps/", "src/", "lib/", "app/", "test/"];
  for (const m of markers) {
    const idx = p.indexOf(m);
    if (idx > 0) return p.slice(idx);
  }
  // Fallback: last 3 segments
  const parts = p.split("/");
  if (parts.length > 3) return parts.slice(-3).join("/");
  return p;
}

/** Map an Activity to a human-readable one-liner. */
export function activityLabel(activity: Activity): string {
  switch (activity.kind) {
    case "file_read":
      return `Reading ${truncate(shortPath(activity.path), MAX_LABEL_LENGTH)}`;
    case "file_write":
      return `${activity.isNew ? "Creating" : "Writing"} ${truncate(shortPath(activity.path), MAX_LABEL_LENGTH)}`;
    case "file_edit":
      return `Editing ${truncate(shortPath(activity.path), MAX_LABEL_LENGTH)}`;
    case "bash":
      return `Running ${truncate(activity.command, MAX_LABEL_LENGTH)}`;
    case "search":
      return `Searching for '${truncate(activity.pattern, MAX_LABEL_LENGTH)}'`;
    case "fetch":
      return `Fetching ${truncate(activity.url, MAX_LABEL_LENGTH)}`;
    case "mcp_call":
      return `MCP: ${activity.server}/${activity.toolName}`;
    case "agent":
      return `Agent: ${truncate(activity.description ?? "sub-task", MAX_LABEL_LENGTH)}`;
    case "task":
      return `Task: ${activity.operation}${activity.subject ? ` — ${truncate(activity.subject, MAX_LABEL_LENGTH)}` : ""}`;
    case "ask_user":
      return "Waiting for your response";
    case "unknown":
      return `Tool: ${activity.rawToolName}`;
  }
}
