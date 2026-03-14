# Architecture

This document defines the separation of concerns, ownership boundaries,
and contracts across the kno-lens system. It is the reference for all
future work. New capabilities must fit within these boundaries or
explicitly propose changes to this document first.

## System overview

```
core  ←  view  ←  io  ←  vscode
                  ↑         ↓ (postMessage)
                  ui ←──────┘
```

Five packages. Dependencies flow strictly in one direction — each
package imports only from packages to its left:

| Package    | npm name         | Role                                                               |
| ---------- | ---------------- | ------------------------------------------------------------------ |
| **core**   | `@kno-lens/core` | Data extraction. JSONL → events → Session.                         |
| **view**   | `@kno-lens/view` | Presentation logic. Events → summaries, live state, snapshots.     |
| **io**     | `@kno-lens/io`   | File I/O. Session discovery, JSONL tailing, throttled state relay. |
| **ui**     | `@kno-lens/ui`   | Rendering. Preact components + CSS.                                |
| **vscode** | `kno-lens`       | Platform shell. Webview hosting, settings, commands.               |

**ui does not depend on vscode at the npm level.** The vscode package
bundles ui's pre-built assets (`webview.js`, `style.css`) into its
`media/` folder. Communication is via postMessage only.

---

## Package responsibilities and prohibitions

### core

**Owns:** parsing raw JSONL into typed events; assembling events into a
materialized `Session` model.

**Exports:**

- `Parser` interface and `createParser()` factory
- `ClaudeCodeParserV1` — streaming parser for Claude Code JSONL
- `SessionEvent` — discriminated union (12 event types)
- `SessionBuilder` — incremental event → Session assembler
- `Session`, `Turn`, `Activity` — materialized view types
- `SessionCoreConfig` — parser truncation limits
- `AssemblyLimits` — builder growth caps
- `SCHEMA_VERSION` — travels with serialized data

**Rules:**

- No presentation concerns (labels, summaries, icons, colors)
- No I/O (no `fs`, no `fetch`, no platform APIs)
- No runtime dependencies (zero `dependencies` in package.json)
- Parser is deterministic: same input → same output. No `Date.now()`,
  no random values, no heuristic text parsing
- Parser extracts, never interprets: no aggregation across events, no
  back-patching earlier events with later data
- SessionBuilder is the sole place for cross-event derived data (error
  counts, durations, stats, file tracking)

**Bounded growth (defaults):**

- `maxTurns: 500` — oldest evicted when exceeded
- `maxStepsPerTurn: 1000` — new steps dropped, activity_end still
  updates existing steps
- `maxTrackedFiles: 2000` — new paths ignored once hit
- Stats accumulators are uncapped but O(1) per event (counters, not
  collections)
- Parser truncates all text fields via `SessionCoreConfig` (bash
  output: 120 chars, thinking: 200, edits: 500, prompts: 200,
  errors: 500, answers: 500, search files: 20)

#### Parser pipeline

```
JSONL line  →  Parser.parse(line)  →  SessionEvent[]
                Parser.end()       →  SessionEvent[]  (flush + session_end)
```

- One parser instance per session
- `parse()` is called per line, returns zero or more events
- `end()` flushes orphaned activities as errors, closes open turns,
  emits `session_end`
- Deduplication: finalized assistant messages (same id + requestId +
  stop_reason) are emitted only once
- Sidechain records are silently skipped
- Parser registry routes by tool name + CLI version for forward
  compatibility

#### Session model

```
SessionEvent[]  →  SessionBuilder.push(event)  →  builder.snapshot()  →  Session
```

- Single assembly path for both live (push + snapshot) and batch
  (`SessionBuilder.from(events)`)
- `snapshot()` returns a point-in-time copy (shallow copy of turns;
  deep copy via postMessage serialization in practice)
- `isReady` is false until `session_start` is received

### view

**Owns:** presentation logic — summarization, live-turn tracking,
snapshot management. The bridge between raw data and display.

**Exports:**

- `SessionController` — single entry point; accepts events, produces
  read-only state
- `LiveTurnModel` — O(1) per-event status tracking for in-progress
  turns
- `summarizeTurn()` — pure function: Turn + config → TurnSummary
- `activityLabel()` — pure function: Activity → human-readable string
- `SessionSnapshot` — serializable controller state for persistence
  and rendering
- `SummaryConfig` — display tuning (importance overrides, min
  importance, grouping, max items, max visible turns)
- Category registry — icons, colors, filter groups for each activity
  kind

**Rules:**

- No I/O (no `fs`, no network, no platform APIs)
- No HTML, no CSS, no DOM — pure TypeScript logic
- No direct dependency on ui or vscode
- Testable with synthetic events — no fixtures required
- `summarizeTurn()` runs only on completed turns (no partial summaries)
- `activityLabel()` is the single source of truth for human-readable
  activity descriptions

**Key contracts:**

`SessionController`:

```
controller.onEvent(event)     → void          // single input
controller.liveState          → LiveTurnState | null
controller.summaries          → Map<turnId, TurnSummary>
controller.snapshot()         → Session       // cached, rebuilt when dirty
controller.exportState()      → SessionSnapshot
controller.updateConfig(cfg)  → void          // re-summarizes all turns
```

`SessionSnapshot` (the serialization boundary):

```
{
  session: Session,                    // full session with turns array
  summaries: Record<turnId, TurnSummary>,
  summaryConfigVersion: string         // detects stale algorithms
}
```

**Bounded growth:**

- `maxVisibleTurns` (default 50) — `exportState()` slices to most
  recent N turns; summaries for evicted turns are excluded
- `maxVisibleItems` (default 15) — `summarizeTurn()` truncates with
  "…and N more"
- Turn summaries are evicted in sync with SessionBuilder turn eviction

### io

**Owns:** file-system interaction for session data. Discovery, tailing,
and throttled state relay.

**Exports:**

- `discoverSessions(workspacePath)` — finds JSONL files in
  `~/.claude/projects/<slug>/`, returns `SessionInfo[]` sorted by
  modification time
- `filterActiveSessions(sessions, thresholdMs)` — filters by recency
  (default: 5 minutes)
- `SessionTailer` — tails a JSONL file, emits parsed `SessionEvent[]`
  via EventEmitter
- `SessionManager` — high-level orchestrator: creates a
  `SessionController` + `SessionTailer`, processes events, emits
  throttled state updates

**Rules:**

- No presentation logic (no labels, no summaries, no rendering)
- No VS Code APIs — uses only Node.js builtins (`fs`, `path`,
  `events`, `os`)
- No direct dependency on ui
- Throttled updates prevent excessive downstream work (default: 50ms,
  configurable via `throttleMs`)

**Key contracts:**

`SessionManager`:

```
manager.start()               → Promise<void>  // reads existing + watches
manager.stop()                → void            // cleanup + final flush
manager.state                 → SessionManagerState
manager.on("update", state)   → SessionManagerState
manager.on("ready")           → void            // initial catch-up complete
manager.on("session-end")     → void
manager.on("error", err)      → Error
```

`SessionManagerState`:

```
{
  snapshot: SessionSnapshot | null,
  live: LiveTurnState | null
}
```

### ui

**Owns:** rendering session data as HTML/CSS. Components, styles,
search, filtering.

**Exports:**

- `App` — props-based root component (snapshot + live + config →
  rendered UI)
- `WebviewApp` — wrapper that manages postMessage communication with
  VS Code

**Rules:**

- No I/O (no `fs`, no network calls)
- No VS Code API dependency — runs identically in browser dev harness
  and VS Code webview
- No business logic beyond display (no event processing, no
  summarization)
- Uses VS Code CSS variables for theme matching (dark, light, high
  contrast)
- All data arrives via props (App) or postMessage (WebviewApp)

**Dev harness:** standalone Vite server with fixture data and live
WebSocket mode. Same components, no VS Code required.

### vscode

**Owns:** platform integration. The boundary between VS Code APIs and
the library packages.

**Exports:** `activate()` and `deactivate()` extension entry points.

**Internal components:**

- `LensViewProvider` — registers sidebar webview, manages lifecycle,
  auto-connect polling
- `SessionConnector` — bridges SessionManager events to webview
  postMessage
- `pickSession()` — VS Code quick pick UI for session selection
- `getSummaryConfig()` / `getThrottleMs()` — reads VS Code settings
  into plain config objects

**Rules:**

- No business logic (no event processing, no summarization, no data
  transformation)
- No rendering logic (no HTML generation beyond the webview shell)
- No direct dependency on ui at the npm level — bundles pre-built
  assets only
- Config flows in, state flows out: reads VS Code settings, builds
  plain config objects, passes to io/view. Libraries never read
  settings or environment variables directly
- All VS Code API usage is confined to this package

---

## Contracts between packages

### core → view (SessionEvent stream)

The `SessionEvent` discriminated union is the contract. View's
`SessionController` consumes events via `onEvent()`. View must handle
all event types; core must not change event semantics without a
`SCHEMA_VERSION` bump.

### view → io (SessionController)

io creates and owns the `SessionController` instance inside
`SessionManager`. It feeds events from `SessionTailer` into the
controller and reads state via `exportState()` and `liveState`.

### io → vscode (SessionManagerState)

The `SessionManager` emits `"update"` events carrying
`SessionManagerState` (snapshot + live). The extension's
`SessionConnector` forwards these to the webview via postMessage.

### vscode ↔ ui (postMessage protocol)

**Extension → Webview:**

| type         | data                     | when                  |
| ------------ | ------------------------ | --------------------- |
| `"snapshot"` | `SessionSnapshot`        | On every state update |
| `"live"`     | `LiveTurnState \| null`  | On every state update |
| `"config"`   | `Partial<SummaryConfig>` | On settings change    |

**Webview → Extension:**

| type           | fields                   | action                                     |
| -------------- | ------------------------ | ------------------------------------------ |
| `"open-file"`  | `{ path: string }`       | Open file in editor (workspace-restricted) |
| `"drill-down"` | `{ activityId: string }` | Future: show raw JSONL record              |

---

## Configuration flow

Three configuration objects flow through the system at different layers:

| Config              | Defined in | Set by                                                   | Consumed by                        |
| ------------------- | ---------- | -------------------------------------------------------- | ---------------------------------- |
| `SessionCoreConfig` | core       | Parser defaults (overridable)                            | `ClaudeCodeParserV1`               |
| `AssemblyLimits`    | core       | Builder defaults (overridable)                           | `SessionBuilder`                   |
| `SummaryConfig`     | view       | vscode settings → `SessionManager` → `SessionController` | `summarizeTurn()`, `exportState()` |

---

## Key design principles

**Activities as the unit of work.** Every tool invocation is an activity
with a start/end lifecycle, a typed kind, and structured fields. The
start/end pair enables live progress display; the completed activity
carries the full result.

**Cross-reference to raw log.** Activities carry `resultRecordUuid` —
a pointer to the original JSONL record. The event stream truncates
aggressively for efficiency; consumers that need full content (diffs,
bash output) look it up in the source file.

**Forward compatibility.** The parser registry routes by tool name and
version. New log formats get new parser implementations without breaking
existing ones. Unknown CLI versions fall back to the latest parser.

**Three business logic seams** — all pure functions, all testable
without I/O:

1. `Parser.parse()`: JSONL line → SessionEvent[]
2. `summarizeTurn()`: Turn + config → TurnSummary
3. `activityLabel()`: Activity → human-readable string

**Single assembly path.** SessionBuilder serves both live and batch
consumption. There is no separate "build from complete data" function
that could diverge from the incremental path.

---

## Where does new work go?

| Want to...                                 | Package     | Notes                                            |
| ------------------------------------------ | ----------- | ------------------------------------------------ |
| Extract a new field from log records       | core        | Add to parser + event types                      |
| Support a new tool/activity type           | core        | Parser routing + Activity union                  |
| Compute something from multiple events     | core        | SessionBuilder                                   |
| Add a new event type                       | core        | SessionEvent union + SCHEMA_VERSION bump         |
| Add presentation logic (summaries, labels) | view        | summarizeTurn, activityLabel, registry           |
| Add a new filter/category                  | view        | Category registry                                |
| Change snapshot shape                      | view        | SessionSnapshot + SUMMARY_ALGORITHM_VERSION bump |
| Add rendering (components, CSS)            | ui          | Preact components + main.css                     |
| Add search/filter UI behavior              | ui          | search.ts, filter.ts                             |
| Add a new postMessage type                 | vscode + ui | Both sides of the protocol                       |
| Store or cache sessions                    | vscode      | Persistence layer                                |
| Add a VS Code command or setting           | vscode      | package.json contributes + settings.ts           |
| Add session file discovery logic           | io          | discovery.ts                                     |
| Change tailing behavior                    | io          | tailer.ts                                        |
| Change throttle/relay behavior             | io          | manager.ts                                       |
