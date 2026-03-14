import "../src/styles/theme-stub.css";
import "../src/styles/main.css";
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "../src/app.js";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";

function LiveHarness() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState<LiveTurnState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string>("");

  useEffect(() => {
    const wsUrl = `ws://localhost:${__WS_PORT__}`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let intentionalClose = false;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

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
              setSessionInfo(msg.data);
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Don't reconnect if we closed intentionally (cleanup / HMR)
        if (!intentionalClose) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
      };
    }

    connect();

    return () => {
      intentionalClose = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return (
    <div>
      <div class="harness-controls">
        <span class={`live-dot ${connected ? "live-dot--connected" : "live-dot--disconnected"}`} />
        <span>{connected ? "Connected" : "Disconnected"}</span>
        {sessionInfo && <span class="session-label">{sessionInfo}</span>}
        {error && <span class="error-label">{error}</span>}
      </div>
      <div class="harness-panel" style={{ width: "350px", height: "calc(100vh - 45px)" }}>
        <App
          snapshot={snapshot}
          live={live}
          config={DEFAULT_SUMMARY_CONFIG}
          onDrillDown={(id) => console.log("drill-down:", id)}
          onOpenFile={(path) => console.log("open-file:", path)}
        />
      </div>
    </div>
  );
}

// Type declaration for the injected constant
declare const __WS_PORT__: number;

render(<LiveHarness />, document.getElementById("root")!);
