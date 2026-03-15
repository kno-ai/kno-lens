import type { SessionSnapshot } from "@kno-lens/view";
import type { ExplorerMode } from "./ExplorerApp.js";
import { SessionMeta } from "../shared/SessionMeta.js";

interface ExplorerHeaderProps {
  session: SessionSnapshot["session"];
  mode: ExplorerMode;
  onModeChange: (mode: ExplorerMode) => void;
  onFindActive?: (() => void) | undefined;
}

export function ExplorerHeader({ session, mode, onModeChange, onFindActive }: ExplorerHeaderProps) {
  const { meta } = session;
  const name = meta.slug ?? (meta.id.length > 12 ? meta.id.slice(0, 8) + "\u2026" : meta.id);

  return (
    <div class="explorer-header">
      <div class="explorer-header__title-row">
        <h2 class="explorer-header__name" title={meta.slug ?? meta.id}>
          {name}
        </h2>
        <button
          class={`explorer-header__find-active${onFindActive ? " explorer-header__find-active--live" : ""}`}
          onClick={onFindActive ?? undefined}
          title={onFindActive ? "Go to active turn" : "No active turn"}
        >
          ⊙
        </button>
        <div class="explorer-header__actions">
          <button
            class={`explorer-header__mode-btn${mode === "timeline" ? " explorer-header__mode-btn--active" : ""}`}
            onClick={() => onModeChange("timeline")}
          >
            Timeline
          </button>
          <button
            class={`explorer-header__mode-btn${mode === "heatmap" ? " explorer-header__mode-btn--active" : ""}`}
            onClick={() => onModeChange("heatmap")}
          >
            Heatmap
          </button>
        </div>
      </div>
      <SessionMeta session={session} class="explorer-header__meta" />
    </div>
  );
}
