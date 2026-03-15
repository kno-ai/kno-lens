import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, renameSync } from "fs";

const dist = resolve(__dirname, "dist");
const extMedia = resolve(__dirname, "../vscode/media");

/**
 * Rename the generic "style.css" to a target-specific name, then copy to
 * the extension's media/ folder.
 */
function postBuild(cssName: string) {
  return {
    name: "post-build",
    closeBundle() {
      // Rename style.css → target-specific name
      const src = resolve(dist, "style.css");
      const dest = resolve(dist, cssName);
      if (existsSync(src) && src !== dest) {
        renameSync(src, dest);
      }

      // Copy to extension media/
      try {
        mkdirSync(extMedia, { recursive: true });
        for (const f of ["webview.js", "webview.css", "explorer.js", "explorer.css"]) {
          const s = resolve(dist, f);
          if (existsSync(s)) {
            copyFileSync(s, resolve(extMedia, f));
          }
        }
      } catch {
        // Extension package may not exist yet
      }
    },
  };
}

const target = process.env.BUILD_TARGET;

const webviewConfig = defineConfig({
  plugins: [preact(), postBuild("webview.css")],
  root: "dev",
  publicDir: false,
  server: {
    fs: { allow: [".."] },
  },
  build: {
    outDir: dist,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/webview.tsx"),
      output: {
        entryFileNames: "webview.js",
        assetFileNames: "[name].[ext]",
      },
    },
    cssCodeSplit: false,
  },
});

const explorerConfig = defineConfig({
  plugins: [preact(), postBuild("explorer.css")],
  root: "dev",
  publicDir: false,
  build: {
    outDir: dist,
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/explorer.tsx"),
      output: {
        entryFileNames: "explorer.js",
        assetFileNames: "[name].[ext]",
      },
    },
    cssCodeSplit: false,
  },
});

export default target === "explorer" ? explorerConfig : webviewConfig;
