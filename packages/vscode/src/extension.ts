import * as vscode from "vscode";
import { SessionManager } from "@kno-lens/io";
import type { SessionInfo } from "@kno-lens/io";
import { getWebviewHtml } from "./webview-host.js";
import { SessionConnector } from "./session-connector.js";
import { pickSession } from "./session-picker.js";
import { PanelManager } from "./panel-manager.js";

const log = vscode.window.createOutputChannel("KnoLens", { log: true });

/** How often to poll for sessions (ms). */
const POLL_INTERVAL = 3000;

// ─── Sidebar WebviewViewProvider ─────────────────────────────────────────

class ViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "knoLens.sessionView";

  private view: vscode.WebviewView | undefined;
  private connector: SessionConnector | undefined;
  private extensionUri: vscode.Uri;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollBusy = false;
  readonly explorer: PanelManager;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    this.explorer = new PanelManager(extensionUri);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "select-session") {
        this.selectSession();
      }
    });

    webviewView.onDidDispose(() => {
      this.connector?.dispose();
      this.connector = undefined;
      this.stopPolling();
      this.view = undefined;
    });

    // Try to connect immediately, then start the poll loop.
    // Don't send status before autoConnect — the webview JS hasn't
    // loaded yet and the message would be lost. The webview defaults
    // to "searching" state, which is correct. autoConnect will send
    // "connecting" or "no-workspace" if those apply.
    this.autoConnect();
    this.startPolling();
  }

  // ─── Connection ──────────────────────────────────────────────────

  async connectToSession(sessionInfo: SessionInfo): Promise<void> {
    if (!this.view) return;

    // Tear down previous connection
    this.connector?.dispose();
    this.connector = undefined;
    this.explorer.clearState();

    log.info(`Connecting to session: ${sessionInfo.sessionId}`);
    log.info(`  File: ${sessionInfo.path}`);

    this.postStatus("connecting");

    const connector = new SessionConnector(sessionInfo, this.view.webview, this.explorer);

    try {
      await connector.start();
    } catch (err) {
      // Connection failed — clean up and fall back to searching
      connector.dispose();
      log.error(`Connection failed for ${sessionInfo.sessionId}: ${err}`);
      this.postStatus("searching");
      // Leave this.connector undefined so the poll retries
      return;
    }

    this.connector = connector;
    this.view.title = `Session — ${sessionInfo.sessionId.slice(0, 8)}…`;

    // Clear any new-session badge — we just connected to something
    this.setNewSessionBadge(false);

    // Ensure polling is running — it watches for new sessions while connected
    this.startPolling();
  }

  // ─── Auto-connect (called once on startup and by poll loop) ────

  private async autoConnect(): Promise<void> {
    if (this.pollBusy) return;

    const workspace = getWorkspacePath();
    if (!workspace) {
      log.warn("No workspace folder open");
      this.postStatus("no-workspace");
      return;
    }

    this.pollBusy = true;

    try {
      const { all, active } = await SessionManager.discover(workspace);

      if (all.length === 0) {
        this.postStatus("searching");
        return;
      }

      const target = active[0] ?? all[0];
      if (target) {
        await this.connectToSession(target);
      }
    } catch (err) {
      log.error(`Auto-connect failed: ${err}`);
    } finally {
      this.pollBusy = false;
    }
  }

  // ─── Poll loop ─────────────────────────────────────────────────
  //
  // One timer, two behaviors:
  //   • While disconnected: try to auto-connect to any session.
  //   • While connected: watch for new active sessions that differ
  //     from the current one. Badge the picker if found.

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async poll(): Promise<void> {
    if (this.pollBusy) return;

    if (!this.connector) {
      // Not connected — try to find and connect to a session
      this.autoConnect();
      return;
    }

    // Already connected — check for new active sessions
    const workspace = getWorkspacePath();
    if (!workspace) return;

    this.pollBusy = true;
    try {
      const { active } = await SessionManager.discover(workspace);

      const currentId = this.connector?.sessionInfo.sessionId;
      const newSession = active.find((s) => s.sessionId !== currentId);

      // Badge the picker if a different active session exists; clear if not
      this.setNewSessionBadge(newSession != null);

      if (newSession) {
        log.info(`New active session detected: ${newSession.sessionId}`);
      }
    } catch (err) {
      log.error(`Session watch failed: ${err}`);
    } finally {
      this.pollBusy = false;
    }
  }

  // ─── Session picker ────────────────────────────────────────────

  async selectSession(): Promise<void> {
    // Clear badge when user opens the picker
    this.setNewSessionBadge(false);

    const workspace = getWorkspacePath();
    if (!workspace) {
      vscode.window.showWarningMessage("KnoLens: No workspace folder open");
      return;
    }

    const { all, active } = await SessionManager.discover(workspace);
    if (all.length === 0) {
      vscode.window.showInformationMessage(
        "KnoLens: No Claude Code sessions found for this workspace",
      );
      return;
    }

    const picked = await pickSession(active, all);
    if (picked) {
      await this.connectToSession(picked);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private postStatus(status: string): void {
    this.view?.webview.postMessage({ type: "status", data: status });
  }

  private setNewSessionBadge(visible: boolean): void {
    vscode.commands.executeCommand("setContext", "knoLens.newSessionAvailable", visible);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// ─── Activation ──────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  log.info("KnoLens activating");
  log.info(
    `Workspace folders: ${JSON.stringify(vscode.workspace.workspaceFolders?.map((f) => f.uri.toString()))}`,
  );

  const provider = new ViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("knoLens.showLens", () => {
      vscode.commands.executeCommand("knoLens.sessionView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("knoLens.selectSession", () => {
      provider.selectSession();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("knoLens.selectSessionNew", () => {
      provider.selectSession();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("knoLens.openExplorer", () => {
      provider.explorer.open();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "knoLens.openExplorerForFile",
      (uri: vscode.Uri | undefined) => {
        const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
        provider.explorer.open(filePath ? { fileFilter: filePath } : undefined);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("knoLens.refreshExplorer", () => {
      provider.explorer.open();
    }),
  );

  context.subscriptions.push(provider.explorer);

  log.info("KnoLens activated");
}

export function deactivate(): void {
  log.info("KnoLens deactivating");
}
