# Data Model

How data flows through the system, the invariants that hold at each
stage, and the lifecycle events that matter. Read ARCHITECTURE.md for
package boundaries and DECISIONS.md for design rationale.

---

## Lifecycle of a JSONL line

A single line from a Claude Code log file travels through five
stages before reaching the user's screen:

```
1. JSONL line (raw string)
   ↓  SessionTailer reads from file, passes to parser
2. SessionEvent[] (typed, truncated, deduplicated)
   ↓  SessionController feeds to builder + live model
3. Session snapshot + LiveTurnState (materialized view)
   ↓  SessionManager throttles, emits to connector
4. postMessage (serialized to webview)
   ↓  WebviewApp receives, passes to App component
5. Rendered DOM
```

**Key property:** data shrinks at every stage. The raw JSONL line can
be kilobytes (full bash output, complete file diffs). The event
carries truncated excerpts. The snapshot carries only what's needed
for display. The webview receives only what's changed.

---

## Event ordering guarantees

The parser guarantees this ordering within a session:

1. `session_start` is always the first event emitted (on first user
   record)
2. `turn_start` always precedes any events for that turn
3. `activity_start` always precedes `activity_end` for the same
   activity ID
4. `turn_end` always follows `turn_start` for the same turn ID
5. `session_end` is always the last event emitted (from `parser.end()`)

Events that can appear in any position:

- `progress` — can appear at any time, may or may not reference a turn
- `parse_error` — can appear whenever a line fails to parse
- `compaction` — marks a log compaction boundary, informational only
- `turn_duration` — arrives after `turn_end` when the duration record
  was written to the log after the parser already closed the turn

**Invariant:** `turnId` values are monotonically increasing. Turn 1 is
always the first turn, turn 2 the second, etc. Turn IDs are never
reused or skipped.

---

## The turn lifecycle

A turn represents one user prompt → assistant response cycle.

```
User sends prompt
  ↓
turn_start { turnId, prompt, at }
  ↓
[zero or more of: thinking, text_output, activity_start, activity_end]
  ↓
turn_end { turnId, tokens, durationMs?, endedAt }
  ↓
[optionally: turn_duration { turnId, durationMs }]
```

### Turn status transitions

```
active  →  done    (turn_end with zero errors)
active  →  error   (turn_end with one or more activity errors)
```

There is no transition back to `active`. A turn that has ended stays
ended.

### The turn_end / turn_duration dance

Claude Code writes two records when a turn finishes:

1. An assistant message with `stop_reason: "end_turn"` — the model is
   done responding
2. A `system/turn_duration` record — the measured wall-clock duration

These can arrive in either order in the log:

**Case A: end_turn arrives first (most common)**

- Parser emits `turn_end` with `durationMs: undefined`
- Parser later emits `turn_duration` with the measured value
- Builder patches the turn's `durationMs` and adds to stats

**Case B: turn_duration arrives first**

- Parser stores the duration, then calls `closeTurn()` which emits
  `turn_end` with `durationMs` already set
- When end_turn arrives later, the turn is already closed — no second
  emission

**Case C: next user prompt arrives before turn_duration**

- Parser closes the previous turn on the new `turn_start`
- `turn_end` emitted with `durationMs: undefined`
- `turn_duration` may arrive later, may not

The builder handles all three cases. The live model only cares about
`turn_end` to clear its state.

---

## The activity lifecycle

An activity represents a single tool invocation.

```
Assistant requests tool use
  ↓
activity_start { turnId, activity: { id, kind, status: "running", ... } }
  ↓
[tool executes — may take milliseconds or minutes]
  ↓
User record with tool_result
  ↓
activity_end { turnId, activityId, activity: { status: "done"|"error", ... } }
```

### Activity enrichment

The `activity_start` event carries the activity with input fields
populated (file path, command, pattern, etc). The `activity_end` event
carries a copy of the activity enriched with result fields (exit code,
output, resultCount, answer, etc). The start activity is never
mutated — enrichment produces a new object.

### Orphaned activities

If the session ends while activities are still pending (tool_use
emitted but no tool_result received), `parser.end()` flushes them as
`activity_end` events with `status: "error"` and the message "Session
ended before tool result received."

### Pending activity tracking

The parser maintains a `Map<toolUseId, Activity>` for activities
awaiting results. When a `tool_result` arrives, the parser looks up
the pending activity by `tool_use_id`, enriches it, emits
`activity_end`, and removes it from the map.

---

## Sidechain records

Claude Code's Agent tool spawns subprocesses that write to the same
JSONL file. These records are marked with `isSidechain: true`. The
parser silently skips them.

**Why skip?** Sidechain records represent the agent's internal
conversation, not the parent session's activities. The parent session
already has an `activity_start`/`activity_end` pair for the Agent
tool — the sidechain records would create duplicate, nested events
that break the flat turn/step model.

**Future consideration:** A "drill into agent" feature would need to
parse sidechain records as a separate session. The `agentSessionId`
field on completed Agent activities provides the link.

---

## Compaction

Claude Code periodically compacts its JSONL logs — it rewrites
earlier records into a more compact form while preserving the logical
content. The parser emits a `compaction` event when it encounters a
`system/compact_boundary` record.

**Current handling:** The compaction event is informational only. No
consumer currently acts on it. It exists so that future features
(like "show compaction boundaries in the timeline") have the data
without re-parsing.

**What compaction means for parsing:** Records before a compaction
boundary may have different structure than records after it. The
parser handles both forms transparently.

---

## Continuation sessions

A continuation is a session that was resumed from a previous
conversation using Claude Code's session continuation feature. The
parser detects this by checking whether the first user prompt starts
with the prefix "This session is being continued from a previous
conversation".

**How it flows:** The `isContinuation` flag is set on `SessionMeta`
(part of `session_start`). It's informational — no consumer currently
changes behavior based on it, but it enables future features like
linking continued sessions or showing continuation markers.

---

## Cross-reference: resultRecordUuid

Every completed activity carries an optional `resultRecordUuid` field
— the `uuid` from the JSONL record that contained the tool result.

**Purpose:** The event stream aggressively truncates content for memory
efficiency. When a user wants to see the full bash output, the
complete file diff, or the full search results, the consumer can use
this UUID to locate the original record in the JSONL file and read the
untruncated content.

**Drill-down:** When the user clicks an activity in the sidebar, the
extension uses `lookupRecordByUuid()` (io package) to find the original
record in the JSONL file and opens it as formatted JSON in a read-only
editor tab.

---

## Growth boundaries in detail

The system has three layers of growth control, each with specific
overflow behavior:

### Parser layer (SessionCoreConfig)

Controls per-field text size. Applied at parse time — downstream
consumers never see the full text.

| Field                | Default limit | Overflow behavior  |
| -------------------- | ------------- | ------------------ |
| Bash output          | 120 chars     | Truncated with "…" |
| Thinking excerpt     | 200 chars     | Truncated with "…" |
| Edit old/new strings | 5000 chars    | Truncated with "…" |
| Agent prompt         | 200 chars     | Truncated with "…" |
| Error text           | 500 chars     | Truncated with "…" |
| Ask-user answer      | 500 chars     | Truncated with "…" |
| Search matched files | 20 paths      | Array sliced       |

Setting a limit to `0` omits the field entirely. Setting to `Infinity`
disables truncation.

### Builder layer (AssemblyLimits)

Controls collection sizes in the materialized session.

| Collection                     | Default limit | Overflow behavior                                            |
| ------------------------------ | ------------- | ------------------------------------------------------------ |
| Turns array                    | 500           | Oldest turn shifted off (FIFO eviction)                      |
| Steps per turn                 | 1000          | New steps dropped; activity_end still updates existing steps |
| Tracked files (read + written) | 2000          | New paths ignored; counters still increment                  |

**Stats survive eviction.** Token totals, cost, duration, command
count, delete count, and error count are accumulated before the turn
could be evicted. A session with 1000 turns will show accurate totals
even though only the most recent 500 turns are in the array.

### View layer (SummaryConfig)

Controls display density.

| Setting                    | Default | Overflow behavior                       |
| -------------------------- | ------- | --------------------------------------- |
| Max visible turns          | 50      | exportState() slices to most recent N   |
| Max visible items per turn | 15      | "…and N more" placeholder appended      |
| Default min importance     | medium  | Low-importance items hidden             |
| Hidden categories          | none    | Configured categories excluded entirely |

---

## Display counts

When a turn completes, `summarizeTurn()` computes `TurnDisplayCounts`
— a flat object with every derived metric the UI needs:

```
{
  edits: number,      // filesCreated + filesEdited
  deletes: number,    // filesDeleted (from bash delete-pattern detection)
  commands: number,   // commandsRun (includes failed commands)
  errors: number,     // turn.errorCount (all error-status activities)
  reads: number,      // filesRead
  searches: number,   // searchesRun
  tokens: number,     // inputTokens + outputTokens
  durationMs: number  // turn.durationMs or startedAt→endedAt fallback
}
```

These values are stored on `TurnSummary.counts` and travel with the
snapshot through postMessage to the webview. UI components read them
directly — no derivation at render time.

For live (in-progress) turns, `LiveActivityCounts` provides equivalent
real-time counts from `LiveTurnModel`.
