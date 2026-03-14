import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "@kno-lens/io";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WS_PORT = 5174;
const VITE_PORT = 5175;

// ─── Parse CLI args ─────────────────────────────────────────────────────

function gitRepoRoot(): string | undefined {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  let workspace: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workspace" || args[i] === "-w") {
      workspace = args[i + 1];
      i++;
    }
  }

  if (!workspace) {
    // Prefer the git repo root — Claude Code registers sessions there,
    // not in subdirectories like packages/ui where npm runs scripts.
    workspace = gitRepoRoot() ?? process.cwd();
  }

  return { workspace: resolve(workspace) };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const { workspace } = parseArgs();
  console.log(`\n  Workspace: ${workspace}`);

  // Discover sessions
  const { all, active } = await SessionManager.discover(workspace);

  if (all.length === 0) {
    console.error(`\n  No sessions found for workspace: ${workspace}`);
    console.error(`  Make sure you have a Claude Code session in this directory.\n`);
    process.exit(1);
  }

  console.log(`  Found ${all.length} session(s), ${active.length} active\n`);

  // Pick the session: prefer active, fall back to most recent
  const session = active.length > 0 ? active[0]! : all[0]!;
  const isActive = active.includes(session);

  console.log(
    `  ${isActive ? "Tailing active" : "Loading most recent"} session: ${session.sessionId}`,
  );
  console.log(`  File: ${session.path}\n`);

  // ─── WebSocket server ──────────────────────────────────────────────

  const wss = new WebSocketServer({ port: WS_PORT });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`  [ws] Client connected (${clients.size} total)`);

    // Send current state immediately
    const state = manager.state;
    if (state.snapshot) {
      ws.send(JSON.stringify({ type: "snapshot", data: state.snapshot }));
    }
    if (state.live) {
      ws.send(JSON.stringify({ type: "live", data: state.live }));
    }
    ws.send(
      JSON.stringify({
        type: "session-info",
        data: `${session.sessionId.slice(0, 8)}… ${isActive ? "(active)" : "(ended)"}`,
      }),
    );

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`  [ws] Client disconnected (${clients.size} total)`);
    });
  });

  function broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // ─── Session manager ──────────────────────────────────────────────

  const manager = new SessionManager(session, { throttleMs: 100 });

  manager.on("update", (state) => {
    if (state.snapshot) {
      broadcast({ type: "snapshot", data: state.snapshot });
    }
    broadcast({ type: "live", data: state.live });
  });

  manager.on("error", (err) => {
    console.error(`  [session] Error: ${err.message}`);
  });

  manager.on("session-end", () => {
    console.log("  [session] Session ended");
  });

  await manager.start();
  console.log("  [session] Initial read complete, watching for changes...\n");

  // ─── Vite dev server ──────────────────────────────────────────────

  const vite = await createServer({
    plugins: [preact()],
    root: resolve(__dirname),
    publicDir: false,
    server: {
      port: VITE_PORT,
      strictPort: false,
      fs: {
        allow: [resolve(__dirname, "..")],
      },
    },
    define: {
      __WS_PORT__: WS_PORT,
    },
  });

  await vite.listen();
  const resolvedPort = vite.config.server.port ?? VITE_PORT;

  console.log(`  ui live:       http://localhost:${resolvedPort}/live.html`);
  console.log(`  WebSocket:     ws://localhost:${WS_PORT}`);
  console.log(`  Fixture mode:  http://localhost:${resolvedPort}/\n`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n  Shutting down...");
    manager.stop();
    wss.close();
    vite.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    manager.stop();
    wss.close();
    vite.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
