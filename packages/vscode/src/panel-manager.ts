import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { SessionManagerState } from "@kno-lens/io";

/** Context passed from entry points when opening Explorer. */
export interface ExplorerContext {
  turnId?: number | undefined;
  fileFilter?: string | undefined;
}

/** Callback for messages from the Explorer webview. */
export type ExplorerMessageHandler = (msg: Record<string, unknown>) => void;

/**
 * Manages the Explorer WebviewPanel lifecycle.
 * Only one panel per session — reveals existing if already open.
 */
export class PanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;
  private panelDisposables: vscode.Disposable[] = [];
  private lastState: SessionManagerState | undefined;
  private messageHandler: ExplorerMessageHandler | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /** Register a handler for messages from the Explorer webview. */
  onMessage(handler: ExplorerMessageHandler): void {
    this.messageHandler = handler;
  }

  /** Open or reveal the Explorer panel, optionally with entry-point context. */
  open(context?: ExplorerContext): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      if (context) {
        this.panel.webview.postMessage({ type: "explorer-context", data: context });
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "knoLens.explorer",
      "KnoLens Explorer",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
      },
    );

    this.panel.webview.html = this.getHtml();

    // Wire incoming messages from Explorer webview.
    // The webview sends a "ready" message once its event listener is attached,
    // which triggers initial state delivery.
    const pendingContext = context;
    this.panelDisposables.push(
      this.panel.webview.onDidReceiveMessage((msg) => {
        if (!msg || typeof msg.type !== "string") return;
        if (msg.type === "ready") {
          this.sendInitialState(pendingContext);
          return;
        }
        this.messageHandler?.(msg);
      }),
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        for (const d of this.panelDisposables) d.dispose();
        this.panelDisposables = [];
      },
      null,
      this.panelDisposables,
    );
  }

  /** Clear cached state and notify the webview (called when switching sessions). */
  clearState(): void {
    this.lastState = undefined;
    if (this.panel) {
      this.panel.webview.postMessage({ type: "clear" });
    }
  }

  /** Forward all state updates to the Explorer webview. */
  postState(state: SessionManagerState): void {
    this.lastState = state;
    if (this.panel) {
      if (state.snapshot) {
        this.panel.webview.postMessage({ type: "snapshot", data: state.snapshot });
      }
      this.panel.webview.postMessage({ type: "live", data: state.live });
    }
  }

  get visible(): boolean {
    return this.panel?.visible ?? false;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const d of this.panelDisposables) d.dispose();
    this.panelDisposables = [];
  }

  /** Send cached state to the Explorer webview after it signals ready. */
  private sendInitialState(context?: ExplorerContext): void {
    if (!this.panel) return;
    if (this.lastState?.snapshot) {
      this.panel.webview.postMessage({ type: "snapshot", data: this.lastState.snapshot });
      this.panel.webview.postMessage({ type: "live", data: this.lastState.live });
    }
    if (context) {
      this.panel.webview.postMessage({ type: "explorer-context", data: context });
    }
  }

  private getHtml(): string {
    const webview = this.panel!.webview;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, "media");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "explorer.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "explorer.css"));
    const nonce = randomUUID();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
  ">
  <link rel="stylesheet" href="${styleUri}">
  <title>KnoLens Explorer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
