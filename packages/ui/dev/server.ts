import { createServer } from "vite";
import preact from "@preact/preset-vite";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "@kno-lens/io";
import type { SessionInfo } from "@kno-lens/io";
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

  // ─── Session management ──────────────────────────────────────────

  const clients = new Set<WebSocket>();
  let manager: SessionManager | null = null;
  let currentSessionId: string | null = null;

  function broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  function sessionList() {
    return all.map((s) => ({
      sessionId: s.sessionId,
      isActive: active.includes(s),
      modifiedAt: s.modifiedAt.toISOString(),
      sizeBytes: s.sizeBytes,
    }));
  }

  async function connectToSession(session: SessionInfo) {
    if (manager) {
      manager.stop();
      manager = null;
    }

    const isActive = active.includes(session);
    currentSessionId = session.sessionId;
    console.log(`  [session] ${isActive ? "Tailing" : "Loading"}: ${session.sessionId}`);

    manager = new SessionManager(session, { throttleMs: 100 });

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

    broadcast({
      type: "session-info",
      data: { sessionId: session.sessionId, isActive },
    });

    const state = manager.state;
    if (state.snapshot) {
      broadcast({ type: "snapshot", data: state.snapshot });
    }
    broadcast({ type: "live", data: state.live });
  }

  // ─── WebSocket server ──────────────────────────────────────────────

  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", (ws) => {
    clients.add(ws);

    // Send session list + current state
    ws.send(JSON.stringify({ type: "sessions", data: sessionList() }));
    ws.send(
      JSON.stringify({
        type: "session-info",
        data: {
          sessionId: currentSessionId,
          isActive: active.some((s) => s.sessionId === currentSessionId),
        },
      }),
    );

    if (manager) {
      const state = manager.state;
      if (state.snapshot) {
        ws.send(JSON.stringify({ type: "snapshot", data: state.snapshot }));
      }
      ws.send(JSON.stringify({ type: "live", data: state.live }));
    }

    // Handle client messages
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "select-session" && typeof msg.sessionId === "string") {
          const target = all.find((s) => s.sessionId === msg.sessionId);
          if (target) {
            connectToSession(target).catch((err) => {
              console.error(`  [session] Failed to switch: ${err.message}`);
            });
          }
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  // Connect to the best session initially
  const initialSession = active[0] ?? all[0]!;
  await connectToSession(initialSession);
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

  console.log(`  Dev harness:   http://localhost:${resolvedPort}/`);
  console.log(`  WebSocket:     ws://localhost:${WS_PORT}\n`);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n  Shutting down...");
    manager?.stop();
    wss.close();
    vite.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
