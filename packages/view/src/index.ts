// Controller
export { SessionController } from "./controller/SessionController.js";
export type { SessionSnapshot } from "./controller/snapshot.js";
export { SUMMARY_ALGORITHM_VERSION } from "./controller/snapshot.js";

// Live
export { LiveTurnModel } from "./live/LiveTurnModel.js";
export { activityLabel } from "./live/labels.js";
export type {
  LiveTurnState,
  LiveActivity,
  LiveActivityCounts,
  CompletedLiveActivity,
} from "./live/types.js";

// Summary
export { summarizeTurn } from "./summary/summarize.js";
export { DEFAULT_SUMMARY_CONFIG } from "./summary/config.js";
export type { SummaryConfig, ImportanceLevel } from "./summary/config.js";
export type {
  TurnSummary,
  SummaryItem,
  ItemDetailLine,
  TurnSummaryStats,
} from "./summary/types.js";

// Category registry
export {
  getCategoryDef,
  knownCategories,
  knownFilterGroups,
  categoriesForGroup,
} from "./summary/registry.js";
export type { CategoryDef } from "./summary/registry.js";
