# KnoLens

See what Claude Code is actually doing — live, in your sidebar.

Claude reads your files, runs commands, and makes changes, but you only see the result. KnoLens shows you every step: what tools were called, what files were touched, what failed, and how each turn unfolded.

Install it, open a workspace, and it connects automatically. No setup required.

## Features

- **Live activity tracking** — see running tools, elapsed time, and completed counts as Claude works
- **Turn summaries** — each turn is summarized with file edits, commands, errors, and searches
- **Auto-connect** — discovers and connects to your active Claude Code session automatically
- **Search and filter** — find turns by content, filter by activity type (edits, commands, errors)
- **Theme-aware** — matches your VS Code theme (dark, light, high contrast)
- **Privacy-first** — all data stays on your machine, read-only, zero telemetry

## Getting started

1. Install the extension
2. Open a workspace where you use Claude Code
3. The KnoLens sidebar appears and connects to your active session

Use the **Select Session** command to switch between sessions.

## Settings

| Setting                                | Default  | Description                                  |
| -------------------------------------- | -------- | -------------------------------------------- |
| `knoLens.summary.defaultMinImportance` | `medium` | Minimum importance level for summary items   |
| `knoLens.summary.groupConsecutive`     | `true`   | Group consecutive items of the same category |
| `knoLens.summary.maxVisibleItems`      | `15`     | Maximum visible summary items per turn       |
| `knoLens.summary.maxVisibleTurns`      | `50`     | Maximum visible turns                        |
| `knoLens.throttleMs`                   | `100`    | Throttle interval (ms) for live updates      |

## License

MIT
