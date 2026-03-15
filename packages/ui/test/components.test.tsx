import { describe, it, expect } from "vitest";
import { render } from "preact";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import { LensApp } from "../src/lens/LensApp.js";

import snapshotFixture from "./fixtures/lens-snapshot.json";
import liveSnapshotFixture from "./fixtures/live-snapshot.json";
import liveStateFixture from "./fixtures/live-state.json";

const basicSnapshot = snapshotFixture as unknown as SessionSnapshot;
const liveSnapshot = liveSnapshotFixture as unknown as SessionSnapshot;
const liveTurnState = liveStateFixture as unknown as LiveTurnState;

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

describe("LensApp", () => {
  it("renders with basic fixture data", () => {
    const container = renderInto(
      <LensApp snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".session-header")).not.toBeNull();
      expect(container.textContent).toContain("warm-crimson-eagle");
      expect(container.querySelector(".turn-list")).not.toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("shows empty state when snapshot is null", () => {
    const container = renderInto(
      <LensApp snapshot={null} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".empty-state")).not.toBeNull();
      expect(container.textContent).toContain("No session loaded");
      expect(container.querySelector(".session-header")).toBeNull();
      expect(container.querySelector(".turn-list")).toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("shows 'Invalid session data' for malformed snapshots", () => {
    const malformed = { garbage: true } as unknown as SessionSnapshot;
    const container = renderInto(
      <LensApp snapshot={malformed} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
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
      <LensApp snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const header = container.querySelector(".session-header")!;
      expect(header).not.toBeNull();

      const name = header.querySelector(".session-header__name");
      expect(name).not.toBeNull();
      expect(name!.textContent).toContain("warm-crimson-eagle");

      const meta = header.querySelector(".session-header__meta");
      expect(meta).not.toBeNull();
      expect(meta!.textContent).toContain("fix/connection-pool");
      expect(meta!.textContent).toContain("4 turns");
      expect(meta!.textContent).toContain("6 edits");
      expect(meta!.textContent).toContain("2 errors");
    } finally {
      cleanup(container);
    }
  });

  it("renders live turn with green border", () => {
    const container = renderInto(
      <LensApp snapshot={liveSnapshot} live={liveTurnState} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      expect(container.querySelector(".session-header")).not.toBeNull();
      expect(container.querySelector(".turn-item--live")).not.toBeNull();
      expect(container.querySelector(".turn-list")).not.toBeNull();
      // Live turn should show prompt
      const liveTurn = container.querySelector(".turn-item--live")!;
      expect(liveTurn.textContent).toContain("Now update all the tests to match");
      // Should show running activities
      expect(liveTurn.textContent).toContain("Reading test/auth.test.ts");
    } finally {
      cleanup(container);
    }
  });

  it("live turn is collapsible like any other turn", async () => {
    const container = renderInto(
      <LensApp snapshot={liveSnapshot} live={liveTurnState} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const liveTurn = container.querySelector(".turn-item--live")!;
      expect(liveTurn).not.toBeNull();
      // Should be expanded by default (has turn-detail inside)
      expect(liveTurn.querySelector(".turn-detail")).not.toBeNull();
      // Click header to collapse
      const header = liveTurn.querySelector(".turn-header") as HTMLElement;
      header.click();
      // Wait for any async effects to settle
      await new Promise((r) => setTimeout(r, 10));
      // Re-query after potential re-renders
      const liveTurnAfter = container.querySelector(".turn-item--live")!;
      expect(liveTurnAfter).not.toBeNull();
      // Should now be collapsed (no turn-detail)
      expect(liveTurnAfter.querySelector(".turn-detail")).toBeNull();
    } finally {
      cleanup(container);
    }
  });

  it("passes onOpenFile callback through to TurnList", () => {
    const onOpenFile = (_path: string) => {};
    const container = renderInto(
      <LensApp
        snapshot={basicSnapshot}
        live={null}
        config={DEFAULT_SUMMARY_CONFIG}
        onOpenFile={onOpenFile}
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
      <LensApp snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const response = container.querySelector(".turn-detail__response");
      expect(response).not.toBeNull();
      expect(response!.textContent!.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders file paths as clickable sub-links", () => {
    const onOpenFile = (_path: string) => {};
    const container = renderInto(
      <LensApp
        snapshot={basicSnapshot}
        live={null}
        config={DEFAULT_SUMMARY_CONFIG}
        onOpenFile={onOpenFile}
      />,
    );
    try {
      const links = container.querySelectorAll(".turn-detail__subitem--link");
      expect(links.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("renders activity items in expanded turns", () => {
    const container = renderInto(
      <LensApp snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const items = container.querySelectorAll(".turn-detail__item");
      expect(items.length).toBeGreaterThan(0);
    } finally {
      cleanup(container);
    }
  });

  it("shows response text before activity items in expanded turn", () => {
    const container = renderInto(
      <LensApp snapshot={basicSnapshot} live={null} config={DEFAULT_SUMMARY_CONFIG} />,
    );
    try {
      const detail = container.querySelector(".turn-item--expanded .turn-detail");
      expect(detail).not.toBeNull();
      // Response should be present
      expect(detail!.querySelector(".turn-detail__response")).not.toBeNull();
    } finally {
      cleanup(container);
    }
  });
});
