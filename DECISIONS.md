# Design Decisions

Decisions that shaped the architecture, with the reasoning and tradeoffs
that produced them. Read ARCHITECTURE.md first for the system overview.

---

## Truncation at parse time, not display time

Text fields (bash output, thinking excerpts, edit strings, agent
prompts) are truncated in the parser via `SessionCoreConfig`, not in
view or ui.

**Why:** The event stream is the system's memory budget. Every event
persists in the SessionBuilder for the lifetime of the session. If we
stored full content and truncated at display, a 500-turn session with
large bash outputs and diffs would accumulate tens of megabytes of text
that no consumer ever renders. Truncating at the source keeps memory
proportional to event count, not content size.

**The escape hatch:** Activities carry `resultRecordUuid` — a pointer
back to the original JSONL record. Any consumer that needs full content
(a "show full diff" feature, for example) reads it from the source file
on demand. This keeps the hot path lean while preserving access to the
full data.

**What this means for new features:** If you need a new text field on
an activity, add it with a truncation limit in `SessionCoreConfig`. If
a feature needs the full untruncated content, use the resultRecordUuid
cross-reference pattern rather than increasing the truncation limit.

---

## Parallel live model and builder, not live-from-builder

The `SessionController` runs two consumers on every event:
`SessionBuilder` (full accumulation) and `LiveTurnModel` (lightweight
status). The live model does NOT read from the builder — it maintains
its own independent state.

**Why:** The builder's `snapshot()` allocates a new `Session` object.
Calling it on every event to extract live status would be expensive
during high-throughput tool sequences (a turn with 50 parallel agent
calls generates hundreds of events per second). The live model is O(1)
per event — it mutates a single flat object. No allocations, no
iteration.

**The tradeoff:** Two consumers means two code paths that must agree on
turn boundaries. If `LiveTurnModel` and `SessionBuilder` disagree about
when a turn starts or ends, the UI shows inconsistent state. This is
mitigated by both consuming the same `SessionEvent` union, but it's a
real maintenance surface.

**What this means for new features:** Live indicators should read from
`LiveTurnModel`, not from snapshots. If you need live data that requires
cross-event computation, consider whether it belongs in the live model
(if O(1) per event) or as a snapshot query (if it needs the full
session graph).

---

## Eager turn_end on end_turn stop_reason

The parser emits `turn_end` immediately when it sees an assistant
message with `stop_reason: "end_turn"`, even though the
`system/turn_duration` record hasn't arrived yet. If the duration record
arrives later, a separate `turn_duration` event carries it.

**Why:** Live consumers (LiveTurnModel) need to know the turn is over
so they can clear the running-activities display and let the summary
appear. Waiting for `system/turn_duration` would leave the live
indicator showing stale activities for hundreds of milliseconds — the
gap between the assistant's final message and the system's duration
record.

**The complexity this creates:** The builder must handle two scenarios:
(1) `turn_end` arrives with `durationMs` already set (duration record
came first), or (2) `turn_end` arrives without duration, then
`turn_duration` patches it later. The parser tracks this with
`turnStartedAt` / `turnDurationMs` state, and the builder's
`turn_duration` handler finds the turn by ID.

**Why not just always emit turn_duration separately?** Because in some
log sequences, `system/turn_duration` arrives before `end_turn`. In
that case, we close the turn with the duration attached. Emitting a
separate duration event for data we already have would complicate the
builder for no benefit.

---

## Activities as start/end pairs, not single records

Every tool invocation produces two events: `activity_start` (when the
tool is called) and `activity_end` (when the result arrives). The
activity object is carried on both, with enriched fields on the end
event.

**Why:** The gap between start and end can be significant — a bash
command might run for 30 seconds, an agent for minutes. During that
gap, the live model needs to show "Running `npm test`" with an elapsed
timer. A single "completed activity" event would make live progress
impossible.

**The cost:** Every activity requires two events, and the parser must
track pending activities in a `Map<toolUseId, Activity>`. On `end()`,
any pending activities without results are flushed as errors
("Session ended before tool result received"). This orphan handling
is the main complexity cost.

**Alternative considered:** A single event with an `"in_progress"`
status that gets mutated to `"done"`. Rejected because events should
be immutable after emission — back-patching violates the parser's
contract and makes the event stream non-deterministic for consumers
that process events in order.

---

## Parser deduplication by message fingerprint

The parser deduplicates assistant messages using a composite key:
`message.id + requestId + stop_reason`. Messages with the same key
are emitted only once.

**Why:** Claude Code's JSONL logs can contain stuttered messages — the
same assistant response appears multiple times with identical content.
This happens during streaming: intermediate chunks share the same
`message.id` but have `stop_reason: null`, while the finalized message
has a concrete `stop_reason`. Without deduplication, turns would show
duplicate text outputs and duplicate tool calls.

**Why this specific key?** `message.id` alone isn't enough because
streaming chunks share it. Adding `stop_reason` distinguishes chunks
from the finalized message. Adding `requestId` handles the case where
the same model response is retried with a new request.

**What this means for new features:** If you see duplicate events in
test output, check whether the fixture has stuttered messages. The
deduplication only applies to finalized messages (non-null
`stop_reason`), so streaming chunks are intentionally not deduplicated.

---

## SessionBuilder.snapshot() as method, not pure function

`SessionBuilder` is a stateful class with a `push(event)` method and
a `snapshot()` method, rather than a pure function from events to
session.

**Why:** The builder must serve both live and batch consumption with
the same code path (the "single assembly path" principle). A pure
function `buildSession(events)` would work for batch but can't serve
live — you'd need to re-process all events on every snapshot. The
stateful builder processes each event once and snapshots on demand.

**The caching layer:** `SessionController` adds snapshot caching on
top. It marks the snapshot dirty on every event, and `snapshot()`
only rebuilds when dirty. This means rapid event sequences
(activity_start, text_output, activity_end in quick succession) only
build one snapshot if nothing reads between them.

---

## Summary only on completed turns

`summarizeTurn()` runs only when a turn ends. There are no partial
summaries during a turn, even for long turns with many activities.

**Why:** You cannot judge importance mid-turn. A turn that starts with
20 file reads might end with a single critical file edit — the reads
were exploration, not the point. Summarization needs the complete
picture to assign importance correctly, group consecutive items, and
compute accurate stats.

**What shows during a turn instead:** The `LiveTurnModel` provides a
lightweight activity feed — running tools, completed count, error
count, last text excerpt. This is intentionally raw and unsummarized.
The moment the turn ends, the live indicator disappears and the summary
appears. Consumers never see both simultaneously for the same turn.

---

## ui has no npm dependency on vscode

The ui package does not import `vscode` or any VS Code API. It
communicates with the extension exclusively through `postMessage`.

**Why:** This enables the dev harness — a standalone browser page where
you can iterate on rendering with hot reload, fixture data, and live
WebSocket feeds, without launching VS Code. It also means the ui
components are testable with happy-dom (a lightweight DOM
implementation) rather than requiring a full VS Code extension host.

**The cost:** The postMessage protocol is an implicit contract. Changes
to message types require coordinated updates in both packages. The
protocol is documented in ARCHITECTURE.md to make this explicit.

---

## io as a separate package from vscode

Session discovery, file tailing, and state management live in io rather
than in the vscode extension directly.

**Why:** These capabilities are not VS Code-specific. A future CLI
viewer, web dashboard, or JetBrains plugin would need the same
discovery and tailing logic. Keeping it in a separate package with only
Node.js dependencies means it's reusable without pulling in any VS Code
APIs.

**What stays in vscode:** Anything that calls `vscode.*` APIs — webview
creation, settings reading, command registration, file opening. The
extension is a thin adapter between VS Code's API surface and the
library packages.

---

## Config objects are plain data, not settings readers

`SummaryConfig`, `SessionCoreConfig`, and `AssemblyLimits` are plain
TypeScript interfaces with no knowledge of where their values come
from. The vscode package reads VS Code settings and constructs these
objects; the library packages receive them as constructor arguments.

**Why:** Libraries that read settings directly are untestable without
mocking the settings system. Plain config objects can be constructed
in tests with object literals. This also means the same libraries work
with different config sources (VS Code settings, CLI flags, environment
variables, hardcoded test values) without modification.

---

## Display counts computed in view, not UI

Every derived metric that a UI needs for display — `edits` (filesCreated

- filesEdited), total tokens, duration fallback — is computed once in
  `summarizeTurn()` and stored as `TurnDisplayCounts` on the
  `TurnSummary`. UI components read these values directly.

**Why:** kno lens targets multiple platforms (VS Code today, desktop app
next). If display derivations live in UI components, every new platform
must reimplement the same calculations, creating divergence risk. When
error counts disagreed between the session header and the timeline, it
was because two different code paths computed "errors" differently.
Moving all derivations to the view layer eliminated this class of bug.

**The rule:** If a UI component needs a number that isn't directly on
`SessionStats`, `TurnSummaryStats`, or `LiveActivityCounts`, the view
layer must compute it and export it. The UI never sums, combines, or
derives from raw stats.

**What this means for new features:** To add a new display metric,
add it to `TurnDisplayCounts` and compute it in `summarizeTurn()`. For
live turns, add it to `LiveActivityCounts` and compute it in
`LiveTurnModel`. Never add the derivation to a UI component.

---

## Error counting from activity status, not category

Error counts use `activity.status === "error"` everywhere — in the
core builder (`SessionStats.errorCount`, `turn.errorCount`), in the
view summarizer (`TurnSummaryStats.errors`), and in the live model
(`LiveTurnState.errorCount`).

**Why:** Categories like `bash_error` are display classifications.
A `file_edit` that fails has `status: "error"` but gets classified as
`file_edited` for display. Counting errors by category missed non-bash
errors, causing the session header (which uses the builder's count) to
disagree with the timeline (which used the summary's count). Using
`activity.status` as the single source of truth for "is this an error"
makes all counts consistent.

**What this means for new features:** When adding a new activity kind,
you don't need to create an error variant for it. The existing
`status === "error"` check handles it automatically.

---

## Stale live suppression via file recency

When the extension connects to a session file, the `SessionManager`
checks whether the file was recently modified (within `liveRecencyMs`,
default 30s). If the file is stale, any "live" turn state from the
initial catch-up read is suppressed until new writes arrive.

**Why:** Sessions that ended abruptly (process killed, terminal closed)
leave an unclosed turn in the JSONL. Without suppression, connecting to
such a session shows a pulsing green "active" indicator for a session
that hasn't been running for hours. The recency check distinguishes
"this file has an unclosed turn because the session is genuinely
running" from "this file has an unclosed turn because it was abandoned."

**The tradeoff:** If a session pauses for longer than `liveRecencyMs`
(e.g., user is thinking for 2 minutes), the live indicator disappears
until new events arrive. This is acceptable — the indicator reappears
immediately when writing resumes.
