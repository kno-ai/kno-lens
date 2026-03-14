import * as vscode from "vscode";
import type { SessionInfo } from "@kno-lens/io";

interface SessionPickItem extends vscode.QuickPickItem {
  sessionInfo: SessionInfo;
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export async function pickSession(
  active: SessionInfo[],
  all: SessionInfo[],
): Promise<SessionInfo | undefined> {
  const items: (SessionPickItem | vscode.QuickPickItem)[] = [];

  if (active.length > 0) {
    items.push({
      label: "Active Sessions",
      kind: vscode.QuickPickItemKind.Separator,
    } as vscode.QuickPickItem);
    for (const s of active) {
      items.push({
        label: `$(circle-filled) ${s.sessionId.slice(0, 12)}…`,
        description: `${formatAge(s.modifiedAt)} · ${formatSize(s.sizeBytes)}`,
        sessionInfo: s,
      });
    }
  }

  const inactive = all.filter((s) => !active.includes(s));
  if (inactive.length > 0) {
    items.push({
      label: "Recent Sessions",
      kind: vscode.QuickPickItemKind.Separator,
    } as vscode.QuickPickItem);
    for (const s of inactive.slice(0, 20)) {
      items.push({
        label: `$(circle-outline) ${s.sessionId.slice(0, 12)}…`,
        description: `${formatAge(s.modifiedAt)} · ${formatSize(s.sizeBytes)}`,
        sessionInfo: s,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a Claude Code session",
  });

  return (picked as SessionPickItem | undefined)?.sessionInfo;
}
