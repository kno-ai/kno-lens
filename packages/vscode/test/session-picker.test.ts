import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

// Mock vscode before importing the module under test
vi.mock("vscode", () => import("./__mocks__/vscode.js"));

import { QuickPickItemKind, window } from "./__mocks__/vscode.js";
import type { SessionInfo } from "@kno-lens/io";

const { pickSession } = await import("../src/session-picker.js");

// ─── Helpers ────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    path: "/tmp/sessions/test.jsonl",
    sessionId: "abcdef123456789",
    modifiedAt: new Date("2026-03-13T10:00:00Z"),
    sizeBytes: 2048,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("pickSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when user cancels the picker", async () => {
    window.showQuickPick.mockResolvedValue(undefined);

    const result = await pickSession([], []);
    expect(result).toBeUndefined();
  });

  it("passes items to showQuickPick when there are active sessions", async () => {
    const session = makeSession();
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    expect(window.showQuickPick).toHaveBeenCalledOnce();
    const items = window.showQuickPick.mock.calls[0]![0] as any[];

    // Should have a separator + one item
    expect(items.length).toBe(2);
    expect(items[0]!.kind).toBe(QuickPickItemKind.Separator);
    expect(items[0]!.label).toBe("Active Sessions");
  });

  it("shows active sessions with circle-filled icon", async () => {
    const session = makeSession({ sessionId: "abcdef123456extra" });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.label).toContain("$(circle-filled)");
    expect(sessionItem.label).toContain("abcdef123456");
  });

  it("shows inactive sessions with circle-outline icon", async () => {
    const session = makeSession({ sessionId: "zzz999888777666" });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.label).toContain("$(circle-outline)");
    expect(sessionItem.label).toContain("zzz999888777");
  });

  it("shows both separator groups when there are active and inactive sessions", async () => {
    const active = makeSession({ sessionId: "active-session-id" });
    const inactive = makeSession({ sessionId: "inactive-session-id" });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([active], [active, inactive]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];

    const separators = items.filter((i: any) => i.kind === QuickPickItemKind.Separator);
    expect(separators).toHaveLength(2);
    expect(separators[0]!.label).toBe("Active Sessions");
    expect(separators[1]!.label).toBe("Recent Sessions");
  });

  it("returns selected session info when user picks an item", async () => {
    const session = makeSession();
    window.showQuickPick.mockImplementation(async (items: any[]) => {
      // Simulate picking the first non-separator item
      return items.find((i: any) => i.kind !== QuickPickItemKind.Separator);
    });

    const result = await pickSession([session], [session]);
    expect(result).toBe(session);
  });

  it("shows all inactive sessions passed to it", async () => {
    const sessions: SessionInfo[] = [];
    for (let i = 0; i < 30; i++) {
      sessions.push(
        makeSession({
          sessionId: `session-${String(i).padStart(12, "0")}`,
          path: `/tmp/sessions/session-${i}.jsonl`,
        }),
      );
    }
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([], sessions);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    // 1 separator + all 30 items (limit is applied upstream by discovery)
    const nonSeparators = items.filter((i: any) => i.kind !== QuickPickItemKind.Separator);
    expect(nonSeparators).toHaveLength(30);
  });

  it("formats size in description", async () => {
    const session = makeSession({ sizeBytes: 500 });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toContain("500B");
  });

  it("formats KB sizes in description", async () => {
    const session = makeSession({ sizeBytes: 5120 });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toContain("5KB");
  });

  it("formats MB sizes in description", async () => {
    const session = makeSession({ sizeBytes: 2 * 1024 * 1024 });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toContain("2.0MB");
  });

  it("formats age as seconds for very recent sessions", async () => {
    const session = makeSession({ modifiedAt: new Date(Date.now() - 30_000) });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toMatch(/\d+s ago/);
  });

  it("formats age as minutes", async () => {
    const session = makeSession({ modifiedAt: new Date(Date.now() - 5 * 60_000) });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toMatch(/\d+m ago/);
  });

  it("formats age as hours", async () => {
    const session = makeSession({ modifiedAt: new Date(Date.now() - 3 * 3600_000) });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toMatch(/\d+h ago/);
  });

  it("formats age as days", async () => {
    const session = makeSession({ modifiedAt: new Date(Date.now() - 5 * 86400_000) });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toMatch(/\d+d ago/);
  });

  it("includes placeholder text in quick pick options", async () => {
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([], []);

    const options = window.showQuickPick.mock.calls[0]![1] as any;
    expect(options.placeHolder).toBe("Select a Claude Code session");
  });

  it("shows project directory for non-exact match sessions", async () => {
    const session = makeSession({
      match: "child",
      projectDir: "/home/user/.claude/projects/-Users-dev-code-project-subdir",
    });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).toContain("-Users-dev-code-project-subdir");
  });

  it("omits project directory for exact match sessions", async () => {
    const session = makeSession({ match: "exact", projectDir: "/some/dir" });
    window.showQuickPick.mockResolvedValue(undefined);

    await pickSession([session], [session]);

    const items = window.showQuickPick.mock.calls[0]![0] as any[];
    const sessionItem = items[1]!;

    expect(sessionItem.description).not.toContain("/some/dir");
  });
});
