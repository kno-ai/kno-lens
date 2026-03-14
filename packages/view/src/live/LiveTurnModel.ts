import type { SessionEvent } from "@kno-lens/core";
import { activityLabel } from "./labels.js";
import type { LiveTurnState } from "./types.js";

const LAST_TEXT_MAX_CHARS = 200;

function emptyState(): LiveTurnState {
  return {
    turnId: null,
    prompt: "",
    startedAt: "",
    runningActivities: [],
    completedCount: 0,
    errorCount: 0,
    lastCompleted: null,
    lastText: null,
  };
}

export class LiveTurnModel {
  private state: LiveTurnState = emptyState();

  update(event: SessionEvent): void {
    switch (event.type) {
      case "turn_start":
        this.state = {
          turnId: event.turnId,
          prompt: event.prompt,
          startedAt: event.at,
          runningActivities: [],
          completedCount: 0,
          errorCount: 0,
          lastCompleted: null,
          lastText: null,
        };
        break;

      case "text_output": {
        if (this.state.turnId == null) break;
        // Keep the trailing portion — most recent text is most relevant
        const text = event.text;
        this.state.lastText =
          text.length > LAST_TEXT_MAX_CHARS ? text.slice(-LAST_TEXT_MAX_CHARS) : text;
        break;
      }

      case "activity_start": {
        if (this.state.turnId == null) break;
        this.state.runningActivities.push({
          id: event.activity.id,
          label: activityLabel(event.activity),
          kind: event.activity.kind,
          startedAt: event.activity.startedAt,
        });
        break;
      }

      case "activity_end": {
        if (this.state.turnId == null) break;
        const idx = this.state.runningActivities.findIndex((a) => a.id === event.activityId);
        if (idx >= 0) {
          this.state.lastCompleted = this.state.runningActivities[idx]!;
          this.state.runningActivities.splice(idx, 1);
        }
        this.state.completedCount++;
        if (event.activity.status === "error") {
          this.state.errorCount++;
        }
        break;
      }

      case "turn_end":
        this.state = emptyState();
        break;
    }
  }

  get current(): Readonly<LiveTurnState> {
    return this.state;
  }
}
