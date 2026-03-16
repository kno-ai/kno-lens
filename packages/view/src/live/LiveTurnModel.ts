import type { SessionEvent, ActivityKind, Activity } from "@kno-lens/core";
import { BASH_DELETE_PATTERN } from "@kno-lens/core";
import { activityLabel } from "./labels.js";
import type { LiveTurnState, LiveActivityCounts, CompletedLiveActivity } from "./types.js";

const LAST_TEXT_MAX_CHARS = 200;
const MAX_COMPLETED_ACTIVITIES = 100;

function emptyCounts(): LiveActivityCounts {
  return { edits: 0, deletes: 0, commands: 0, reads: 0, searches: 0, other: 0 };
}

function emptyState(): LiveTurnState {
  return {
    turnId: null,
    prompt: "",
    startedAt: "",
    runningActivities: [],
    completedCount: 0,
    errorCount: 0,
    activityCounts: emptyCounts(),
    completedActivities: [],
    lastCompleted: null,
    lastText: null,
    isThinking: false,
  };
}

/** Classify an activity kind into one of the display categories. */
function classifyKind(kind: ActivityKind): keyof LiveActivityCounts {
  switch (kind) {
    case "file_edit":
    case "file_write":
      return "edits";
    case "bash":
      return "commands";
    case "file_read":
      return "reads";
    case "search":
      return "searches";
    default:
      return "other";
  }
}

/** Extract file path from an activity if it has one. */
function activityFilePath(activity: Activity): string | undefined {
  if ("path" in activity) return (activity as { path: string }).path;
  return undefined;
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
          activityCounts: emptyCounts(),
          completedActivities: [],
          lastCompleted: null,
          lastText: null,
          isThinking: false,
        };
        break;

      case "thinking":
        if (this.state.turnId == null) break;
        this.state.isThinking = true;
        break;

      case "text_output": {
        if (this.state.turnId == null) break;
        this.state.isThinking = false;
        const text = event.text;
        this.state.lastText =
          text.length > LAST_TEXT_MAX_CHARS ? text.slice(-LAST_TEXT_MAX_CHARS) : text;
        break;
      }

      case "activity_start": {
        if (this.state.turnId == null) break;
        this.state.isThinking = false;
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
        this.state.activityCounts[classifyKind(event.activity.kind)]++;
        // Track deletes: bash commands matching the delete pattern
        if (
          event.activity.kind === "bash" &&
          "command" in event.activity &&
          BASH_DELETE_PATTERN.test(event.activity.command as string)
        ) {
          this.state.activityCounts.deletes++;
        }
        if (event.activity.status === "error") {
          this.state.errorCount++;
        }

        // Store completed activity for live detail display
        if (this.state.completedActivities.length < MAX_COMPLETED_ACTIVITIES) {
          const completed: CompletedLiveActivity = {
            id: event.activity.id,
            label: activityLabel(event.activity),
            kind: event.activity.kind,
            status: event.activity.status === "error" ? "error" : "done",
            filePath: activityFilePath(event.activity),
          };
          this.state.completedActivities.push(completed);
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
