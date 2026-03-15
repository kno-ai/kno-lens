import "../src/styles/theme-stub.css";
import "../src/styles/main.css";
import "../src/styles/explorer.css";
import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { LensApp } from "../src/lens/LensApp.js";
import { ExplorerApp } from "../src/explorer/ExplorerApp.js";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";

// Injected by dev/server.ts when running in live mode. Undefined in fixture mode.
declare const __WS_PORT__: number | undefined;

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

type View = "lens" | "explorer";
const WIDTHS = ["280px", "350px", "500px"] as const;

function viewFromHash(): View {
  const h = location.hash.replace("#", "");
  return h === "explorer" ? "explorer" : "lens";
}

// ─── Session info from server ────────────────────────────────────

interface DevSessionInfo {
  sessionId: string;
  isActive: boolean;
  modifiedAt: string;
  sizeBytes: number;
}

// ─── WebSocket hook (live mode) ──────────────────────────────────

function useLiveData() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState<LiveTurnState | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentSession, setCurrentSession] = useState<{
    sessionId: string;
    isActive: boolean;
  } | null>(null);
  const [sessions, setSessions] = useState<DevSessionInfo[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof __WS_PORT__ === "undefined") return;
    const wsUrl = `ws://localhost:${__WS_PORT__}`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let intentionalClose = false;

    function connect() {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          switch (msg.type) {
            case "snapshot":
              setSnapshot(msg.data);
              break;
            case "live":
              setLive(msg.data);
              break;
            case "session-info":
              setCurrentSession(msg.data);
              break;
            case "sessions":
              setSessions(msg.data);
              break;
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!intentionalClose) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        /* reconnect handles it */
      };
    }

    connect();
    return () => {
      intentionalClose = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const selectSession = (sessionId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "select-session", sessionId }));
  };

  return { snapshot, live, connected, currentSession, sessions, selectSession };
}

// ─── Fixture data (loaded lazily, only in fixture mode) ──────────

let fixtureSnapshot: SessionSnapshot | null = null;
let fixtureLive: LiveTurnState | null = null;

async function loadFixtures() {
  if (fixtureSnapshot) return;
  const mod = await import("./fixtures/session.json");
  fixtureSnapshot = mod.default.snapshot as unknown as SessionSnapshot;
  fixtureLive = mod.default.live as unknown as LiveTurnState;
}

// ─── Harness ─────────────────────────────────────────────────────

function Harness() {
  const isLiveMode = typeof __WS_PORT__ !== "undefined";
  const wsData = useLiveData();

  const [fixtureLoaded, setFixtureLoaded] = useState(false);
  const [view, setView] = useState<View>(viewFromHash);
  const [width, setWidth] = useState<string>("350px");

  useEffect(() => {
    if (!isLiveMode) {
      loadFixtures().then(() => setFixtureLoaded(true));
    }
  }, [isLiveMode]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchView = (v: View) => {
    location.hash = v;
    setView(v);
  };

  const snapshot = isLiveMode ? wsData.snapshot : fixtureSnapshot;
  const live = isLiveMode ? wsData.live : fixtureLive;

  if (!isLiveMode && !fixtureLoaded) return null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div class="harness-controls">
        {isLiveMode && (
          <>
            {!wsData.connected && (
              <span style={{ fontSize: "11px", color: "#888" }}>Disconnected</span>
            )}
            {wsData.connected && (
              <select
                style={{
                  background: "#2a2a2a",
                  color: "#ccc",
                  border: "1px solid #555",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontSize: "11px",
                  maxWidth: "240px",
                }}
                value={wsData.currentSession?.sessionId ?? ""}
                onChange={(e) => wsData.selectSession(e.currentTarget.value)}
              >
                {wsData.sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.sessionId.slice(0, 8)}…{" · " + formatAge(s.modifiedAt)}
                    {" · " + formatSize(s.sizeBytes)}
                    {s.isActive ? " · active" : ""}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {!isLiveMode && <span style={{ fontSize: "11px", color: "#888" }}>Fixtures</span>}

        {/* View toggle */}
        <span style={{ display: "flex", gap: 0, marginLeft: "8px" }}>
          <button
            onClick={() => switchView("lens")}
            style={{
              background: view === "lens" ? "#4dffc4" : "#2a2a2a",
              color: view === "lens" ? "#0a0e14" : "#888",
              border: "1px solid #555",
              borderRight: "none",
              borderRadius: "3px 0 0 3px",
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Lens
          </button>
          <button
            onClick={() => switchView("explorer")}
            style={{
              background: view === "explorer" ? "#4dffc4" : "#2a2a2a",
              color: view === "explorer" ? "#0a0e14" : "#888",
              border: "1px solid #555",
              borderRadius: "0 3px 3px 0",
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Explorer
          </button>
        </span>

        {/* Width control (lens only) */}
        {view === "lens" && (
          <>
            <label>Width</label>
            <select value={width} onChange={(e) => setWidth(e.currentTarget.value)}>
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* View */}
      {view === "lens" ? (
        <div class="harness-panel" style={{ width, height: "calc(100vh - 45px)" }}>
          <LensApp
            snapshot={snapshot}
            live={live}
            config={DEFAULT_SUMMARY_CONFIG}
            onDrillDown={(id) => console.log("drill-down:", id)}
            onOpenFile={(path) => console.log("open-file:", path)}
            onShowDiff={(id) => console.log("show-diff:", id)}
          />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ExplorerApp
            snapshot={snapshot}
            live={live}
            onOpenFile={(path) => console.log("open-file:", path)}
            onShowDiff={(id) => console.log("show-diff:", id)}
            onDrillDown={(id) => console.log("drill-down:", id)}
          />
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root")!;
// Clear previous render (handles Vite HMR re-execution)
root.innerHTML = "";
render(<Harness />, root);
