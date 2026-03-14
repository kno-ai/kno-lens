import { describe, it, expect } from "vitest";
import { formatDuration, formatTokens, categoryIcon, categoryIconClass } from "../src/utils.js";

describe("formatDuration", () => {
  it("returns < 1m for sub-minute durations", () => {
    expect(formatDuration(0)).toBe("< 1m");
    expect(formatDuration(59_999)).toBe("< 1m");
  });

  it("returns minutes for sub-hour durations", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(300_000)).toBe("5m");
    expect(formatDuration(3_540_000)).toBe("59m");
  });

  it("returns hours and minutes for longer durations", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(5_400_000)).toBe("1h 30m");
    expect(formatDuration(7_200_000)).toBe("2h");
  });
});

describe("formatTokens", () => {
  it("formats small counts", () => {
    expect(formatTokens(0)).toBe("0 tokens");
    expect(formatTokens(999)).toBe("999 tokens");
  });

  it("formats thousands with k suffix", () => {
    expect(formatTokens(1_000)).toBe("1.0k tokens");
    expect(formatTokens(52_700)).toBe("52.7k tokens");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M tokens");
    expect(formatTokens(2_500_000)).toBe("2.5M tokens");
  });
});

describe("categoryIcon", () => {
  it("returns icons for known categories", () => {
    expect(typeof categoryIcon("file_edited")).toBe("string");
    expect(categoryIcon("file_edited").length).toBeGreaterThan(0);
  });

  it("returns a default icon for unknown categories", () => {
    const icon = categoryIcon("totally_unknown_category");
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
  });
});

describe("categoryIconClass", () => {
  it("returns a class string for known categories", () => {
    const cls = categoryIconClass("file_edited");
    expect(cls).toContain("summary-item__icon");
    expect(cls).toContain("summary-item__icon--orange");
  });

  it("falls back to muted for unknown categories", () => {
    const cls = categoryIconClass("totally_unknown_category");
    expect(cls).toContain("summary-item__icon--muted");
  });

  it("returns different classes for different categories", () => {
    const edited = categoryIconClass("file_edited");
    const created = categoryIconClass("file_created");
    const bash = categoryIconClass("bash");
    // edited is orange, created is green, bash is blue
    expect(edited).not.toBe(created);
    expect(edited).not.toBe(bash);
  });
});
