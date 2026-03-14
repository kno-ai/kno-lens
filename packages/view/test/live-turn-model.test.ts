import { describe, it, expect, beforeEach } from "vitest";
import { LiveTurnModel } from "../src/live/LiveTurnModel.js";
import {
  turnStart,
  turnEnd,
  makeActivity,
  activityStart,
  activityEnd,
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
});
