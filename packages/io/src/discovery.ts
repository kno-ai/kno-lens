import { homedir } from "os";
import { join, resolve, sep } from "path";
import { readdir, stat } from "fs/promises";

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * How a session's project directory relates to the workspace path.
 * - `exact`: slug matches the workspace path exactly
 * - `child`: session was created in a subdirectory of the workspace
 * - `parent`: session was created in a parent directory of the workspace
 * - `other`: no path relationship to the workspace
 */
export type ProjectMatch = "exact" | "child" | "parent" | "other";

export interface SessionInfo {
  /** Absolute path to the JSONL file. */
  path: string;
  /** Session ID (filename without extension). */
  sessionId: string;
  /** Last modification time. */
  modifiedAt: Date;
  /** Size in bytes. */
  sizeBytes: number;
  /** Which project directory this session came from. */
  projectDir?: string;
  /** How the project directory relates to the workspace. */
  match?: ProjectMatch;
}

// ─── Path computation ──────────────────────────────────────────────────

/**
 * Compute the Claude projects directory for a workspace path.
 * `/Users/foo/code/bar` → `~/.claude/projects/-Users-foo-code-bar`
 */
export function claudeProjectDir(workspacePath: string): string {
  // Normalize to resolve . and .. before generating the slug
  const normalized = resolve(workspacePath);
  const slug = normalized.split(sep).join("-");
  // On macOS/Linux the path starts with /, so slug starts with "-"
  // On Windows it would start with "C:", which becomes "C:-..."
  const prefix = slug.startsWith("-") ? slug : `-${slug}`;
  return join(homedir(), ".claude", "projects", prefix);
}

/**
 * Discover all JSONL session files for a workspace.
 * Returns sessions sorted by modification time (most recent first).
 */
export async function discoverSessions(workspacePath: string): Promise<SessionInfo[]> {
  const dir = claudeProjectDir(workspacePath);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // Directory doesn't exist — no sessions
  }

  const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
  const results: SessionInfo[] = [];

  for (const file of jsonlFiles) {
    const fullPath = join(dir, file);
    try {
      const s = await stat(fullPath);
      results.push({
        path: fullPath,
        sessionId: file.replace(/\.jsonl$/, ""),
        modifiedAt: s.mtime,
        sizeBytes: s.size,
      });
    } catch {
      // File disappeared between readdir and stat — skip
    }
  }

  // Most recent first
  results.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return results;
}

/**
 * Detect which sessions appear active (modified within the last N seconds).
 */
export function filterActiveSessions(
  sessions: SessionInfo[],
  thresholdMs = 300_000,
): SessionInfo[] {
  const cutoff = Date.now() - thresholdMs;
  return sessions.filter((s) => s.modifiedAt.getTime() > cutoff);
}

// ─── Broad discovery ────────────────────────────────────────────────────

/** Sort priority for match types: exact first, then children, then parents. */
const MATCH_ORDER: Record<ProjectMatch, number> = { exact: 0, child: 1, parent: 2, other: 3 };

/**
 * Classify a project directory slug against the workspace slug.
 * Returns the match type, or null if unrelated.
 */
export function classifyProjectDir(workspaceSlug: string, dirSlug: string): ProjectMatch | null {
  if (dirSlug === workspaceSlug) return "exact";
  if (dirSlug.startsWith(workspaceSlug + "-")) return "child";
  if (workspaceSlug.startsWith(dirSlug + "-")) return "parent";
  return null;
}

/** Default maximum sessions returned by discoverAllSessions. */
export const DEFAULT_MAX_SESSIONS = 10;

/**
 * Discover sessions across all project directories.
 *
 * Scans every directory under `~/.claude/projects/` and classifies each
 * against the workspace path (exact, child, parent, or other). All
 * sessions are returned — workspace match is a ranking signal, not a
 * filter.
 *
 * Sorted by match quality (exact → child → parent → other), then by
 * modification time within each group. Limited to `maxSessions` results.
 */
export async function discoverAllSessions(
  workspacePath: string,
  maxSessions = DEFAULT_MAX_SESSIONS,
): Promise<SessionInfo[]> {
  const normalized = resolve(workspacePath);
  const workspaceSlug = normalized.split(sep).join("-");
  const workspacePrefix = workspaceSlug.startsWith("-") ? workspaceSlug : `-${workspaceSlug}`;
  const projectsRoot = join(homedir(), ".claude", "projects");

  let dirs: string[];
  try {
    dirs = await readdir(projectsRoot);
  } catch {
    return [];
  }

  const results: SessionInfo[] = [];

  for (const dirName of dirs) {
    const match = classifyProjectDir(workspacePrefix, dirName) ?? "other";

    const dirPath = join(projectsRoot, dirName);
    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      continue;
    }

    const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
    for (const file of jsonlFiles) {
      const fullPath = join(dirPath, file);
      try {
        const s = await stat(fullPath);
        results.push({
          path: fullPath,
          sessionId: file.replace(/\.jsonl$/, ""),
          modifiedAt: s.mtime,
          sizeBytes: s.size,
          projectDir: dirPath,
          match,
        });
      } catch {
        // File disappeared — skip
      }
    }
  }

  results.sort((a, b) => {
    const matchDiff = MATCH_ORDER[a.match!] - MATCH_ORDER[b.match!];
    if (matchDiff !== 0) return matchDiff;
    return b.modifiedAt.getTime() - a.modifiedAt.getTime();
  });

  return results.slice(0, maxSessions);
}
