import { getCategoryDef } from "@kno-lens/view";

export function formatDuration(ms: number): string {
  if (ms < 60_000) return "< 1m";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

/** Compact duration: "5s", "2m 15s", "1h 3m". */
export function formatDurationShort(ms: number): string {
  if (ms <= 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatTokens(count: number): string {
  if (count < 1_000) return `${count} tokens`;
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k tokens`;
  return `${(count / 1_000_000).toFixed(1)}M tokens`;
}

/** Compact format for table cells where the column header already says "Tokens". */
export function formatTokensCompact(count: number): string {
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function categoryIcon(category: string): string {
  return getCategoryDef(category).icon;
}

/**
 * Map a colorToken from the registry to a CSS class suffix.
 * Returns the modifier class for `.summary-item__icon--{suffix}`.
 */
const COLOR_TOKEN_TO_CLASS: Record<string, string> = {
  green: "summary-item__icon--green",
  orange: "summary-item__icon--orange",
  blue: "summary-item__icon--blue",
  red: "summary-item__icon--red",
  yellow: "summary-item__icon--yellow",
  magenta: "summary-item__icon--magenta",
  muted: "summary-item__icon--muted",
};

export function categoryIconClass(category: string): string {
  const { colorToken } = getCategoryDef(category);
  const modifier = COLOR_TOKEN_TO_CLASS[colorToken] ?? "summary-item__icon--muted";
  return `summary-item__icon ${modifier}`;
}
