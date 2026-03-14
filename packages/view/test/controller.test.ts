import { describe, it, expect, beforeEach } from "vitest";
import { SessionController } from "../src/controller/SessionController.js";
import { SUMMARY_ALGORITHM_VERSION } from "../src/controller/snapshot.js";
import type { SessionEvent } from "@kno-lens/core";
import {
  sessionStart,
  turnStart,
  turnEnd,
  sessionEnd,
  makeActivity,
  activityStart,
  activityEnd,
  resetCounters,
} from "./helpers.js";

describe("SessionController", () => {
  let ctrl: SessionController;

  beforeEach(() => {
    ctrl = new SessionController();
    resetCounters();
  });

  // ─── isReady ─────────────────────────────────────────────────────

  it("is not ready before session_start", () => {
    expect(ctrl.isReady).toBe(false);
  });

  it("is ready after session_start", () => {
    ctrl.onEvent(sessionStart());
    expect(ctrl.isReady).toBe(true);
  });

  // ─── liveState ───────────────────────────────────────────────────

  it("liveState is null when no turn is active", () => {
    ctrl.onEvent(sessionStart());
    expect(ctrl.liveState).toBeNull();
  });

  it("liveState has turnId during a turn", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "Do stuff"));

    expect(ctrl.liveState).not.toBeNull();
    expect(ctrl.liveState!.turnId).toBe(1);
    expect(ctrl.liveState!.prompt).toBe("Do stuff");
  });

  it("liveState tracks running activities", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    const act = makeActivity("bash");
    ctrl.onEvent(activityStart(1, act));

    expect(ctrl.liveState!.runningActivities).toHaveLength(1);
  });

  it("liveState goes null on turn_end", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    ctrl.onEvent(turnEnd(1));

    expect(ctrl.liveState).toBeNull();
  });

  // ─── summaries ───────────────────────────────────────────────────

  it("summaries is empty before any turn completes", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));

    expect(ctrl.summaries.size).toBe(0);
  });

  it("generates summary on turn_end", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "Fix bug"));
    const act = makeActivity("file_edit");
    ctrl.onEvent(activityStart(1, act));
    ctrl.onEvent(activityEnd(1, act));
    ctrl.onEvent(turnEnd(1));

    expect(ctrl.summaries.size).toBe(1);
    const summary = ctrl.summaries.get(1)!;
    expect(summary.prompt).toBe("Fix bug");
    expect(summary.items.length).toBeGreaterThan(0);
    expect(summary.items[0]!.category).toBe("file_edited");
  });

  it("generates summaries for multiple turns", () => {
    ctrl.onEvent(sessionStart());

    ctrl.onEvent(turnStart(1));
    ctrl.onEvent(turnEnd(1));

    ctrl.onEvent(turnStart(2));
    const act = makeActivity("bash");
    ctrl.onEvent(activityStart(2, act));
    ctrl.onEvent(activityEnd(2, act));
    ctrl.onEvent(turnEnd(2));

    expect(ctrl.summaries.size).toBe(2);
    expect(ctrl.summaries.has(1)).toBe(true);
    expect(ctrl.summaries.has(2)).toBe(true);
  });

  // ─── snapshot caching ────────────────────────────────────────────

  it("returns cached snapshot when not dirty", () => {
    ctrl.onEvent(sessionStart());
    const snap1 = ctrl.snapshot();
    const snap2 = ctrl.snapshot();

    expect(snap1).toBe(snap2); // same reference
  });

  it("rebuilds snapshot after new event", () => {
    ctrl.onEvent(sessionStart());
    const snap1 = ctrl.snapshot();
    ctrl.onEvent(turnStart(1));
    const snap2 = ctrl.snapshot();

    expect(snap1).not.toBe(snap2);
  });

  // ─── updateConfig ────────────────────────────────────────────────

  it("re-summarizes all turns on config update", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    const act = makeActivity("file_read");
    ctrl.onEvent(activityStart(1, act));
    ctrl.onEvent(activityEnd(1, act));
    ctrl.onEvent(turnEnd(1));

    // Default: file_read is medium
    expect(ctrl.summaries.get(1)!.items[0]!.importance).toBe("medium");

    // Override to high
    ctrl.updateConfig({ importance: { file_read: "high" } });
    expect(ctrl.summaries.get(1)!.items[0]!.importance).toBe("high");
  });

  // ─── exportState / fromSnapshot ──────────────────────────────────

  it("round-trips through export/restore", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "Fix bug"));
    const act = makeActivity("file_edit");
    ctrl.onEvent(activityStart(1, act));
    ctrl.onEvent(activityEnd(1, act));
    ctrl.onEvent(turnEnd(1));
    ctrl.onEvent(sessionEnd());

    const exported = ctrl.exportState();
    const { controller: restored, stale } = SessionController.fromSnapshot(exported);

    expect(stale).toBe(false);
    expect(restored.isReady).toBe(true);
    expect(restored.summaries.size).toBe(1);
    expect(restored.summaries.get(1)!.prompt).toBe("Fix bug");

    const snap = restored.snapshot();
    expect(snap.status).toBe("ended");
    expect(snap.turns).toHaveLength(1);
  });

  it("detects stale algorithm version", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    ctrl.onEvent(turnEnd(1));

    const exported = ctrl.exportState();
    exported.summaryConfigVersion = "0.0.0-old";

    const { stale } = SessionController.fromSnapshot(exported);
    expect(stale).toBe(true);
  });

  it("re-summarizes on stale restore", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "prompt"));
    const act = makeActivity("file_edit");
    ctrl.onEvent(activityStart(1, act));
    ctrl.onEvent(activityEnd(1, act));
    ctrl.onEvent(turnEnd(1));

    const exported = ctrl.exportState();
    exported.summaryConfigVersion = "0.0.0-old";

    const { controller: restored, stale } = SessionController.fromSnapshot(exported);
    expect(stale).toBe(true);
    // Summaries should still be populated (re-generated)
    expect(restored.summaries.size).toBe(1);
  });

  it("throws on onEvent after fromSnapshot", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    ctrl.onEvent(turnEnd(1));
    ctrl.onEvent(sessionEnd());

    const exported = ctrl.exportState();
    const { controller: restored } = SessionController.fromSnapshot(exported);

    expect(() => restored.onEvent(turnStart(2))).toThrow(/restored from snapshot/);
  });

  it("supports updateConfig on restored controller", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1));
    const act = makeActivity("file_read");
    ctrl.onEvent(activityStart(1, act));
    ctrl.onEvent(activityEnd(1, act));
    ctrl.onEvent(turnEnd(1));
    ctrl.onEvent(sessionEnd());

    const exported = ctrl.exportState();
    const { controller: restored } = SessionController.fromSnapshot(exported);

    restored.updateConfig({ importance: { file_read: "high" } });
    expect(restored.summaries.get(1)!.items[0]!.importance).toBe("high");
  });

  it("exportState has correct algorithm version", () => {
    ctrl.onEvent(sessionStart());
    const exported = ctrl.exportState();
    expect(exported.summaryConfigVersion).toBe(SUMMARY_ALGORITHM_VERSION);
  });

  // ─── maxVisibleTurns ─────────────────────────────────────────────

  it("exportState limits turns to maxVisibleTurns (most recent)", () => {
    const limited = new SessionController({ maxVisibleTurns: 2 });
    limited.onEvent(sessionStart());

    limited.onEvent(turnStart(1, "first"));
    limited.onEvent(turnEnd(1));
    limited.onEvent(turnStart(2, "second"));
    limited.onEvent(turnEnd(2));
    limited.onEvent(turnStart(3, "third"));
    limited.onEvent(turnEnd(3));

    const exported = limited.exportState();
    expect(exported.session.turns).toHaveLength(2);
    expect(exported.session.turns[0]!.id).toBe(2);
    expect(exported.session.turns[1]!.id).toBe(3);
  });

  it("exportState excludes summaries for truncated turns", () => {
    const limited = new SessionController({ maxVisibleTurns: 1 });
    limited.onEvent(sessionStart());

    limited.onEvent(turnStart(1, "first"));
    const act1 = makeActivity("file_edit");
    limited.onEvent(activityStart(1, act1));
    limited.onEvent(activityEnd(1, act1));
    limited.onEvent(turnEnd(1));

    limited.onEvent(turnStart(2, "second"));
    limited.onEvent(turnEnd(2));

    expect(limited.summaries.size).toBe(2); // internally tracked
    const exported = limited.exportState();
    expect(exported.session.turns).toHaveLength(1);
    expect(Object.keys(exported.summaries)).toHaveLength(1);
    expect(exported.summaries[2]).toBeDefined();
    expect(exported.summaries[1]).toBeUndefined();
  });

  it("exportState includes all turns when under maxVisibleTurns", () => {
    const limited = new SessionController({ maxVisibleTurns: 10 });
    limited.onEvent(sessionStart());
    limited.onEvent(turnStart(1));
    limited.onEvent(turnEnd(1));
    limited.onEvent(turnStart(2));
    limited.onEvent(turnEnd(2));

    const exported = limited.exportState();
    expect(exported.session.turns).toHaveLength(2);
    expect(Object.keys(exported.summaries)).toHaveLength(2);
  });

  // ─── response in summary ───────────────────────────────────

  it("includes response text in summary when turn has text steps", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "What is 2+2?"));
    const textEvent: SessionEvent = {
      type: "text_output",
      turnId: 1,
      text: "The answer is 4.",
      at: "2025-01-01T00:01:05Z",
    };
    ctrl.onEvent(textEvent);
    ctrl.onEvent(turnEnd(1));

    const summary = ctrl.summaries.get(1)!;
    expect(summary.response).toBe("The answer is 4.");
  });

  it("response flows through exportState into snapshot summaries", () => {
    ctrl.onEvent(sessionStart());
    ctrl.onEvent(turnStart(1, "Explain"));
    const textEvent: SessionEvent = {
      type: "text_output",
      turnId: 1,
      text: "Here is my explanation.",
      at: "2025-01-01T00:01:05Z",
    };
    ctrl.onEvent(textEvent);
    ctrl.onEvent(turnEnd(1));
    ctrl.onEvent(sessionEnd());

    const exported = ctrl.exportState();
    expect(exported.summaries[1]!.response).toBe("Here is my explanation.");
  });

  // ─── Full lifecycle ──────────────────────────────────────────────

  it("handles a full session lifecycle", () => {
    ctrl.onEvent(sessionStart());

    // Turn 1: edit + failed bash + successful bash
    ctrl.onEvent(turnStart(1, "Fix the tests"));
    const edit = makeActivity("file_edit");
    ctrl.onEvent(activityStart(1, edit));
    ctrl.onEvent(activityEnd(1, edit));
    const failedBash = makeActivity("bash", "error", { exitCode: 1 });
    ctrl.onEvent(activityStart(1, failedBash));
    ctrl.onEvent(activityEnd(1, { ...failedBash, status: "error" }));
    const passBash = makeActivity("bash", "done");
    ctrl.onEvent(activityStart(1, passBash));
    ctrl.onEvent(activityEnd(1, passBash));
    ctrl.onEvent(turnEnd(1));

    expect(ctrl.liveState).toBeNull();
    expect(ctrl.summaries.size).toBe(1);
    const s1 = ctrl.summaries.get(1)!;
    expect(s1.stats.filesEdited).toBe(1);
    expect(s1.stats.commandsFailed).toBe(1);
    expect(s1.stats.commandsRun).toBe(1);

    // Turn 2: text only
    ctrl.onEvent(turnStart(2, "Explain the fix"));
    ctrl.onEvent(turnEnd(2));
    expect(ctrl.summaries.size).toBe(2);
    expect(ctrl.summaries.get(2)!.items).toHaveLength(0);

    // End session
    ctrl.onEvent(sessionEnd());
    expect(ctrl.snapshot().status).toBe("ended");
  });
});
