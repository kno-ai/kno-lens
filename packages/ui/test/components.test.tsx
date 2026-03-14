import { describe, it, expect } from "vitest";
import { render } from "preact";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import { App } from "../src/app.js";
import { LiveIndicator } from "../src/components/LiveIndicator.js";

import basicFixture from "../dev/fixtures/basic-session.json";
import liveFixture from "../dev/fixtures/live-session.json";

const basicSnapshot = basicFixture as unknown as SessionSnapshot;
const liveSnapshot = liveFixture.snapshot as unknown as SessionSnapshot;
const liveTurnState = liveFixture.live as unknown as LiveTurnState;

function renderInto(vnode: preact.VNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(vnode, container);
  return container;
}

function cleanup(container: HTMLDivElement) {
  render(null, container);
  container.remove();
}

describe("App", () => {
  it("renders with basic fixture data", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      // Should render session header with the slug
      expect(container.querySelector(".session-header")).not.toBeNull();
      expect(container.textContent).toContain("warm-crimson-eagle");
      // Should render the turn list
      expect(container.querySelector(".turn-list")).not.toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("shows empty state when snapshot is null", () => {
    const container = renderInto(
      <App snapshot={null} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".empty-state")).not.toBeNull();
      expect(container.textContent).toContain("No session loaded");
      // Should not render session header or turn list
      expect(container.querySelector(".session-header")).toBeNull();
      expect(container.querySelector(".turn-list")).toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("shows 'Invalid session data' for malformed snapshots", () => {
    const malformed = { garbage: true } as unknown as SessionSnapshot;
    const container = renderInto(
      <App snapshot={malformed} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".empty-state")).not.toBeNull();
      expect(container.textContent).toContain("Invalid session data");
    } finally {
      cleanup(container);
    }
  });

  it("renders session header with correct metadata from fixture", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const header = container.querySelector(".session-header")!;
      expect(header).not.toBeNull();

      // Slug name
      const name = header.querySelector(".session-header__name");
      expect(name).not.toBeNull();
      expect(name!.textContent).toContain("warm-crimson-eagle");

      // Metadata: git branch, turn count
      const meta = header.querySelector(".session-header__meta");
      expect(meta).not.toBeNull();
      expect(meta!.textContent).toContain("fix/connection-pool");
      expect(meta!.textContent).toContain("3 turns");

      // Activity stats: edits, cmds, errors
      const activity = header.querySelector(".session-header__activity");
      expect(activity).not.toBeNull();
      expect(activity!.textContent).toContain("3 edits");
      expect(activity!.textContent).toContain("8 cmds");
      expect(activity!.textContent).toContain("2 errors");
    } finally {
      cleanup(container);
    }
  });

  it("renders with live session fixture data", () => {
    const container = renderInto(
      <App snapshot={liveSnapshot} live={liveTurnState} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".session-header")).not.toBeNull();
      expect(container.querySelector(".live-indicator")).not.toBeNull();
      expect(container.querySelector(".turn-list")).not.toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("passes onOpenFile callback through to TurnList", () => {
    // The onOpenFile prop flows from App -> TurnList -> TurnSummary -> SummaryItemRow.
    // We verify it doesn't crash and the turn list renders items that could trigger it.
    const onOpenFile = (_path: string) => {};
    const container = renderInto(
      <App
        snapshot={basicSnapshot}
        live={null}
        config={DEFAULT_SUMMARY_CONFIG}
        onOpenFile={onOpenFile}
      />,
    );
    try {
      // The turn list should be rendered with items from the fixture
      expect(container.querySelector(".turn-list")).not.toBeNull();
      // Turn items should be present (the fixture has 3 turns with summaries)
      const turnItems = container.querySelectorAll(".turn-item");
      expect(turnItems.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });
});

describe("LiveIndicator", () => {
  it("renders when live state is provided", () => {
    const container = renderInto(<LiveIndicator live={liveTurnState} />);
    try {
      const indicator = container.querySelector(".live-indicator");
      expect(indicator).not.toBeNull();
      // Should show the prompt text
      expect(indicator!.textContent).toContain("Now update all the tests to match");
      // Should show the turn number
      expect(container.textContent).toContain("2");
      // Should show completed count
      expect(container.textContent).toContain("3 done");
      // Should show running activities
      expect(container.textContent).toContain("Reading test/auth.test.ts");
      expect(container.textContent).toContain("Searching for 'verifyToken'");
    } finally {
      cleanup(container);
    }
  });

  it("is hidden when live is null", () => {
    const container = renderInto(<LiveIndicator live={null} />);
    try {
      expect(container.querySelector(".live-indicator")).toBeNull();
      expect(container.textContent).toBe("");
    } finally {
      cleanup(container);
    }
  });

  it("is hidden when live.turnId is null", () => {
    const idleLive: LiveTurnState = {
      turnId: null,
      prompt: "",
      startedAt: "",
      runningActivities: [],
      completedCount: 0,
      errorCount: 0,
      lastCompleted: null,
      lastText: null,
    };
    const container = renderInto(<LiveIndicator live={idleLive} />);
    try {
      expect(container.querySelector(".live-indicator")).toBeNull();
    } finally {
      cleanup(container);
    }
  });
});
