#!/usr/bin/env tsx
/**
 * Debug script: parse a Claude Code JSONL file and print structured output.
 *
 * Usage:
 *   npm run debug-parse -- <path-to-jsonl>
 *   npx tsx scripts/debug-parse.ts <path-to-jsonl>
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClaudeCodeParserV1 } from "../src/parsing/claude-code/ClaudeCodeParserV1.js";
import type { SessionEvent, TurnTokenUsage } from "../src/parsing/events.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: debug-parse <path-to-jsonl>");
  process.exit(1);
}

const absPath = resolve(filePath);
const content = readFileSync(absPath, "utf-8");
const lines = content.split("\n").filter((l) => l.trim() !== "");

console.log(`Parsing: ${absPath}`);
console.log(`Lines: ${lines.length}\n`);

const parser = new ClaudeCodeParserV1();
const allEvents: SessionEvent[] = [];

for (const line of lines) {
  allEvents.push(...parser.parse(line));
}
allEvents.push(...parser.end());

// ─── Summary ─────────────────────────────────────────────────────────────

const eventCounts = new Map<string, number>();
for (const e of allEvents) {
  eventCounts.set(e.type, (eventCounts.get(e.type) ?? 0) + 1);
}

console.log("── Event summary ──");
for (const [type, count] of [...eventCounts.entries()].sort()) {
  console.log(`  ${type}: ${count}`);
}

// ─── Session info ────────────────────────────────────────────────────────

const sessionStart = allEvents.find((e) => e.type === "session_start");
if (sessionStart?.type === "session_start") {
  console.log("\n── Session ──");
  console.log(`  ID:             ${sessionStart.meta.id}`);
  console.log(
    `  Project:        ${sessionStart.meta.projectName} (${sessionStart.meta.projectPath})`,
  );
  console.log(`  Slug:           ${sessionStart.meta.slug ?? "(none)"}`);
  console.log(`  Branch:         ${sessionStart.meta.gitBranch ?? "(none)"}`);
  console.log(`  CLI:            ${sessionStart.meta.cliVersion ?? "(unknown)"}`);
  console.log(`  Started:        ${sessionStart.meta.startedAt}`);
  console.log(`  Continuation:   ${sessionStart.meta.isContinuation ? "yes" : "no"}`);
}

// ─── Compaction boundaries ───────────────────────────────────────────────

const compactions = allEvents.filter((e) => e.type === "compaction");
if (compactions.length > 0) {
  console.log(`\n── Compaction boundaries (${compactions.length}) ──`);
  for (const c of compactions) {
    if (c.type === "compaction") {
      console.log(`  at ${c.at}`);
    }
  }
}

// ─── Turns ───────────────────────────────────────────────────────────────

const turnStarts = allEvents.filter((e) => e.type === "turn_start");
const turnEnds = allEvents.filter((e) => e.type === "turn_end");

console.log(`\n── Turns (${turnStarts.length}) ──`);

for (const ts of turnStarts) {
  if (ts.type !== "turn_start") continue;

  const te = turnEnds.find((e) => e.type === "turn_end" && e.turnId === ts.turnId);
  const prompt = ts.prompt.length > 80 ? ts.prompt.slice(0, 80) + "…" : ts.prompt;
  console.log(`\n  Turn ${ts.turnId}: "${prompt}"`);
  console.log(`    Started: ${ts.at}`);
  if (ts.hasAttachments) {
    console.log(`    Attachments: yes`);
  }

  // Steps for this turn
  const thinkingEvents = allEvents.filter((e) => e.type === "thinking" && e.turnId === ts.turnId);
  const activities = allEvents.filter((e) => e.type === "activity_start" && e.turnId === ts.turnId);
  const actEnds = allEvents.filter((e) => e.type === "activity_end" && e.turnId === ts.turnId);
  const textOutputs = allEvents.filter((e) => e.type === "text_output" && e.turnId === ts.turnId);

  if (thinkingEvents.length > 0) {
    console.log(`    Thinking blocks: ${thinkingEvents.length}`);
    for (const t of thinkingEvents) {
      if (t.type === "thinking" && t.excerpt) {
        const excerpt = t.excerpt.length > 60 ? t.excerpt.slice(0, 60) + "…" : t.excerpt;
        console.log(`      "${excerpt}"`);
      }
    }
  }

  if (activities.length > 0) {
    console.log(`    Activities (${activities.length}):`);
    for (const a of activities) {
      if (a.type !== "activity_start") continue;
      const end = actEnds.find((e) => e.type === "activity_end" && e.activityId === a.activity.id);
      const status = end?.type === "activity_end" ? end.activity.status : "running";
      const label = describeActivity(a.activity);
      console.log(`      [${status}] ${label}`);
    }
  }

  if (textOutputs.length > 0) {
    console.log(`    Text outputs: ${textOutputs.length}`);
    for (const t of textOutputs) {
      if (t.type === "text_output") {
        const text = t.text.length > 80 ? t.text.slice(0, 80) + "…" : t.text;
        console.log(`      "${text}"`);
      }
    }
  }

  if (te?.type === "turn_end") {
    console.log(`    Tokens: ${formatTokens(te.tokens)}`);
    console.log(`    Models: ${te.tokens.models.join(", ") || "(none)"}`);
    if (te.durationMs != null) {
      console.log(`    Duration: ${(te.durationMs / 1000).toFixed(1)}s`);
    }
    if (te.tokens.estimatedCostUsd != null) {
      console.log(`    Cost: $${te.tokens.estimatedCostUsd.toFixed(4)}`);
    }
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────

const parseErrors = allEvents.filter((e) => e.type === "parse_error");
if (parseErrors.length > 0) {
  console.log(`\n── Parse errors (${parseErrors.length}) ──`);
  for (const e of parseErrors) {
    if (e.type === "parse_error") {
      console.log(`  ${e.message}${e.rawLine ? `: ${e.rawLine.slice(0, 100)}` : ""}`);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeActivity(act: any): string {
  switch (act.kind) {
    case "file_read":
      return `Read ${act.path}`;
    case "file_write":
      return `Write ${act.path}${act.isNew ? " (new)" : ""}`;
    case "file_edit":
      return `Edit ${act.path}`;
    case "bash":
      return `Bash: ${act.command.slice(0, 60)}`;
    case "search":
      return `${act.tool === "grep" ? "Grep" : "Glob"}: ${act.pattern}`;
    case "fetch":
      return `Fetch: ${act.url}`;
    case "mcp_call":
      return `MCP: ${act.server}/${act.toolName}`;
    case "agent":
      return `Agent: ${act.description ?? "(unnamed)"}${act.agentSessionId ? ` [${act.agentSessionId}]` : ""}`;
    case "task":
      return `Task: ${act.operation}${act.subject ? ` — ${act.subject}` : ""}`;
    case "ask_user":
      return `AskUser: ${act.question ?? "(no question)"}`;
    case "unknown":
      return `Unknown: ${act.rawToolName}`;
    default:
      return act.kind;
  }
}

function formatTokens(t: TurnTokenUsage): string {
  const parts = [`in:${t.inputTokens}`, `out:${t.outputTokens}`];
  if (t.cacheReadTokens > 0) parts.push(`cache_read:${t.cacheReadTokens}`);
  if (t.cacheCreationTokens > 0) parts.push(`cache_create:${t.cacheCreationTokens}`);
  return parts.join(" | ");
}
