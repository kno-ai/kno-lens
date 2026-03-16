import { describe, it, expect } from "vitest";
import { claudeProjectDir, filterActiveSessions, classifyProjectDir } from "../src/discovery.js";
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

describe("classifyProjectDir", () => {
  it("returns exact for identical slugs", () => {
    expect(classifyProjectDir("-Users-dev-code-project", "-Users-dev-code-project")).toBe("exact");
  });

  it("returns child when dir slug extends workspace slug", () => {
    expect(classifyProjectDir("-Users-dev-code-project", "-Users-dev-code-project-subdir")).toBe(
      "child",
    );
  });

  it("returns parent when workspace slug extends dir slug", () => {
    expect(classifyProjectDir("-Users-dev-code-project-subdir", "-Users-dev-code-project")).toBe(
      "parent",
    );
  });

  it("returns null for unrelated slugs", () => {
    expect(classifyProjectDir("-Users-dev-code-project", "-Users-dev-other")).toBeNull();
  });

  it("does not match partial path components", () => {
    // -Users-dev-code-pro should NOT match -Users-dev-code-project
    // because "pro" is not a full component of "project"
    expect(classifyProjectDir("-Users-dev-code-pro", "-Users-dev-code-project")).toBeNull();
  });

  it("requires separator after prefix for child match", () => {
    expect(classifyProjectDir("-Users-dev-code-kno-ai", "-Users-dev-code-kno-air")).toBeNull();
  });
});
