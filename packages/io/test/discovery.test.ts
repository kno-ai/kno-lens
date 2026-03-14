import { describe, it, expect } from "vitest";
import { claudeProjectDir, filterActiveSessions } from "../src/discovery.js";
import type { SessionInfo } from "../src/discovery.js";
import { join, resolve, sep } from "path";
import { homedir } from "os";

describe("claudeProjectDir", () => {
  it("converts workspace path to Claude project directory", () => {
    const result = claudeProjectDir("/Users/dev/code/my-project");
    expect(result).toBe(join(homedir(), ".claude", "projects", "-Users-dev-code-my-project"));
  });

  it("resolves relative paths before generating slug", () => {
    const result = claudeProjectDir("relative/path");
    const expected = resolve("relative/path").split(sep).join("-");
    const prefix = expected.startsWith("-") ? expected : `-${expected}`;
    expect(result).toBe(join(homedir(), ".claude", "projects", prefix));
  });

  it("normalizes paths with .. components", () => {
    const result = claudeProjectDir("/Users/dev/code/../other");
    expect(result).toBe(join(homedir(), ".claude", "projects", "-Users-dev-other"));
  });
});

describe("filterActiveSessions", () => {
  function makeSession(minutesAgo: number): SessionInfo {
    return {
      path: `/tmp/session-${minutesAgo}.jsonl`,
      sessionId: `session-${minutesAgo}`,
      modifiedAt: new Date(Date.now() - minutesAgo * 60_000),
      sizeBytes: 1000,
    };
  }

  it("includes sessions modified within threshold", () => {
    const sessions = [makeSession(1), makeSession(3)];
    const result = filterActiveSessions(sessions, 300_000);
    expect(result).toHaveLength(2);
  });

  it("excludes sessions modified beyond threshold", () => {
    const sessions = [makeSession(1), makeSession(10)];
    const result = filterActiveSessions(sessions, 300_000);
    expect(result).toHaveLength(1);
    expect(result[0]!.sessionId).toBe("session-1");
  });

  it("returns empty array when all sessions are old", () => {
    const sessions = [makeSession(60), makeSession(120)];
    const result = filterActiveSessions(sessions, 300_000);
    expect(result).toHaveLength(0);
  });

  it("uses default 5-minute threshold", () => {
    const sessions = [makeSession(4), makeSession(6)];
    const result = filterActiveSessions(sessions);
    expect(result).toHaveLength(1);
  });
});
