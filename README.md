# KnoLens

[![CI](https://github.com/kno-ai/kno-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/kno-ai/kno-lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Open-source AI observability — see what your AI coding tools are actually doing.

KnoLens gives you visibility into LLM-assisted coding sessions: what tools were called, what files were changed, what failed, and how each turn unfolded. Local-first, privacy-respecting, and designed to run quietly inside your editor.

**[Install the VS Code extension](https://marketplace.visualstudio.com/items?itemName=kno-ai.kno-lens)** — live session viewer for Claude Code, directly in your sidebar.

## Why

AI coding tools are powerful but opaque. They read your files, run commands, and make changes — but you only see the final result. KnoLens opens that black box:

- **Understand what happened** — structured turn-by-turn summaries of every tool call, file edit, and command
- **Watch it happen live** — see running activities, elapsed time, and progress as Claude works
- **Search and filter** — find specific changes across turns, filter by activity type
- **Stay in control** — all data stays on your machine, read-only, zero telemetry

## Getting started

1. Install the extension from the [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=kno-ai.kno-lens)
2. Open a workspace where you use Claude Code
3. The KnoLens sidebar appears automatically

No configuration needed. It discovers your active session and connects.

## Built to extend

KnoLens is structured as a set of reusable packages, not a monolithic extension. The core parsing and visualization libraries have no VS Code dependency — they're designed to power other tools and integrations.

| Package                     | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| [`core`](packages/core)     | Session log parsing and structured data model         |
| [`view`](packages/view)     | Presentation logic — summaries, live state, snapshots |
| [`io`](packages/io)         | Session discovery and live file tailing               |
| [`ui`](packages/ui)         | Preact rendering components                           |
| [`vscode`](packages/vscode) | VS Code extension — the first KnoLens tool            |

Currently supports Claude Code. The parser architecture is designed for additional AI coding tools.

## Contributing

```bash
git clone https://github.com/kno-ai/kno-lens.git
cd kno-lens
npm install
npm run build
```

Press F5 in VS Code to launch the extension. See [DEVELOPMENT.md](DEVELOPMENT.md) for the full workflow.

| Document                           | Contents                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| [GUIDELINES.md](GUIDELINES.md)     | Product principles, implementation rules, privacy and security |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package boundaries, contracts, and where new work goes         |
| [DECISIONS.md](DECISIONS.md)       | Design decisions with rationale and tradeoffs                  |
| [DATA-MODEL.md](DATA-MODEL.md)     | Data lifecycle, event ordering, growth boundaries              |
| [GLOSSARY.md](GLOSSARY.md)         | Term definitions specific to this codebase                     |

## License

MIT
