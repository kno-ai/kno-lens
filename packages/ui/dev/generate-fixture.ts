/**
 * Generates the dev fixture (dev/fixtures/session.json) by running
 * real JSONL through the full core→view pipeline. This ensures all
 * fields (including TurnDisplayCounts) are correctly computed.
 *
 * Usage: npx tsx dev/generate-fixture.ts [path-to-session.jsonl]
 *
 * If no path is given, generates synthetic data for screenshots.
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createParser } from "@kno-lens/core";
import { SessionController } from "@kno-lens/view";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "fixtures", "session.json");
const jsonlPath = join(__dirname, "fixtures", "session.jsonl");

// ─── Synthetic fixture data ───────────────────────────────────────

function generateSyntheticFixture() {
  const parser = createParser("claude-code");
  const controller = new SessionController();

  let turnCounter = 0;
  let toolCounter = 0;
  const now = new Date("2025-06-15T09:30:00Z");

  function ts(offsetMinutes: number) {
    return new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
  }

  function user(prompt: string, minuteOffset: number) {
    turnCounter++;
    return JSON.stringify({
      type: "user",
      parentUuid: null,
      isSidechain: false,
      userType: "external",
      cwd: "/Users/dev/code/acme-api",
      sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      version: "2.1.74",
      gitBranch: "feat/payment-webhooks",
      message: { role: "user", content: prompt },
      uuid: `user-${String(turnCounter).padStart(3, "0")}`,
      timestamp: ts(minuteOffset),
    });
  }

  function assistantTool(
    toolName: string,
    input: Record<string, unknown>,
    opts: {
      minuteOffset: number;
      messageId?: string;
      requestId?: string;
      tokens?: { input: number; output: number };
    },
  ) {
    toolCounter++;
    const id = `toolu_${String(toolCounter).padStart(3, "0")}`;
    return {
      id,
      json: JSON.stringify({
        type: "assistant",
        parentUuid: `user-${String(turnCounter).padStart(3, "0")}`,
        isSidechain: false,
        message: {
          model: "claude-sonnet-4-6",
          id: opts.messageId ?? `msg-tool-${toolCounter}`,
          type: "message",
          role: "assistant",
          content: [{ type: "tool_use", id, name: toolName, input }],
          stop_reason: "tool_use",
          usage: {
            input_tokens: opts.tokens?.input ?? 200,
            output_tokens: opts.tokens?.output ?? 80,
            cache_read_input_tokens: 1000,
            cache_creation_input_tokens: 0,
          },
        },
        requestId: opts.requestId ?? `req-tool-${toolCounter}`,
        uuid: `asst-tool-${toolCounter}`,
        timestamp: ts(opts.minuteOffset),
      }),
    };
  }

  function toolResult(
    toolUseId: string,
    content: string,
    opts: { is_error?: boolean; toolUseResult?: unknown } = {},
  ) {
    return JSON.stringify({
      type: "user",
      parentUuid: null,
      isSidechain: false,
      userType: "tool_result",
      cwd: "/Users/dev/code/acme-api",
      sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      version: "2.1.74",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content,
            is_error: opts.is_error ?? false,
          },
        ],
      },
      uuid: `result-${toolUseId}`,
      timestamp: new Date().toISOString(),
      toolUseResult: opts.toolUseResult,
    });
  }

  function assistantEnd(text: string, minuteOffset: number, opts: { costUSD?: number } = {}) {
    const msgId = `msg-end-${turnCounter}`;
    const reqId = `req-end-${turnCounter}`;
    return JSON.stringify({
      type: "assistant",
      parentUuid: `user-${String(turnCounter).padStart(3, "0")}`,
      isSidechain: false,
      message: {
        model: "claude-sonnet-4-6",
        id: msgId,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 5000,
          output_tokens: 2000,
          cache_read_input_tokens: 8000,
          cache_creation_input_tokens: 0,
        },
      },
      costUSD: opts.costUSD ?? 0.02,
      requestId: reqId,
      uuid: `asst-end-${turnCounter}`,
      timestamp: ts(minuteOffset),
    });
  }

  function turnDuration(ms: number) {
    return JSON.stringify({
      type: "system",
      subtype: "turn_duration",
      durationMs: ms,
      sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      timestamp: new Date().toISOString(),
      uuid: `dur-${turnCounter}`,
    });
  }

  const jsonlLines: string[] = [];

  function feed(line: string) {
    jsonlLines.push(line);
    for (const e of parser.parse(line)) controller.onEvent(e);
  }

  // ── Turn 1: Set up webhook handler ──────────────────────────────
  feed(
    user(
      "Set up the webhook handler for Stripe payment events. We need to handle payment_intent.succeeded, payment_intent.failed, and charge.refunded.",
      0,
    ),
  );

  // Read existing code
  let t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/events/bus.ts" },
    { minuteOffset: 0.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "export class EventBus { ... }"));

  t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/config/stripe.ts" },
    { minuteOffset: 0.7 },
  );
  feed(t.json);
  feed(toolResult(t.id, "export const stripeConfig = { ... }"));

  t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/routes/index.ts" },
    { minuteOffset: 0.9 },
  );
  feed(t.json);
  feed(toolResult(t.id, "export const router = ..."));

  // Create webhook handler
  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      content: "import Stripe from 'stripe';\n...",
    },
    { minuteOffset: 1.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  // Create webhook types
  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/src/types/webhooks.ts",
      content: "export interface WebhookEvent ...",
    },
    { minuteOffset: 2.0 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  // Edit route config
  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/index.ts",
      old_string: "export const router",
      new_string: "import { webhookRouter } from './webhooks/handler';\nexport const router",
    },
    { minuteOffset: 2.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  // Run tests
  t = assistantTool("Bash", { command: "npm test -- --run webhooks" }, { minuteOffset: 3.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 4/4", {
      toolUseResult: { stdout: "PASS\n4 tests passed", exitCode: 0 },
    }),
  );

  feed(assistantEnd("I've created the webhook handler with support for all three event types.", 4));
  feed(turnDuration(240_000));

  // ── Turn 2: Add webhook validation ──────────────────────────────
  feed(user("Add signature validation to prevent forged webhook calls.", 5));

  t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts" },
    { minuteOffset: 5.3 },
  );
  feed(t.json);
  feed(toolResult(t.id, "import Stripe from 'stripe';\n..."));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "export async function handleWebhook",
      new_string:
        "function verifySignature(payload: string, sig: string): boolean { ... }\n\nexport async function handleWebhook",
    },
    { minuteOffset: 6.0 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  // Write a test
  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/test/webhooks/validation.test.ts",
      content: "describe('webhook validation'...",
    },
    { minuteOffset: 6.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  // Run test — fails first time
  t = assistantTool("Bash", { command: "npm test -- --run validation" }, { minuteOffset: 7.0 });
  feed(t.json);
  feed(toolResult(t.id, "Exit code 1\nFAILED: signature mismatch in test", { is_error: true }));

  // Fix and re-run
  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "const sig = req.headers['stripe-signature']",
      new_string: "const sig = req.headers['stripe-signature'] as string",
    },
    { minuteOffset: 7.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test -- --run validation" }, { minuteOffset: 8.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 6/6", {
      toolUseResult: { stdout: "PASS\n6 tests passed", exitCode: 0 },
    }),
  );

  feed(
    assistantEnd(
      "Signature validation is in place. The initial test failure was due to a TypeScript type narrowing issue — fixed and all tests pass now.",
      9,
    ),
  );
  feed(turnDuration(240_000));

  // ── Turn 3: Add retry logic ─────────────────────────────────────
  feed(user("Add exponential backoff retry for webhook delivery failures.", 10));

  t = assistantTool("Grep", { pattern: "retry", include: "src/**/*.ts" }, { minuteOffset: 10.3 });
  feed(t.json);
  feed(toolResult(t.id, "No matches found"));

  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/src/utils/retry.ts",
      content: "export async function withRetry<T>...",
    },
    { minuteOffset: 11.0 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "await processEvent(event)",
      new_string:
        "await withRetry(() => processEvent(event), { maxAttempts: 3, baseDelayMs: 1000 })",
    },
    { minuteOffset: 11.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test" }, { minuteOffset: 12.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 12/12", {
      toolUseResult: { stdout: "PASS\n12 tests passed", exitCode: 0 },
    }),
  );

  feed(assistantEnd("Retry logic added with exponential backoff. All 12 tests pass.", 13));
  feed(turnDuration(180_000));

  // ── Turn 4: Clean up old code ───────────────────────────────────
  feed(user("Remove the deprecated webhook_legacy.ts and its tests.", 14));

  t = assistantTool("Bash", { command: "rm src/routes/webhook_legacy.ts" }, { minuteOffset: 14.3 });
  feed(t.json);
  feed(toolResult(t.id, ""));

  t = assistantTool("Bash", { command: "rm test/webhooks/legacy.test.ts" }, { minuteOffset: 14.5 });
  feed(t.json);
  feed(toolResult(t.id, ""));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/index.ts",
      old_string: "import { legacyWebhook } from './webhook_legacy';",
      new_string: "",
    },
    { minuteOffset: 14.8 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test" }, { minuteOffset: 15.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 12/12", {
      toolUseResult: { stdout: "PASS\n12 tests passed", exitCode: 0 },
    }),
  );

  feed(assistantEnd("Removed legacy webhook handler and updated imports.", 16));
  feed(turnDuration(120_000));

  // ── Turn 5: Add logging ─────────────────────────────────────────
  feed(user("Add structured logging for all webhook events using pino.", 17));

  t = assistantTool("Bash", { command: "npm install pino" }, { minuteOffset: 17.3 });
  feed(t.json);
  feed(
    toolResult(t.id, "added 1 package", {
      toolUseResult: { stdout: "added 1 package", exitCode: 0 },
    }),
  );

  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/src/utils/logger.ts",
      content: "import pino from 'pino';\n...",
    },
    { minuteOffset: 18.0 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "export async function handleWebhook",
      new_string:
        "import { logger } from '../../utils/logger';\n\nexport async function handleWebhook",
    },
    { minuteOffset: 18.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test" }, { minuteOffset: 19.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 14/14", {
      toolUseResult: { stdout: "PASS\n14 tests passed", exitCode: 0 },
    }),
  );

  feed(
    assistantEnd(
      "Added structured logging with pino. All webhook events are now logged with context.",
      20,
    ),
  );
  feed(turnDuration(180_000));

  // ── Turn 6: Add rate limiting ───────────────────────────────────
  feed(user("Add rate limiting to the webhook endpoint — max 100 requests per minute per IP.", 21));

  t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/middleware/auth.ts" },
    { minuteOffset: 21.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "export function authMiddleware() { ... }"));

  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/src/middleware/rate-limiter.ts",
      content: "export function rateLimiter(opts)...",
    },
    { minuteOffset: 22.0 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "router.post('/webhook'",
      new_string: "router.post('/webhook', rateLimiter({ maxRequests: 100, windowMs: 60_000 })",
    },
    { minuteOffset: 22.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test" }, { minuteOffset: 23.0 });
  feed(t.json);
  feed(toolResult(t.id, "Exit code 1\nFAILED: rate limiter import not found", { is_error: true }));

  t = assistantTool(
    "Edit",
    {
      file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts",
      old_string: "import { logger }",
      new_string:
        "import { logger } from '../../utils/logger';\nimport { rateLimiter } from '../../middleware/rate-limiter';\n// remove duplicate:\n",
    },
    { minuteOffset: 23.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File edited successfully"));

  t = assistantTool("Bash", { command: "npm test" }, { minuteOffset: 24.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 16/16", {
      toolUseResult: { stdout: "PASS\n16 tests passed", exitCode: 0 },
    }),
  );

  feed(
    assistantEnd(
      "Rate limiting is configured for the webhook endpoint. Initial test failure was a missing import — fixed.",
      25,
    ),
  );
  feed(turnDuration(240_000));

  // ── Turn 7: Write migration ─────────────────────────────────────
  feed(user("Write a database migration for the webhook_events audit table.", 26));

  t = assistantTool(
    "Write",
    {
      file_path: "/Users/dev/code/acme-api/migrations/20250615_webhook_events.sql",
      content:
        "CREATE TABLE webhook_events (\n  id SERIAL PRIMARY KEY,\n  event_type VARCHAR(100),\n  payload JSONB,\n  processed_at TIMESTAMPTZ\n);",
    },
    { minuteOffset: 26.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "File created successfully", { toolUseResult: { type: "create" } }));

  t = assistantTool("Bash", { command: "npm run migrate" }, { minuteOffset: 27.0 });
  feed(t.json);
  feed(
    toolResult(t.id, "Migration applied: 20250615_webhook_events", {
      toolUseResult: { stdout: "Migration applied", exitCode: 0 },
    }),
  );

  feed(assistantEnd("Migration created and applied. The webhook_events table is ready.", 28));
  feed(turnDuration(120_000));

  // ── Turn 8: Final integration test ──────────────────────────────
  feed(user("Run the full test suite and make sure everything passes.", 29));

  t = assistantTool("Bash", { command: "npm test -- --coverage" }, { minuteOffset: 29.5 });
  feed(t.json);
  feed(
    toolResult(t.id, "Tests passed: 22/22\nCoverage: 89.2%\nAll suites passed.", {
      toolUseResult: { stdout: "PASS\n22 tests, 89.2% coverage", exitCode: 0 },
    }),
  );

  feed(assistantEnd("All 22 tests pass with 89.2% coverage. The webhook system is complete.", 31));
  feed(turnDuration(120_000));

  // ── Turn 9 (live — in progress) ─────────────────────────────────
  // This turn is NOT ended — it becomes the live turn
  feed(user("Add a health check endpoint for webhook monitoring.", 32));

  t = assistantTool(
    "Read",
    { file_path: "/Users/dev/code/acme-api/src/routes/webhooks/handler.ts" },
    { minuteOffset: 32.3 },
  );
  feed(t.json);
  feed(toolResult(t.id, "import Stripe from 'stripe';\n..."));

  t = assistantTool(
    "Grep",
    { pattern: "healthCheck", include: "src/**/*.ts" },
    { minuteOffset: 32.5 },
  );
  feed(t.json);
  feed(toolResult(t.id, "No matches found"));

  // Flush parser for completed events (don't call end() — turn 9 is still open)
  const snapshot = controller.exportState();
  const live = controller.liveState;

  const fixture = {
    snapshot,
    live,
  };

  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
  writeFileSync(jsonlPath, jsonlLines.join("\n") + "\n");

  console.log(`Wrote snapshot fixture to ${outPath}`);
  console.log(`Wrote JSONL fixture to ${jsonlPath}`);
  console.log(`  Turns: ${snapshot.session.turns.length}`);
  console.log(`  Summaries: ${Object.keys(snapshot.summaries).length}`);
  console.log(`  Live turn: ${live?.turnId ?? "none"}`);
  console.log(`  Stats: ${JSON.stringify(snapshot.session.stats)}`);
  console.log();
  console.log("To view in VS Code, copy the JSONL to your workspace's Claude projects dir:");
  console.log(`  cp ${jsonlPath} ~/.claude/projects/-$(pwd | tr '/' '-')/fixture-session.jsonl`);
  console.log("Then use KnoLens: Select Session to pick it.");
}

generateSyntheticFixture();
