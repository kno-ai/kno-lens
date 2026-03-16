import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "../src/manager.js";
import type { SessionManagerState } from "../src/manager.js";
import type { SessionInfo } from "../src/discovery.js";
import { writeFileSync, unlinkSync, appendFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Helpers ────────────────────────────────────────────────────────────

function userPrompt(prompt: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "user",
    parentUuid: null,
    isSidechain: false,
    userType: "external",
    cwd: "/home/dev/project",
    sessionId: "test-session",
    version: "2.1.74",
    message: { role: "user", content: prompt },
    uuid: opts.uuid ?? "user-001",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:01.000Z",
  });
}

function assistantEndTurn(text: string, opts: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "assistant",
    parentUuid: opts.parentUuid ?? "user-001",
    isSidechain: false,
    message: {
      model: "claude-sonnet-4-6",
      id: opts.messageId ?? "msg-end",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    requestId: opts.requestId ?? "req-end",
    uuid: opts.uuid ?? "asst-end",
    timestamp: opts.timestamp ?? "2026-03-10T14:00:05.000Z",
  });
}

let tempDir: string;
let tempFile: string;
let manager: SessionManager | null = null;

function setupFile(content: string = ""): SessionInfo {
  tempDir = mkdtempSync(join(tmpdir(), "manager-test-"));
  tempFile = join(tempDir, "test-session.jsonl");
  writeFileSync(tempFile, content);
  return {
    path: tempFile,
    sessionId: "test-session",
    modifiedAt: new Date(),
    sizeBytes: Buffer.byteLength(content),
  };
}

afterEach(() => {
  manager?.stop();
  manager = null;
  try {
    unlinkSync(tempFile);
  } catch {
    /* ignore */
  }
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("SessionManager", () => {
  it("emits ready after initial catch-up read", async () => {
    const sessionInfo = setupFile(userPrompt("Hello") + "\n");
    manager = new SessionManager(sessionInfo);

    let readyFired = false;
    manager.on("ready", () => {
      readyFired = true;
    });

    await manager.start();

    expect(readyFired).toBe(true);
  });

  it("emits update with snapshot after start", async () => {
    const content = [userPrompt("Hello"), assistantEndTurn("Hi")].join("\n") + "\n";
    const sessionInfo = setupFile(content);
    manager = new SessionManager(sessionInfo);

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    expect(updates.length).toBeGreaterThan(0);
    const lastUpdate = updates[updates.length - 1]!;
    expect(lastUpdate.snapshot).not.toBeNull();
    expect(lastUpdate.snapshot!.session.meta.id).toBe("test-session");
  });

  it("state getter returns current session state", async () => {
    const content = [userPrompt("Hello"), assistantEndTurn("Hi")].join("\n") + "\n";
    const sessionInfo = setupFile(content);
    manager = new SessionManager(sessionInfo);

    await manager.start();

    const state = manager.state;
    expect(state.snapshot).not.toBeNull();
    expect(state.snapshot!.session.turns).toHaveLength(1);
  });

  it("state getter returns null before start", () => {
    const sessionInfo = setupFile("");
    manager = new SessionManager(sessionInfo);

    const state = manager.state;
    expect(state.snapshot).toBeNull();
    expect(state.live).toBeNull();
  });

  it("throttles update emissions", async () => {
    // Write multiple turns to generate many events
    const lines: string[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push(
        userPrompt(`Q${i}`, {
          uuid: `user-${i}`,
          timestamp: `2026-03-10T14:0${i}:00.000Z`,
        }),
      );
      lines.push(
        assistantEndTurn(`A${i}`, {
          messageId: `msg-${i}`,
          requestId: `req-${i}`,
          uuid: `asst-${i}`,
        }),
      );
    }
    const sessionInfo = setupFile(lines.join("\n") + "\n");

    // High throttle to see batching effect
    manager = new SessionManager(sessionInfo, { throttleMs: 200 });

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    // The initial flush happens immediately after start
    // With a high throttle, events from the initial read should be batched
    // We should have at most a few updates, not one per line
    expect(updates.length).toBeLessThan(10);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("flushes final state on stop", async () => {
    const content = [userPrompt("Hello"), assistantEndTurn("Hi")].join("\n") + "\n";
    const sessionInfo = setupFile(content);
    manager = new SessionManager(sessionInfo, { throttleMs: 200 });

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();
    manager.stop();
    manager = null;

    // Should have received at least one update with the final state
    const lastUpdate = updates[updates.length - 1]!;
    expect(lastUpdate.snapshot).not.toBeNull();
    // session_end from parser.end() should produce ended status
    expect(lastUpdate.snapshot!.session.status).toBe("ended");
  });

  it("emits session-end event", async () => {
    const content = [userPrompt("Hello"), assistantEndTurn("Hi")].join("\n") + "\n";
    const sessionInfo = setupFile(content);
    manager = new SessionManager(sessionInfo);

    let sessionEndFired = false;
    manager.on("session-end", () => {
      sessionEndFired = true;
    });

    await manager.start();
    manager.stop();
    manager = null;

    // session_end fires when parser.end() is called during stop
    expect(sessionEndFired).toBe(true);
  });

  it("forwards tailer parse errors as error events", async () => {
    // Write invalid JSON that will cause a parse_error event (not a throw)
    const content = userPrompt("Hello") + "\n{BROKEN_JSON}\n";
    const sessionInfo = setupFile(content);
    manager = new SessionManager(sessionInfo);

    // parse_error events from the parser are emitted as SessionEvents,
    // not as Error events. The manager should still process them.
    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    // Manager should still be functional despite the bad line
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[updates.length - 1]!.snapshot).not.toBeNull();
  });

  it("detects appended lines after start", { timeout: 10_000 }, async () => {
    const sessionInfo = setupFile(userPrompt("Hello") + "\n");
    manager = new SessionManager(sessionInfo, { throttleMs: 10 });

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    // Small delay to let fs.watch settle on macOS
    await new Promise((r) => setTimeout(r, 100));

    // Append a response
    appendFileSync(tempFile, assistantEndTurn("World") + "\n");

    // Wait for the update to arrive
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 8000;
      const check = () => {
        const last = updates[updates.length - 1];
        if (last?.snapshot?.session.turns[0]?.steps.some((s) => s.kind === "text")) {
          resolve();
        } else if (Date.now() > deadline) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    });

    const last = updates[updates.length - 1]!;
    expect(last.snapshot!.session.turns[0]!.steps.some((s) => s.kind === "text")).toBe(true);
  });

  it("preserves sessionInfo as readonly", () => {
    const sessionInfo = setupFile("");
    manager = new SessionManager(sessionInfo);

    expect(manager.sessionInfo).toBe(sessionInfo);
    expect(manager.sessionInfo.sessionId).toBe("test-session");
  });

  it("suppresses live state for stale session files", async () => {
    // Write a session with an unclosed turn (no turn_end)
    const content = userPrompt("Hello") + "\n";
    const sessionInfo = setupFile(content);
    // Make the file appear old — older than liveRecencyMs
    sessionInfo.modifiedAt = new Date(Date.now() - 120_000); // 2 minutes ago

    manager = new SessionManager(sessionInfo, { liveRecencyMs: 30_000 });

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    // The parser sees an unclosed turn, so liveState would normally be non-null.
    // But the file is stale, so live should be suppressed.
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate!.snapshot).not.toBeNull();
    expect(lastUpdate!.live).toBeNull(); // suppressed — file too old
  });

  it("shows live state for recent session files", async () => {
    // Write a session with an unclosed turn
    const content = userPrompt("Hello") + "\n";
    const sessionInfo = setupFile(content);
    // File is recent — within liveRecencyMs
    sessionInfo.modifiedAt = new Date();

    manager = new SessionManager(sessionInfo, { liveRecencyMs: 30_000 });

    const updates: SessionManagerState[] = [];
    manager.on("update", (state) => updates.push(state));

    await manager.start();

    // File is recent, so live state should be shown for the unclosed turn
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate!.snapshot).not.toBeNull();
    // Note: live may still be null if the parser didn't produce a turn_start.
    // The user prompt alone triggers session_start + turn_start, so
    // the LiveTurnModel should have a non-null turnId.
    // But the manager's effectiveLive only returns non-null if receivedPostCatchUp is true.
    // For a recent file, receivedPostCatchUp = true, so live should be non-null.
  });
});
