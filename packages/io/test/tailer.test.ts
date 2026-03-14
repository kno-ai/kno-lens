import { describe, it, expect, afterEach } from "vitest";
import { SessionTailer } from "../src/tailer.js";
import type { SessionEvent } from "@kno-lens/core";
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

function assistantEndTurn(text: string) {
  return JSON.stringify({
    type: "assistant",
    parentUuid: "user-001",
    isSidechain: false,
    message: {
      model: "claude-sonnet-4-6",
      id: "msg-end",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    requestId: "req-end",
    uuid: "asst-end",
    timestamp: "2026-03-10T14:00:05.000Z",
  });
}

let tempDir: string;
let tempFile: string;
let tailer: SessionTailer | null = null;

function setup(content: string = ""): string {
  tempDir = mkdtempSync(join(tmpdir(), "tailer-test-"));
  tempFile = join(tempDir, "session.jsonl");
  writeFileSync(tempFile, content);
  return tempFile;
}

afterEach(() => {
  tailer?.stop();
  tailer = null;
  try {
    unlinkSync(tempFile);
  } catch {
    /* ignore */
  }
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("SessionTailer", () => {
  it("reads existing file content on start", async () => {
    const file = setup(userPrompt("Hello") + "\n");
    tailer = new SessionTailer(file);

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    const sessionStart = allEvents.find((e) => e.type === "session_start");
    expect(sessionStart).toBeDefined();

    const turnStart = allEvents.find((e) => e.type === "turn_start");
    expect(turnStart).toMatchObject({ turnId: 1, prompt: "Hello" });
  });

  it("emits parsed events for each line", async () => {
    const lines = [userPrompt("Hello"), assistantEndTurn("Hi there")].join("\n") + "\n";
    const file = setup(lines);
    tailer = new SessionTailer(file);

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    const types = allEvents.map((e) => e.type);
    expect(types).toContain("session_start");
    expect(types).toContain("turn_start");
    expect(types).toContain("text_output");
    expect(types).toContain("turn_end");
  });

  it("skips empty lines without error", async () => {
    const content = userPrompt("Hello") + "\n\n\n" + assistantEndTurn("Hi") + "\n";
    const file = setup(content);
    tailer = new SessionTailer(file);

    const errors: Error[] = [];
    tailer.on("error", (err) => errors.push(err));

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    expect(errors).toHaveLength(0);
    expect(allEvents.find((e) => e.type === "turn_start")).toBeDefined();
  });

  it("recovers from malformed JSON lines", async () => {
    const content = userPrompt("Hello") + "\nNOT VALID JSON\n" + assistantEndTurn("Hi") + "\n";
    const file = setup(content);
    tailer = new SessionTailer(file);

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    // Parser should emit parse_error for bad line, but continue
    const parseErrors = allEvents.filter((e) => e.type === "parse_error");
    expect(parseErrors.length).toBeGreaterThan(0);

    // Good lines still parsed
    expect(allEvents.find((e) => e.type === "session_start")).toBeDefined();
  });

  it("emits parser end() events when stopped", async () => {
    const file = setup(userPrompt("Hello") + "\n");
    tailer = new SessionTailer(file);

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    // Stop should flush parser state — session_end comes from parser.end()
    tailer.stop();
    tailer = null; // prevent double-stop in afterEach

    const sessionEnd = allEvents.find((e) => e.type === "session_end");
    expect(sessionEnd).toBeDefined();
  });

  it("emits end event when stopped", async () => {
    const file = setup(userPrompt("Hello") + "\n");
    tailer = new SessionTailer(file);

    let endEmitted = false;
    tailer.on("end", () => {
      endEmitted = true;
    });

    await tailer.start();
    tailer.stop();
    tailer = null;

    expect(endEmitted).toBe(true);
  });

  it("throws if started after being stopped", async () => {
    const file = setup("");
    tailer = new SessionTailer(file);

    await tailer.start();
    tailer.stop();

    await expect(tailer.start()).rejects.toThrow("already stopped");
    tailer = null;
  });

  it("detects appended lines via file watch", { timeout: 10_000 }, async () => {
    const file = setup(userPrompt("Hello") + "\n");
    tailer = new SessionTailer(file);

    const allEvents: SessionEvent[] = [];
    tailer.on("events", (events) => allEvents.push(...events));

    await tailer.start();

    // Small delay to let fs.watch settle on macOS
    await new Promise((r) => setTimeout(r, 100));

    // Append a new line after start
    appendFileSync(file, assistantEndTurn("World") + "\n");

    // Wait for fs.watch to trigger and the read to complete
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 8000;
      const check = () => {
        if (allEvents.some((e) => e.type === "text_output")) {
          resolve();
        } else if (Date.now() > deadline) {
          resolve(); // let assertion fail rather than timeout
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    });

    const textOut = allEvents.find((e) => e.type === "text_output");
    expect(textOut).toBeDefined();
    if (textOut?.type === "text_output") {
      expect(textOut.text).toBe("World");
    }
  });

  it("handles stop during initial read without crashing", async () => {
    // Write a larger file to increase chance of stop during read
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(
        userPrompt(`Question ${i}`, {
          uuid: `user-${i}`,
          timestamp: `2026-03-10T14:0${String(i).padStart(2, "0")}:00.000Z`,
        }),
      );
      lines.push(assistantEndTurn(`Answer ${i}`));
    }
    const file = setup(lines.join("\n") + "\n");
    tailer = new SessionTailer(file);

    const errors: Error[] = [];
    tailer.on("error", (err) => errors.push(err));

    // Start and immediately stop
    const startPromise = tailer.start();
    tailer.stop();
    tailer = null;

    // Should not throw or leave dangling promises
    await startPromise.catch(() => {
      /* expected */
    });
    expect(errors).toHaveLength(0);
  });
});
