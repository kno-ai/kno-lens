# Guidelines

Rules for all contributors — human or AI — working on this codebase.

---

## Product principles

KnoLens is a tool people install into their editor — their primary
work environment. Trust is the product. Users must be able to install
it, forget about it, and never have a reason to question whether it's
the cause of a problem.

**Do no harm.** The extension must never degrade the user's editor
performance, lose their data, make unexpected network calls, or
behave differently than described. If a feature can't meet this bar,
it ships disabled or doesn't ship.

**Fail silently, recover gracefully.** If a JSONL file is corrupted,
the session shows what it can — it doesn't crash the sidebar. If a
file watcher fails, the extension logs it and retries — it doesn't
surface error dialogs. The user should never see an error caused by
KnoLens unless they go looking for one in the output channel.

**Read-only by design.** KnoLens observes sessions. It does not modify
files, run commands, send network requests, or interact with Claude
Code. It reads JSONL files and displays their contents. Any feature
that would change this posture (writing files, calling APIs) requires
explicit architectural review.

**Instant install, zero configuration.** The extension should work
immediately after installation with no setup. Auto-connect finds the
active session. Defaults are sensible. Settings exist for power users,
not as required configuration.

**Predictable resource usage.** Memory and CPU usage should be
proportional to the session being viewed, bounded by configurable
limits, and constant when idle. A user running KnoLens for weeks
without restarting VS Code must not see degradation.

---

## Architecture compliance

The architecture document is the governing contract for this codebase.
All changes must conform to the package boundaries, dependency
directions, ownership rules, and prohibitions defined there.

**If a proposed change would violate the architecture:**

1. Stop before implementing
2. Identify which specific rule or boundary would be violated
3. Explain the violation and why the change requires it
4. Propose the specific updates to ARCHITECTURE.md that would be needed
5. Get explicit confirmation from the project owner that they want to
   make this architectural change
6. Update ARCHITECTURE.md first, then implement

Never silently break an architectural rule. A quick fix that crosses
a package boundary or violates a prohibition creates debt that
compounds across the codebase.

The specific package boundaries, dependency rules, and prohibitions
are defined in ARCHITECTURE.md. That document is the source of truth —
do not duplicate its rules here.

### Keeping docs current

When a change introduces a new design decision, alters a data flow,
adds a contract, or changes a boundary, the relevant documentation
must be updated in the same change — not as a follow-up task:

- New design decision or tradeoff → update **DECISIONS.md**
- New or changed package boundary, contract, or prohibition → update **ARCHITECTURE.md**
- New or changed event type, lifecycle, or growth limit → update **DATA-MODEL.md**
- New term with a specific meaning → update **GLOSSARY.md**

Documentation and code ship together. A design decision that isn't
recorded in DECISIONS.md will be lost by the next conversation.

---

## Implementation rules

These rules enforce the product principles above in code.

### Resource discipline

- **No unbounded growth.** Every collection, cache, and accumulator
  must have a cap. If something grows with usage (turns, events,
  file paths, search results), define a limit and an eviction
  strategy. Document the limit in ARCHITECTURE.md or DATA-MODEL.md.
- **No hot loops or polling without throttling.** File watching uses
  OS-level notifications (fs.watch), not polling. Update emissions
  are throttled. If you add a new recurring operation, it must have
  a configurable interval.
- **Minimize allocations on the hot path.** The event processing
  pipeline (parse → build → live model) runs on every JSONL line.
  Avoid creating objects, arrays, or closures that aren't needed.
  The live model is O(1) per event by design — keep it that way.
- **No blocking the extension host.** Parsing and state assembly are
  synchronous but fast (sub-millisecond per event). If a new feature
  requires heavy computation, move it off the main thread or make it
  lazy (compute on demand, not on every event).

### Display logic ownership

- **Compute display values in view, render in ui.** Every derived
  metric the UI displays (edits = filesCreated + filesEdited, total
  tokens, etc.) must be computed in the view package's
  `summarizeTurn()` and exported via `TurnDisplayCounts`. UI
  components read pre-computed values — they never sum, combine, or
  derive from raw stats. This ensures all platforms (VS Code, desktop,
  web) show identical numbers from the same data.
- **Count errors from status, not category.** Error counts come from
  `activity.status === "error"`, not from display categories like
  `bash_error`. This ensures session-level, turn-level, and
  summary-level error counts always agree.

### Data handling

- **Truncate at the source.** New text fields on events or activities
  must have a truncation limit in SessionCoreConfig. Full content is
  available via resultRecordUuid — never carry large strings through
  the pipeline.
- **No user data leaves the machine.** The extension reads local JSONL
  files and displays them locally. No telemetry, no external network
  calls, no analytics. The webview CSP enforces this at the browser
  level.
- **Session data may contain secrets.** Bash commands, file paths,
  and user prompts can include API keys, credentials, and private
  paths. Never log session content to external services. Console
  logging for debugging is acceptable but should not include event
  payloads.

### Privacy and security

- **No PII collection or persistence.** The extension processes user
  prompts, file paths, and bash output that may contain names, emails,
  API keys, internal URLs, and other personal data. This data exists
  only in the in-memory session state. Never persist it beyond the
  session lifetime. Never include it in error reports, diagnostics,
  or log messages sent externally.
- **No telemetry, no analytics, no external calls.** The extension is
  purely local. This is a hard rule, not a default that can be
  toggled with a setting.
- **Treat parsed data as untrusted input.** File paths, commands, and
  text in JSONL records come from log files, not from verified
  sources. Validate before using for file operations. The `openFile`
  workspace restriction is an example of this pattern — apply it to
  any new feature that acts on parsed data.
- **Validate webview messages.** Messages from the webview are
  untrusted. Always validate shape and types before acting. Never
  construct shell commands or file paths from webview messages
  without sanitization.
- **Minimize dependencies.** core and view have zero runtime
  dependencies. Every new npm dependency is attack surface and supply
  chain risk. Prefer Node.js builtins over npm packages. If a
  dependency is needed, evaluate its maintenance status, download
  count, and transitive dependency tree.
- **Request minimum permissions.** The extension needs only file read
  access and webview hosting. Do not request workspace trust, terminal
  access, authentication scopes, or network permissions unless a
  feature explicitly requires it — and document why.

### Defensive coding

- **Assume malformed input.** JSONL files may contain corrupted
  lines, unexpected record types, missing fields, or records from
  future CLI versions. The parser must never throw — emit
  parse_error events and continue.
- **Assume stale data.** Files referenced in activities may have been
  deleted. Sessions may end abruptly. Turn durations may never
  arrive. Code must handle missing or incomplete data gracefully.
- **Clean up resources.** Every watcher, interval, stream, and event
  listener must have a corresponding cleanup path. The stop/dispose
  pattern is mandatory — no leaked handles.

---

## Conventions

- npm scope is `@kno-lens/` (product scope, not org scope)
- VS Code identifiers use `knoLens` (camelCase)
- Display name is `KnoLens` (PascalCase)
- Publisher is `kno-ai` (the organization)
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). release-please uses
  these to determine version bumps and generate changelogs.
- Tests use vitest. Run `npm test --workspaces` from repo root.
- Build before testing — downstream packages depend on upstream build
  output
