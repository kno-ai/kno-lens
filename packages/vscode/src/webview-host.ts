import * as vscode from "vscode";
import { randomUUID } from "crypto";

/**
 * Generate the webview HTML with CSP, nonce, and references to the
 * pre-built ui webview bundle.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const mediaUri = vscode.Uri.joinPath(extensionUri, "media");
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "style.css"));
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
  <title>KnoLens</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
