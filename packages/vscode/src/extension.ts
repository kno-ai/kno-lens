import * as vscode from "vscode";
import { SessionManager } from "@kno-lens/io";
import type { SessionInfo } from "@kno-lens/io";
import { getWebviewHtml } from "./webview-host.js";
import { SessionConnector } from "./session-connector.js";
import { pickSession } from "./session-picker.js";
import { PanelManager } from "./panel-manager.js";

const log = vscode.window.createOutputChannel("KnoLens", { log: true });

// ─── Sidebar WebviewViewProvider ─────────────────────────────────────────

class ViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "knoLens.sessionView";

  private view: vscode.WebviewView | undefined;
  private connector: SessionConnector | undefined;
  private extensionUri: vscode.Uri;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private connecting = false;
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

    webviewView.onDidDispose(() => {
      this.connector?.dispose();
      this.connector = undefined;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      this.view = undefined;
    });

    // Auto-connect, then poll until connected
    this.autoConnect();
    this.startPolling();
  }

  async connectToSession(sessionInfo: SessionInfo): Promise<void> {
    if (!this.view) return;

    // Tear down previous connection
    this.connector?.dispose();

    log.info(`Connecting to session: ${sessionInfo.sessionId}`);
    log.info(`  File: ${sessionInfo.path}`);

    this.connector = new SessionConnector(sessionInfo, this.view.webview, this.explorer);
    await this.connector.start();

    this.view.title = `Session — ${sessionInfo.sessionId.slice(0, 8)}…`;

    // Stop polling once connected
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async autoConnect(): Promise<void> {
    if (this.connecting) return;

    const workspace = getWorkspacePath();
    if (!workspace) {
      log.warn("No workspace folder open");
      return;
    }

    this.connecting = true;
    log.info(`Discovering sessions for: ${workspace}`);

    try {
      const { all, active } = await SessionManager.discover(workspace);
      log.info(`Found ${all.length} session(s), ${active.length} active`);

      if (all.length === 0) return;

      // Silently connect to the most recent active session, or most recent overall
      const target = active[0] ?? all[0];
      if (target) {
        await this.connectToSession(target);
      }
    } catch (err) {
      log.error(`Auto-connect failed: ${err}`);
    } finally {
      this.connecting = false;
    }
  }

  /** Poll for sessions every 3s until we connect to one. */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      if (this.connector) {
        // Already connected — stop polling
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        return;
      }
      log.info("Polling for sessions...");
      this.autoConnect();
    }, 3000);
  }

  async selectSession(): Promise<void> {
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
    vscode.commands.registerCommand("knoLens.selectSession", () => {
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

  context.subscriptions.push(provider.explorer);

  log.info("KnoLens activated");
}

export function deactivate(): void {
  log.info("KnoLens deactivating");
}
