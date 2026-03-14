# Development

## Setup

First time, or after pulling changes that modify dependencies:

```bash
npm install
npm run build
```

## Build

Build everything before running tests or launching the extension.
Packages depend on each other's build output, so build all when in doubt.

```bash
# All packages (safe default)
npm run build --workspaces

# Single package (when you know only one changed)
npm run build -w @kno-lens/core
npm run build -w @kno-lens/view
npm run build -w @kno-lens/io
npm run build -w @kno-lens/ui
npm run build -w kno-lens          # vscode extension (also builds ui)
```

## Test

Run tests after making changes to verify nothing broke. Tests in
downstream packages (ui, vscode) depend on upstream builds (core,
view), so build first if you've changed a library package.

```bash
# All packages
npm test --workspaces

# Single package (faster iteration)
npm test -w @kno-lens/core
npm test -w @kno-lens/view

# Watch mode — re-runs on save (useful during active development)
cd packages/core && npx vitest
```

## Run the extension

Use this to test the full extension inside VS Code. Press **F5**
(uses `.vscode/launch.json`), which builds automatically via the
pre-launch task. Or build manually first:

```bash
npm run build -w kno-lens
# Then F5 to launch Extension Development Host
```

## Iterate on UI without VS Code

The fastest way to work on components and styles. No extension host
needed — runs in a regular browser with hot reload.

**Fixture mode** — loads static session snapshots. Best for tweaking
layout, styling, and component behavior with predictable data:

```bash
cd packages/ui
npx vite                           # http://localhost:5173
```

**Live mode** — tails a real Claude Code session from your workspace.
Best for testing the live indicator, real data flow, and timing:

```bash
cd packages/ui
npx tsx dev/server.ts              # http://localhost:5175/live.html
# or with a specific workspace:
npx tsx dev/server.ts -w /path/to/project
```

## Watch modes (side by side)

Use this when you're actively changing both the extension and the
webview and want to see updates without manually rebuilding. Run
these in two terminals, then F5 to launch the extension. Changes
auto-rebuild; reload the Extension Development Host window to pick
them up.

Terminal 1 — rebuild extension on change:

```bash
cd packages/vscode && npx tsup --watch
```

Terminal 2 — rebuild webview on change:

```bash
cd packages/ui && npx vite build --watch
```

## Package VSIX

Produces a `.vsix` file you can install locally or publish to the
marketplace. Useful for testing the packaged extension before release.

```bash
npm run build -w kno-lens
cd packages/vscode
npx @vscode/vsce package --no-dependencies
# produces kno-lens-<version>.vsix
```

Install locally to test: `code --install-extension kno-lens-0.1.0.vsix`

## Format

Prettier runs automatically on commit via the pre-commit hook
(husky + lint-staged). To format everything manually:

```bash
npm run format                     # fix all files
npm run format:check               # check without writing (CI uses this)
```

## Lint

Two layers: TypeScript type-checking and ESLint for code quality.
Both run in CI. ESLint also runs on commit via the pre-commit hook.

```bash
npm run lint --workspaces          # type-check all packages (tsc --noEmit)
npm run lint:eslint                # eslint across the whole repo
```

## Debug a JSONL file

Parses a Claude Code session log and prints a human-readable summary.
Useful for understanding what the parser sees, or verifying that a
new log format is handled correctly.

```bash
cd packages/core
npx tsx scripts/debug-parse.ts /path/to/session.jsonl
```
