import "../src/styles/theme-stub.css";
import "../src/styles/main.css";
import { render } from "preact";
import { useState } from "preact/hooks";
import { App } from "../src/app.js";
import { DEFAULT_SUMMARY_CONFIG } from "@kno-lens/view";
import type { SessionSnapshot, LiveTurnState } from "@kno-lens/view";
import basicFixture from "./fixtures/basic-session.json";
import liveFixture from "./fixtures/live-session.json";
import edgeFixture from "./fixtures/edge-cases.json";

interface FixtureSet {
  snapshot: SessionSnapshot;
  live: LiveTurnState | null;
}

const fixtures: Record<string, FixtureSet> = {
  "Basic session": {
    snapshot: basicFixture as unknown as SessionSnapshot,
    live: null,
  },
  "Live session": {
    snapshot: liveFixture.snapshot as unknown as SessionSnapshot,
    live: liveFixture.live as unknown as LiveTurnState,
  },
  "Edge cases": {
    snapshot: edgeFixture as unknown as SessionSnapshot,
    live: null,
  },
};

const WIDTHS = ["280px", "350px", "500px"] as const;

function Harness() {
  const [selected, setSelected] = useState("Basic session");
  const [theme, setTheme] = useState("dark");
  const [width, setWidth] = useState<string>("280px");

  const fixture = fixtures[selected]!;
  document.documentElement.dataset.theme = theme;

  return (
    <div>
      <div class="harness-controls">
        <label>Fixture</label>
        <select value={selected} onChange={(e) => setSelected(e.currentTarget.value)}>
          {Object.keys(fixtures).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label>Theme</label>
        <select value={theme} onChange={(e) => setTheme(e.currentTarget.value)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="high-contrast">High Contrast</option>
        </select>
        <label>Width</label>
        <select value={width} onChange={(e) => setWidth(e.currentTarget.value)}>
          {WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
      <div class="harness-panel" style={{ width, height: "calc(100vh - 45px)" }}>
        <App
          snapshot={fixture.snapshot}
          live={fixture.live}
          config={DEFAULT_SUMMARY_CONFIG}
          onDrillDown={(id) => console.log("drill-down:", id)}
          onOpenFile={(path) => console.log("open-file:", path)}
        />
      </div>
    </div>
  );
}

render(<Harness />, document.getElementById("root")!);
