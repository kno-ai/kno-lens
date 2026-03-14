import { describe, it, expect, beforeEach } from "vitest";
import { activityLabel } from "../src/live/labels.js";
import { makeActivity, resetCounters } from "./helpers.js";

describe("activityLabel", () => {
  beforeEach(() => resetCounters());

  it("labels file_read", () => {
    const act = makeActivity("file_read");
    expect(activityLabel(act)).toBe("Reading src/foo.ts");
  });

  it("labels file_write (new)", () => {
    const act = makeActivity("file_write", "done", { isNew: true });
    expect(activityLabel(act)).toBe("Creating src/new.ts");
  });

  it("labels file_write (overwrite)", () => {
    const act = makeActivity("file_write", "done", { isNew: false });
    expect(activityLabel(act)).toBe("Writing src/new.ts");
  });

  it("labels file_edit", () => {
    const act = makeActivity("file_edit");
    expect(activityLabel(act)).toBe("Editing src/bar.ts");
  });

  it("labels bash", () => {
    const act = makeActivity("bash");
    expect(activityLabel(act)).toBe("Running npm test");
  });

  it("labels search", () => {
    const act = makeActivity("search");
    expect(activityLabel(act)).toBe("Searching for 'TODO'");
  });

  it("labels fetch", () => {
    const act = makeActivity("fetch");
    expect(activityLabel(act)).toBe("Fetching https://example.com");
  });

  it("labels mcp_call", () => {
    const act = makeActivity("mcp_call");
    expect(activityLabel(act)).toBe("MCP: kno/vault_status");
  });

  it("labels agent", () => {
    const act = makeActivity("agent");
    expect(activityLabel(act)).toBe("Agent: investigate test failures");
  });

  it("labels ask_user", () => {
    const act = makeActivity("ask_user");
    expect(activityLabel(act)).toBe("Waiting for your response");
  });

  it("labels unknown", () => {
    const act = makeActivity("unknown");
    expect(activityLabel(act)).toBe("Tool: custom_tool");
  });

  it("labels task", () => {
    const act = makeActivity("task");
    expect(activityLabel(act)).toBe("Task: create — fix bug");
  });

  it("truncates long values", () => {
    const longPath = "a".repeat(100) + ".ts";
    const act = makeActivity("file_read", "running", { path: longPath });
    const label = activityLabel(act);
    expect(label.length).toBeLessThanOrEqual(70); // "Reading " + 60 char max
    expect(label).toContain("…");
  });

  it("does not truncate values at exactly max length", () => {
    const exactPath = "a".repeat(60);
    const act = makeActivity("file_read", "running", { path: exactPath });
    const label = activityLabel(act);
    expect(label).toBe(`Reading ${exactPath}`);
    expect(label).not.toContain("…");
  });

  it("labels task without subject", () => {
    const act = makeActivity("task", "done", { subject: "" });
    expect(activityLabel(act)).toBe("Task: create");
  });

  it("labels agent without description", () => {
    const act = makeActivity("agent", "done", { description: undefined });
    expect(activityLabel(act)).toBe("Agent: sub-task");
  });
});
