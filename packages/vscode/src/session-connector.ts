import * as vscode from "vscode";
import { SessionManager, lookupRecordByUuid } from "@kno-lens/io";
import type { SessionInfo } from "@kno-lens/io";
import { getSummaryConfig, getThrottleMs } from "./settings.js";
import type { PanelManager } from "./panel-manager.js";

/**
 * Bridges a SessionManager to a webview, posting state updates
 * and handling messages from the UI.
 */
export class SessionConnector implements vscode.Disposable {
  private manager: SessionManager;
  private disposables: vscode.Disposable[] = [];
  private explorer: PanelManager | undefined;

  readonly sessionInfo: SessionInfo;

  constructor(sessionInfo: SessionInfo, webview: vscode.Webview, explorer?: PanelManager) {
    this.sessionInfo = sessionInfo;
    this.explorer = explorer;

    this.manager = new SessionManager(sessionInfo, {
      summaryConfig: getSummaryConfig(),
      throttleMs: getThrottleMs(),
    });

    // Manager → Webview (sidebar)
    this.manager.on("update", (state) => {
      if (state.snapshot) {
        webview.postMessage({ type: "snapshot", data: state.snapshot });
      }
      webview.postMessage({ type: "live", data: state.live });

      // Keep Explorer's cached state current for refresh
      this.explorer?.postState(state);
    });

    this.manager.on("error", (err) => {
      console.error("[KnoLens] Session error:", err.message);
    });

    // Webview → Extension
    this.disposables.push(
      webview.onDidReceiveMessage((msg) => {
        if (!msg || typeof msg.type !== "string") return;
        switch (msg.type) {
          case "open-file":
            this.openFile(msg.path);
            break;
          case "drill-down":
            this.showRawRecord(msg.activityId);
            break;
          case "show-diff":
            this.showEditDiff(msg.activityId);
            break;
          case "open-explorer":
            this.explorer?.open(
              typeof msg.turnId === "number" ? { turnId: msg.turnId } : undefined,
            );
            break;
        }
      }),
    );

    // Explorer Webview → Extension (via PanelManager.onMessage)
    if (this.explorer) {
      this.explorer.onMessage((msg) => {
        switch (msg.type) {
          case "open-file":
            this.openFile(msg.path as string);
            break;
          case "drill-down":
            this.showRawRecord(msg.activityId);
            break;
          case "show-diff":
            this.showEditDiff(msg.activityId);
            break;
          case "open-in-lens":
            webview.postMessage({ type: "scroll-to-turn", turnId: msg.turnId });
            break;
        }
      });
    }

    // Re-send config on settings change
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("knoLens")) {
          webview.postMessage({ type: "config", data: getSummaryConfig() });
        }
      }),
    );
  }

  async start(): Promise<void> {
    await this.manager.start();

    // Send initial state after catch-up read
    const state = this.manager.state;
    // The update event already fired during start(), but the webview
    // may not have been ready. Re-send to be safe.
    if (state.snapshot) {
      // Small delay to let the webview script initialize
      setTimeout(() => {
        const s = this.manager.state;
        if (s.snapshot) {
          // Use the webview from the update handler via closure
          this.manager.emit("update", s);
        }
      }, 100);
    }
  }

  dispose(): void {
    this.manager.stop();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private async showEditDiff(activityId: unknown): Promise<void> {
    if (typeof activityId !== "string" || activityId.length === 0) return;

    const snapshot = this.manager.state.snapshot;
    if (!snapshot) return;

    for (const turn of snapshot.session.turns) {
      for (const step of turn.steps) {
        if (step.kind !== "activity" || step.activity.id !== activityId) continue;
        const act = step.activity;
        if (act.kind !== "file_edit") return;

        const oldStr = act.oldString ?? "";
        const newStr = act.newString ?? "";
        const shortPath = act.path.split("/").pop() ?? act.path;

        try {
          const leftDoc = await vscode.workspace.openTextDocument({ content: oldStr });
          const rightDoc = await vscode.workspace.openTextDocument({ content: newStr });
          const leftUri = leftDoc.uri;
          const rightUri = rightDoc.uri;

          await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${shortPath} (Turn ${turn.id})`,
            { preview: true },
          );
        } catch {
          // Fail silently
        }
        return;
      }
    }
  }

  private async showRawRecord(activityId: unknown): Promise<void> {
    if (typeof activityId !== "string" || activityId.length === 0) return;

    // Find the activity in the current snapshot
    const snapshot = this.manager.state.snapshot;
    if (!snapshot) return;

    let uuid: string | undefined;
    for (const turn of snapshot.session.turns) {
      for (const step of turn.steps) {
        if (step.kind === "activity" && step.activity.id === activityId) {
          uuid = step.activity.resultRecordUuid;
          break;
        }
      }
      if (uuid) break;
    }
    if (!uuid) return;

    try {
      const record = await lookupRecordByUuid(this.sessionInfo.path, uuid);
      if (!record) return;

      const content = JSON.stringify(record, null, 2);
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: "json",
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      // File may have been deleted or is unreadable — fail silently
    }
  }

  private openFile(filePath: string): void {
    if (typeof filePath !== "string" || filePath.length === 0) return;

    // Restrict to workspace directories to prevent opening arbitrary files
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const inWorkspace = workspaceFolders.some((folder) => filePath.startsWith(folder.uri.fsPath));
      if (!inWorkspace) {
        console.warn(`[KnoLens] Blocked open-file outside workspace: ${filePath}`);
        return;
      }
    }

    const uri = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(uri).then(
      (doc) => vscode.window.showTextDocument(doc, { preview: true }),
      () => {
        // File may not exist anymore — ignore silently
      },
    );
  }
}
