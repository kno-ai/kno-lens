# Glossary

Terms that have specific meanings in this codebase. Many of these
overlap with general programming terms but carry narrower definitions
here.

---

**Activity** — A single tool invocation with a start/end lifecycle.
Every time Claude calls Read, Bash, Edit, Agent, or any other tool,
that's one activity. Activities have a typed `kind` (file_read, bash,
search, etc.), structured input/output fields, and a status that
transitions from `running` → `done` or `error`. Activities are the
atomic unit of work in the system. Not to be confused with a step
(which is the container) or a turn (which groups many steps).

**Assembly limits** — Configurable caps on how large the materialized
Session can grow. Defined as `AssemblyLimits` in core. Controls max
turns retained, max steps per turn, and max tracked file paths.
Distinct from truncation limits (which control text field sizes in
the parser).

**Compaction** — A process where Claude Code rewrites earlier records
in its JSONL log into a more compact form. Marked in the log by a
`system/compact_boundary` record. The parser emits a `compaction`
event but no consumer currently acts on it.

**Continuation** — A session that was resumed from a previous
conversation using Claude Code's `/resume` or continuation feature.
Detected by the parser from the first user prompt's text prefix.
Stored as `isContinuation` on `SessionMeta`.

**Event** — A `SessionEvent` value emitted by the parser. The
fundamental unit of the data pipeline. There are 12 event types
(session_start, turn_start, text_output, thinking, activity_start,
activity_end, turn_end, turn_duration, compaction, session_end,
progress, parse_error). Events are immutable after emission.

**Importance** — A three-level ranking (`high`, `medium`, `low`) that
controls which summary items are shown to the user. Each activity
category has a default importance. Users can override importance per
category via `SummaryConfig`. Items below the configured
`defaultMinImportance` are hidden. A category can also be set to
`hidden` to exclude it entirely.

**Live state** — The `LiveTurnState` object produced by
`LiveTurnModel`. Represents what Claude is doing right now: which
activities are running, how many have completed, the last text excerpt.
Only populated during an active turn; null between turns. Distinct
from the snapshot (which represents completed, summarized turns).

**Parser** — The streaming JSONL-to-events transformer. One parser
instance per session. Processes lines incrementally via `parse(line)`
and flushes remaining state via `end()`. The current implementation is
`ClaudeCodeParserV1`. The parser registry routes to the correct
implementation based on tool name and CLI version.

**Session** — The materialized view of all events processed so far.
A `Session` object contains metadata, status, turns array, and
aggregate stats. Produced by `SessionBuilder.snapshot()`. Represents
the full accumulated state, subject to assembly limits.

**Sidechain** — JSONL records produced by an Agent subprocess that
appear in the parent session's log file. Marked with
`isSidechain: true`. The parser skips these entirely. They represent
the agent's internal conversation, not parent-level activity.

**Slug** — A human-readable identifier for a session, assigned by
Claude Code (e.g., "warm-crimson-eagle"). Optional — not all sessions
have one. Used as the display name in the UI when present; falls back
to a truncated session ID otherwise.

**Snapshot** — A `SessionSnapshot` object: the serialization boundary
between view and ui. Contains the `Session`, all `TurnSummary` records
for visible turns, and a version string for the summary algorithm. This
is what crosses the postMessage bridge to the webview.

**Step** — A `TurnStep` within a turn. Three kinds: `TextStep` (model
text output), `ThinkingStep` (model reasoning with optional excerpt),
`ActivityStep` (wraps an Activity). Steps are ordered within a turn
and represent the chronological sequence of what happened.

**Summary** — A `TurnSummary` produced by `summarizeTurn()` for a
completed turn. Contains classified, filtered, grouped, and truncated
`SummaryItem` entries plus stats. Summaries are only computed on
completed turns — never partial.

**Turn** — One user prompt → assistant response cycle. A turn contains
zero or more steps (text, thinking, activities). Turns have a status
(`active`, `done`, `error`), token usage, optional duration, and an
error count. Turn IDs are sequential integers starting from 1.

**Truncation** — The parser's mechanism for limiting text field sizes.
Configured via `SessionCoreConfig`. Truncated strings end with "…".
Setting a limit to 0 omits the field entirely. The full untruncated
content is available via the `resultRecordUuid` cross-reference to the
source JSONL file.
