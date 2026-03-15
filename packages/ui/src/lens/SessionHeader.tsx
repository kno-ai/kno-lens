import type { SessionSnapshot } from "@kno-lens/view";
import { SessionMeta } from "../shared/SessionMeta.js";

interface SessionHeaderProps {
  session: SessionSnapshot["session"];
  isLive?: boolean;
}

export function SessionHeader({ session, isLive }: SessionHeaderProps) {
  const { meta } = session;
  const name = meta.slug ?? (meta.id.length > 12 ? meta.id.slice(0, 8) + "…" : meta.id);

  return (
    <div class="session-header">
      <div class="session-header__title-row">
        <h2 class="session-header__name" title={meta.slug ?? meta.id}>
          {name}
        </h2>
        <span
          class={`session-header__status${isLive ? " session-header__status--live" : ""}`}
          title={isLive ? "Session active" : "Session idle"}
        >
          ⊙
        </span>
      </div>
      <SessionMeta session={session} class="session-header__meta" />
    </div>
  );
}
