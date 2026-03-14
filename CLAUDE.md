# CLAUDE.md

## Required reading

Before making any changes, read these documents:

1. **GUIDELINES.md** — product principles, implementation rules, privacy, security, conventions
2. **ARCHITECTURE.md** — package boundaries, responsibilities, prohibitions, contracts
3. **DECISIONS.md** — design decisions with rationale and tradeoffs
4. **DATA-MODEL.md** — data lifecycle, event ordering, invariants, growth boundaries
5. **GLOSSARY.md** — term definitions specific to this codebase
6. **DEVELOPMENT.md** — build, test, and run commands

GUIDELINES.md defines the principles and constraints. ARCHITECTURE.md
defines the structure. Both are governing documents — all implementation
must conform to both.

## Working in this codebase

- Read existing code before modifying it. Understand existing patterns
  before proposing changes.
- Run tests after making changes. Build upstream packages first if
  you've changed a library package.
- If a change would violate GUIDELINES.md or ARCHITECTURE.md, stop
  and discuss before implementing. Never silently break a rule.
- Keep changes minimal and focused. Don't refactor surrounding code,
  add speculative features, or improve things that weren't asked for.
