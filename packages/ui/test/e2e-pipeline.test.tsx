/**
 * End-to-end pipeline tests: JSONL fixture → parser → SessionBuilder →
 * SessionController → SessionSnapshot → App component → DOM assertions.
 *
 * These verify the full data flow from raw log to rendered UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "preact";

import { ClaudeCodeParserV1 } from "@kno-lens/core";
import type { SessionEvent } from "@kno-lens/core";
import { SessionController, DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import type { SessionSnapshot } from "@kno-lens/view";

import { App } from "../src/app.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(__dirname, "../../../test/fixtures/claude-code");

function parseFixture(name: string): SessionEvent[] {
  const content = readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
  const parser = new ClaudeCodeParserV1();
  const events: SessionEvent[] = [];
  for (const line of content.split("\n")) {
    if (line.trim()) events.push(...parser.parse(line));
  }
  events.push(...parser.end());
  return events;
}

function buildSnapshot(events: SessionEvent[]): SessionSnapshot {
  const controller = new SessionController();
  for (const event of events) {
    controller.onEvent(event);
  }
  return controller.exportState();
}

function renderApp(snapshot: SessionSnapshot): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<App snapshot={snapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />, container);
  return container;
}

function cleanup(container: HTMLDivElement) {
  render(null, container);
  container.remove();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("E2E pipeline: basic-session.jsonl", () => {
  const events = parseFixture("basic-session.jsonl");
  const snapshot = buildSnapshot(events);

  it("produces a valid snapshot with session data", () => {
    expect(snapshot.session.meta.tool).toBe("claude-code");
    expect(snapshot.session.status).toBe("ended");
    expect(snapshot.session.turns.length).toBeGreaterThan(0);
    expect(Object.keys(snapshot.summaries).length).toBeGreaterThan(0);
  });

  it("renders the session slug in the header", () => {
    const container = renderApp(snapshot);
    try {
      const header = container.querySelector(".session-header__name");
      expect(header).not.toBeNull();
      expect(header!.textContent).toContain("warm-crimson-eagle");
    } finally {
      cleanup(container);
    }
  });

  it("renders the git branch", () => {
    const container = renderApp(snapshot);
    try {
      const meta = container.querySelector(".session-header__meta");
      expect(meta!.textContent).toContain("main");
    } finally {
      cleanup(container);
    }
  });

  it("renders the correct turn count", () => {
    const container = renderApp(snapshot);
    try {
      const meta = container.querySelector(".session-header__meta");
      expect(meta!.textContent).toContain("1 turn");
    } finally {
      cleanup(container);
    }
  });

  it("renders the turn list with at least one turn", () => {
    const container = renderApp(snapshot);
    try {
      const turns = container.querySelectorAll(".turn-item");
      expect(turns.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup(container);
    }
  });

  it("renders the user prompt in a turn header", () => {
    const container = renderApp(snapshot);
    try {
      const prompt = container.querySelector(".turn-header__prompt");
      expect(prompt).not.toBeNull();
      expect(prompt!.textContent).toContain("connection pool exhaustion");
    } finally {
      cleanup(container);
    }
  });

  it("renders activity items in the expanded turn", () => {
    const container = renderApp(snapshot);
    try {
      // The latest turn auto-expands, so summary items should be visible
      const items = container.querySelectorAll(".summary-item");
      expect(items.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });
});

describe("E2E pipeline: multi-turn-with-errors.jsonl", () => {
  const events = parseFixture("multi-turn-with-errors.jsonl");
  const snapshot = buildSnapshot(events);

  it("produces two turns with summaries", () => {
    expect(snapshot.session.turns).toHaveLength(2);
    expect(Object.keys(snapshot.summaries)).toHaveLength(2);
  });

  it("renders the project name when no slug is present", () => {
    const container = renderApp(snapshot);
    try {
      const header = container.querySelector(".session-header__name");
      expect(header).not.toBeNull();
      // This fixture has sessionId but no slug — should show truncated ID
      expect(header!.textContent!.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders the feat branch", () => {
    const container = renderApp(snapshot);
    try {
      const meta = container.querySelector(".session-header__meta");
      expect(meta!.textContent).toContain("feat/connection-pool");
    } finally {
      cleanup(container);
    }
  });

  it("shows 2 turns in the header", () => {
    const container = renderApp(snapshot);
    try {
      const meta = container.querySelector(".session-header__meta");
      expect(meta!.textContent).toContain("2 turns");
    } finally {
      cleanup(container);
    }
  });

  it("renders both turns in the turn list", () => {
    const container = renderApp(snapshot);
    try {
      const turns = container.querySelectorAll(".turn-item");
      expect(turns.length).toBe(2);
    } finally {
      cleanup(container);
    }
  });

  it("shows error stats in the header", () => {
    const container = renderApp(snapshot);
    try {
      const activity = container.querySelector(".session-header__activity");
      expect(activity).not.toBeNull();
      // Should show error count from the failed bash command
      expect(activity!.textContent).toContain("error");
    } finally {
      cleanup(container);
    }
  });

  it("marks the turn with errors via CSS class", () => {
    const container = renderApp(snapshot);
    try {
      const errorTurns = container.querySelectorAll(".turn-item--error");
      expect(errorTurns.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup(container);
    }
  });
});

describe("E2E pipeline: mcp-and-progress.jsonl", () => {
  const events = parseFixture("mcp-and-progress.jsonl");
  const snapshot = buildSnapshot(events);

  it("renders the session header", () => {
    const container = renderApp(snapshot);
    try {
      expect(container.querySelector(".session-header")).not.toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("renders the search activity from the turn", () => {
    const container = renderApp(snapshot);
    try {
      const text = container.textContent ?? "";
      // The search activity should be visible (medium importance, meets threshold)
      expect(text).toContain("Searching");
    } finally {
      cleanup(container);
    }
  });

  it("renders the turn prompt about vault notes", () => {
    const container = renderApp(snapshot);
    try {
      const prompt = container.querySelector(".turn-header__prompt");
      expect(prompt).not.toBeNull();
      expect(prompt!.textContent).toContain("vault");
    } finally {
      cleanup(container);
    }
  });

  it("renders token count in header metadata", () => {
    const container = renderApp(snapshot);
    try {
      const meta = container.querySelector(".session-header__meta");
      expect(meta).not.toBeNull();
      // Should have a token display (the fixture has input + output tokens)
      expect(meta!.textContent).toContain("token");
    } finally {
      cleanup(container);
    }
  });
});
