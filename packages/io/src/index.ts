// Discovery
export { discoverSessions, filterActiveSessions, claudeProjectDir } from "./discovery.js";
export type { SessionInfo } from "./discovery.js";

// Tailer
export { SessionTailer } from "./tailer.js";
export type { TailerEvents } from "./tailer.js";

// Record lookup
export { lookupRecordByUuid } from "./record-lookup.js";

// Manager
export { SessionManager } from "./manager.js";
export type {
  SessionManagerEvents,
  SessionManagerState,
  SessionManagerOptions,
} from "./manager.js";
