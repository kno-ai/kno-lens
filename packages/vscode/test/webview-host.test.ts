import { describe, it, expect } from "vitest";
import { vi } from "vitest";

// Mock vscode before importing the module under test
vi.mock("vscode", () => import("./__mocks__/vscode.js"));

import { Uri } from "./__mocks__/vscode.js";

const { getWebviewHtml } = await import("../src/webview-host.js");

// ─── Helpers ────────────────────────────────────────────────────────────

function createMockWebview() {
  return {
    cspSource: "https://mock.csp.source",
    asWebviewUri(uri: { path: string }) {
      return { toString: () => `vscode-webview://mock/${uri.path}` };
    },
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("getWebviewHtml", () => {
  it("returns valid HTML with doctype", () => {
    const webview = createMockWebview();
    const extensionUri = Uri.file("/ext");
    const html = getWebviewHtml(webview as any, extensionUri);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
  });

  it("includes Content-Security-Policy meta tag", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });

  it("includes nonce in CSP and script tag", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    // Extract nonce from script tag
    const nonceMatch = html.match(/nonce="([^"]+)"/);
    expect(nonceMatch).not.toBeNull();
    const nonce = nonceMatch![1]!;

    // CSP should reference the same nonce
    expect(html).toContain(`script-src 'nonce-${nonce}'`);

    // Script tag should have the nonce attribute
    expect(html).toContain(`<script nonce="${nonce}"`);
  });

  it("generates unique nonces across calls", () => {
    const webview = createMockWebview();
    const ext = Uri.file("/ext");

    const html1 = getWebviewHtml(webview as any, ext);
    const html2 = getWebviewHtml(webview as any, ext);

    const nonce1 = html1.match(/nonce="([^"]+)"/)![1];
    const nonce2 = html2.match(/nonce="([^"]+)"/)![1];

    expect(nonce1).not.toBe(nonce2);
  });

  it("includes cspSource for style-src and font-src", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain(`style-src ${webview.cspSource}`);
    expect(html).toContain(`font-src ${webview.cspSource}`);
  });

  it("references webview.js script from media folder", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    // asWebviewUri should be called with a URI ending in media/webview.js
    expect(html).toContain("webview.js");
    expect(html).toMatch(/src="[^"]*webview\.js"/);
  });

  it("references webview.css from media folder", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain("webview.css");
    expect(html).toMatch(/href="[^"]*webview\.css"/);
  });

  it("has a #root div for the app mount point", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain('<div id="root"></div>');
  });

  it("sets the title to KnoLens", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain("<title>KnoLens</title>");
  });

  it("includes charset and viewport meta tags", () => {
    const webview = createMockWebview();
    const html = getWebviewHtml(webview as any, Uri.file("/ext"));

    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain('name="viewport"');
  });
});
