import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  sourcemap: true,
  clean: true,
  // vscode is provided by the host — never bundle it.
  // All other dependencies (@kno-lens/io, @kno-lens/view, etc.)
  // are bundled into a single file so the VSIX is self-contained.
  external: ["vscode"],
  noExternal: [/@kno-lens\/.*/],
});
