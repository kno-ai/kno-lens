import { describe, it, expect, beforeEach } from "vitest";
import { LiveTurnModel } from "../src/live/LiveTurnModel.js";
import {
  turnStart,
  turnEnd,
  makeActivity,
  activityStart,
  activityEnd,
  thinking,
  textOutput,
  resetCounters,
} from "./helpers.js";

describe("LiveTurnModel", () => {
  let model: LiveTurnModel;

  beforeEach(() => {
    model = new LiveTurnModel();
    resetCounters();
  });

  it("starts with null turnId", () => {
    expect(model.current.turnId).toBeNull();
  });

  it("sets state on turn_start", () => {
    model.update(turnStart(1, "Fix the bug"));

    expect(model.current.turnId).toBe(1);
    expect(model.current.prompt).toBe("Fix the bug");
    expect(model.current.runningActivities).toHaveLength(0);
    expect(model.current.completedCount).toBe(0);
    expect(model.current.errorCount).toBe(0);
    expect(model.current.lastCompleted).toBeNull();
  });

  it("tracks running activities", () => {
    model.update(turnStart(1));
    const act = makeActivity("bash");
    model.update(activityStart(1, act));

    expect(model.current.runningActivities).toHaveLength(1);
    expect(model.current.runningActivities[0]!.id).toBe(act.id);
    expect(model.current.runningActivities[0]!.label).toBe("Running npm test");
  });

  it("tracks parallel activities", () => {
    model.update(turnStart(1));
    const act1 = makeActivity("file_read");
    const act2 = makeActivity("search");
    const act3 = makeActivity("bash");
    model.update(activityStart(1, act1));
    model.update(activityStart(1, act2));
    model.update(activityStart(1, act3));

    expect(model.current.runningActivities).toHaveLength(3);
  });

  it("removes completed activities and increments count", () => {
    model.update(turnStart(1));
    const act = makeActivity("bash");
    model.update(activityStart(1, act));
    model.update(activityEnd(1, act));

    expect(model.current.runningActivities).toHaveLength(0);
    expect(model.current.completedCount).toBe(1);
    expect(model.current.lastCompleted).not.toBeNull();
    expect(model.current.lastCompleted!.id).toBe(act.id);
  });

  it("tracks error count", () => {
    model.update(turnStart(1));
    const act = makeActivity("bash", "error");
    model.update(activityStart(1, act));
    model.update(activityEnd(1, { ...act, status: "error" }));

    expect(model.current.completedCount).toBe(1);
    expect(model.current.errorCount).toBe(1);
  });

  it("resets on turn_end", () => {
    model.update(turnStart(1));
    const act = makeActivity("bash");
    model.update(activityStart(1, act));
    model.update(activityEnd(1, act));
    model.update(turnEnd(1));

    expect(model.current.turnId).toBeNull();
    expect(model.current.runningActivities).toHaveLength(0);
    expect(model.current.completedCount).toBe(0);
  });

  it("ignores activity events outside a turn", () => {
    const act = makeActivity("bash");
    model.update(activityStart(1, act));

    expect(model.current.runningActivities).toHaveLength(0);
    expect(model.current.completedCount).toBe(0);
  });

  it("handles multiple turns sequentially", () => {
    model.update(turnStart(1, "first"));
    model.update(turnEnd(1));
    model.update(turnStart(2, "second"));

    expect(model.current.turnId).toBe(2);
    expect(model.current.prompt).toBe("second");
    expect(model.current.completedCount).toBe(0);
  });

  it("increments completedCount even for unknown activity_end", () => {
    model.update(turnStart(1));
    const act = makeActivity("bash");
    // Send activity_end without a prior activity_start
    model.update(activityEnd(1, act));

    // completedCount increments regardless, but lastCompleted is not set
    expect(model.current.completedCount).toBe(1);
    expect(model.current.lastCompleted).toBeNull();
    expect(model.current.runningActivities).toHaveLength(0);
  });

  // ─── Thinking state ──────────────────────────────────────────

  it("sets isThinking on thinking event", () => {
    model.update(turnStart(1));
    expect(model.current.isThinking).toBe(false);

    model.update(thinking(1));
    expect(model.current.isThinking).toBe(true);
  });

  it("clears isThinking on activity_start", () => {
    model.update(turnStart(1));
    model.update(thinking(1));
    expect(model.current.isThinking).toBe(true);

    const act = makeActivity("file_read");
    model.update(activityStart(1, act));
    expect(model.current.isThinking).toBe(false);
  });

  it("clears isThinking on text_output", () => {
    model.update(turnStart(1));
    model.update(thinking(1));
    expect(model.current.isThinking).toBe(true);

    model.update(textOutput(1, "Here's what I found..."));
    expect(model.current.isThinking).toBe(false);
  });

  it("resets isThinking on turn_end", () => {
    model.update(turnStart(1));
    model.update(thinking(1));
    model.update(turnEnd(1));
    expect(model.current.isThinking).toBe(false);
  });

  // ─── Per-category activity counts ─────────────────────────────

  it("tracks per-category counts for edits", () => {
    model.update(turnStart(1));
    const edit = makeActivity("file_edit");
    model.update(activityStart(1, edit));
    model.update(activityEnd(1, edit));

    expect(model.current.activityCounts.edits).toBe(1);
    expect(model.current.activityCounts.commands).toBe(0);
  });

  it("tracks per-category counts for commands", () => {
    model.update(turnStart(1));
    const cmd = makeActivity("bash");
    model.update(activityStart(1, cmd));
    model.update(activityEnd(1, cmd));

    expect(model.current.activityCounts.commands).toBe(1);
  });

  it("tracks per-category counts for reads and searches", () => {
    model.update(turnStart(1));
    const read = makeActivity("file_read");
    const search = makeActivity("search");
    model.update(activityStart(1, read));
    model.update(activityEnd(1, read));
    model.update(activityStart(1, search));
    model.update(activityEnd(1, search));

    expect(model.current.activityCounts.reads).toBe(1);
    expect(model.current.activityCounts.searches).toBe(1);
  });

  it("classifies file_write as edit", () => {
    model.update(turnStart(1));
    const write = makeActivity("file_write");
    model.update(activityStart(1, write));
    model.update(activityEnd(1, write));

    expect(model.current.activityCounts.edits).toBe(1);
  });

  it("tracks deletes for bash commands matching delete pattern", () => {
    model.update(turnStart(1));
    const rm = makeActivity("bash", "done", { command: "rm -rf dist" });
    model.update(activityStart(1, rm));
    model.update(activityEnd(1, rm));

    expect(model.current.activityCounts.deletes).toBe(1);
    expect(model.current.activityCounts.commands).toBe(1); // also a command
  });

  it("does not count non-delete bash as delete", () => {
    model.update(turnStart(1));
    const test = makeActivity("bash", "done", { command: "npm test" });
    model.update(activityStart(1, test));
    model.update(activityEnd(1, test));

    expect(model.current.activityCounts.deletes).toBe(0);
    expect(model.current.activityCounts.commands).toBe(1);
  });

  it("classifies unknown kinds as other", () => {
    model.update(turnStart(1));
    const mcp = makeActivity("mcp_call");
    model.update(activityStart(1, mcp));
    model.update(activityEnd(1, mcp));

    expect(model.current.activityCounts.other).toBe(1);
  });

  it("resets per-category counts on new turn", () => {
    model.update(turnStart(1));
    const edit = makeActivity("file_edit");
    model.update(activityStart(1, edit));
    model.update(activityEnd(1, edit));
    model.update(turnEnd(1));
    model.update(turnStart(2));

    expect(model.current.activityCounts.edits).toBe(0);
  });
});
