import { describe, it, expect } from "vitest";
import { render } from "preact";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import { App } from "../src/app.js";
import { LiveIndicator } from "../src/components/LiveIndicator.js";
import { searchSnapshot } from "../src/search.js";

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
      expect(meta!.textContent).toContain("4 turns");

      // Activity stats: edits, cmds, errors
      const activity = header.querySelector(".session-header__activity");
      expect(activity).not.toBeNull();
      expect(activity!.textContent).toContain("6 edits");
      expect(activity!.textContent).toContain("1 deleted");
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

  it("passes onShowDiff callback through to TurnList", () => {
    const onShowDiff = (_activityId: string) => {};
    const container = renderInto(
      <App
        snapshot={basicSnapshot}
        live={null}
        config={DEFAULT_SUMMARY_CONFIG}
        onShowDiff={onShowDiff}
      />,
    );
    try {
      expect(container.querySelector(".turn-list")).not.toBeNull();
      const turnItems = container.querySelectorAll(".turn-item");
      expect(turnItems.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders response text in expanded turns", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      // The latest turn auto-expands and the fixture has response text
      const response = container.querySelector(".turn-response");
      expect(response).not.toBeNull();
      expect(response!.textContent!.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders edit detail as clickable link when onShowDiff is provided", () => {
    const onShowDiff = (_activityId: string) => {};
    const container = renderInto(
      <App
        snapshot={basicSnapshot}
        live={null}
        config={DEFAULT_SUMMARY_CONFIG}
        onShowDiff={onShowDiff}
      />,
    );
    try {
      // The fixture has file_edited items with "N lines modified" detail
      const links = container.querySelectorAll(".summary-item__diff-link");
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]!.textContent).toContain("modified");
    } finally {
      cleanup(container);
    }
  });

  it("renders edit detail as plain text when onShowDiff is not provided", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      // Without onShowDiff, edit details should not be diff links
      const links = container.querySelectorAll(".summary-item__diff-link");
      expect(links.length).toBe(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders tiered layout: edits separated from other actions", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      // The latest turn (4) auto-expands and has edits + other actions
      const turnBody = container.querySelector(".turn-item--expanded .turn-body");
      expect(turnBody).not.toBeNull();

      // Edit items (file_created, file_edited) should render outside .turn-other-actions
      const allItems = turnBody!.querySelectorAll(".summary-item");
      const otherActionsItems = turnBody!.querySelectorAll(".turn-other-actions .summary-item");
      // Turn 4 has edit items that should be outside the other-actions section
      const editItemCount = allItems.length - otherActionsItems.length;
      expect(editItemCount).toBeGreaterThan(0);

      // Other actions should be in a collapsible section
      const otherToggle = turnBody!.querySelector(".turn-other-toggle");
      expect(otherToggle).not.toBeNull();
      expect(otherToggle!.textContent).toContain("more action");
    } finally {
      cleanup(container);
    }
  });

  it("shows response text before edit items in expanded turn", () => {
    const container = renderInto(
      <App snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const turnBody = container.querySelector(".turn-item--expanded .turn-body");
      expect(turnBody).not.toBeNull();
      const children = Array.from(turnBody!.children);
      // First child should be the response
      expect(children[0]!.classList.contains("turn-response")).toBe(true);
    } finally {
      cleanup(container);
    }
  });

  it("includes response text in search results", () => {
    const results = searchSnapshot(basicSnapshot, "health check");
    // Turn 1 response mentions "health check"
    expect(results.size).toBeGreaterThan(0);
    // Check that at least one snippet has source "response"
    let hasResponseSnippet = false;
    for (const result of results.values()) {
      if (result.snippets.some((s: { source: string }) => s.source === "response")) {
        hasResponseSnippet = true;
      }
    }
    expect(hasResponseSnippet).toBe(true);
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
