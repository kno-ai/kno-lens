import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

/** Copy built assets into the extension's media/ folder after each build. */
function copyToExtension() {
  const extMedia = resolve(__dirname, "../vscode/media");
  const dist = resolve(__dirname, "dist");
  return {
    name: "copy-to-extension",
    closeBundle() {
      try {
        mkdirSync(extMedia, { recursive: true });
        copyFileSync(resolve(dist, "webview.js"), resolve(extMedia, "webview.js"));
        copyFileSync(resolve(dist, "style.css"), resolve(extMedia, "style.css"));
      } catch {
        // Extension package may not exist yet — ignore
      }
    },
  };
}

export default defineConfig({
  plugins: [preact(), copyToExtension()],
  root: "dev",
  publicDir: false,
  server: {
    // Allow serving files from the parent (src/) directory
    fs: {
      allow: [".."],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
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
