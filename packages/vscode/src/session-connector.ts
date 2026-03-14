import * as vscode from "vscode";
import { SessionManager } from "@kno-lens/io";
import type { SessionInfo } from "@kno-lens/io";
import { getSummaryConfig, getThrottleMs } from "./settings.js";

/**
 * Bridges a SessionManager to a webview, posting state updates
 * and handling messages from the UI.
 */
export class SessionConnector implements vscode.Disposable {
  private manager: SessionManager;
  private disposables: vscode.Disposable[] = [];

  readonly sessionInfo: SessionInfo;

  constructor(sessionInfo: SessionInfo, webview: vscode.Webview) {
    this.sessionInfo = sessionInfo;

    this.manager = new SessionManager(sessionInfo, {
      summaryConfig: getSummaryConfig(),
      throttleMs: getThrottleMs(),
    });

    // Manager → Webview
    this.manager.on("update", (state) => {
      if (state.snapshot) {
        webview.postMessage({ type: "snapshot", data: state.snapshot });
      }
      webview.postMessage({ type: "live", data: state.live });
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
            // Future: look up raw JSONL record by resultRecordUuid
            break;
        }
      }),
    );

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
