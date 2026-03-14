import { describe, it, expect, afterEach } from "vitest";
import { lookupRecordByUuid } from "../src/record-lookup.js";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Helpers ────────────────────────────────────────────────────────────

let tmpFiles: string[] = [];

function writeTmpJsonl(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "kno-lookup-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
  tmpFiles.push(path);
  return path;
}

function record(uuid: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ uuid, type: "user", ...extra });
}

afterEach(() => {
  for (const f of tmpFiles) {
    try {
      unlinkSync(f);
    } catch {
      // already cleaned up
    }
  }
  tmpFiles = [];
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("lookupRecordByUuid", () => {
  it("finds a record by uuid", async () => {
    const path = writeTmpJsonl([
      record("aaa", { data: "first" }),
      record("bbb", { data: "second" }),
      record("ccc", { data: "third" }),
    ]);

    const result = await lookupRecordByUuid(path, "bbb");
    expect(result).toEqual({ uuid: "bbb", type: "user", data: "second" });
  });

  it("returns null when uuid is not present", async () => {
    const path = writeTmpJsonl([record("aaa"), record("bbb")]);

    const result = await lookupRecordByUuid(path, "zzz");
    expect(result).toBeNull();
  });

  it("returns null for empty file", async () => {
    const path = writeTmpJsonl([]);
    const result = await lookupRecordByUuid(path, "aaa");
    expect(result).toBeNull();
  });

  it("skips malformed lines and finds target after them", async () => {
    const path = writeTmpJsonl(["not valid json {{{", "", record("aaa", { data: "found" })]);

    const result = await lookupRecordByUuid(path, "aaa");
    expect(result).toEqual({ uuid: "aaa", type: "user", data: "found" });
  });

  it("does not match uuid appearing only in other fields", async () => {
    const path = writeTmpJsonl([
      record("aaa", { parentUuid: "target-uuid" }),
      record("bbb", { note: "target-uuid" }),
    ]);

    const result = await lookupRecordByUuid(path, "target-uuid");
    expect(result).toBeNull();
  });

  it("rejects when file does not exist", async () => {
    await expect(lookupRecordByUuid("/nonexistent/path.jsonl", "aaa")).rejects.toThrow();
  });
});
