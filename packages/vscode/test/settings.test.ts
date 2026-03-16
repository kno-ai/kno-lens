import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

// Mock vscode before importing the module under test
vi.mock("vscode", () => import("./__mocks__/vscode.js"));

import { __setConfigValue, __clearConfig } from "./__mocks__/vscode.js";

// Dynamic import so the mock is in place first
const { getSummaryConfig, getThrottleMs, getMaxSessions } = await import("../src/settings.js");

// ─── Tests ──────────────────────────────────────────────────────────────

describe("getSummaryConfig", () => {
  beforeEach(() => {
    __clearConfig();
  });

  it("returns empty object when no config is set", () => {
    const config = getSummaryConfig();
    expect(config).toEqual({});
  });

  it("reads defaultMinImportance from config", () => {
    __setConfigValue("knoLens.summary", "defaultMinImportance", "high");
    const config = getSummaryConfig();
    expect(config.defaultMinImportance).toBe("high");
  });

  it("reads groupConsecutive from config", () => {
    __setConfigValue("knoLens.summary", "groupConsecutive", false);
    const config = getSummaryConfig();
    expect(config.groupConsecutive).toBe(false);
  });

  it("reads maxVisibleItems from config", () => {
    __setConfigValue("knoLens.summary", "maxVisibleItems", 25);
    const config = getSummaryConfig();
    expect(config.maxVisibleItems).toBe(25);
  });

  it("reads maxVisibleTurns from config", () => {
    __setConfigValue("knoLens.summary", "maxVisibleTurns", 100);
    const config = getSummaryConfig();
    expect(config.maxVisibleTurns).toBe(100);
  });

  it("returns all set values together", () => {
    __setConfigValue("knoLens.summary", "defaultMinImportance", "low");
    __setConfigValue("knoLens.summary", "groupConsecutive", true);
    __setConfigValue("knoLens.summary", "maxVisibleItems", 10);
    __setConfigValue("knoLens.summary", "maxVisibleTurns", 30);

    const config = getSummaryConfig();
    expect(config).toEqual({
      defaultMinImportance: "low",
      groupConsecutive: true,
      maxVisibleItems: 10,
      maxVisibleTurns: 30,
    });
  });
});

describe("getThrottleMs", () => {
  beforeEach(() => {
    __clearConfig();
  });

  it("returns default of 100 when not configured", () => {
    expect(getThrottleMs()).toBe(100);
  });

  it("returns configured throttle value", () => {
    __setConfigValue("knoLens", "throttleMs", 250);
    expect(getThrottleMs()).toBe(250);
  });
});

describe("getMaxSessions", () => {
  beforeEach(() => {
    __clearConfig();
  });

  it("returns default of 10 when not configured", () => {
    expect(getMaxSessions()).toBe(10);
  });

  it("returns configured value", () => {
    __setConfigValue("knoLens", "maxSessions", 25);
    expect(getMaxSessions()).toBe(25);
  });
});
