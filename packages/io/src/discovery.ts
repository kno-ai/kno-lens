import { homedir } from "os";
import { join, resolve, sep } from "path";
import { readdir, stat } from "fs/promises";

// ─── Types ──────────────────────────────────────────────────────────────

export interface SessionInfo {
  /** Absolute path to the JSONL file. */
  path: string;
  /** Session ID (filename without extension). */
  sessionId: string;
  /** Last modification time. */
  modifiedAt: Date;
  /** Size in bytes. */
  sizeBytes: number;
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
