// Discovery
export { discoverSessions, filterActiveSessions, claudeProjectDir } from "./discovery.js";
export type { SessionInfo } from "./discovery.js";

// Tailer
export { SessionTailer } from "./tailer.js";
export type { TailerEvents } from "./tailer.js";

// Manager
export { SessionManager } from "./manager.js";
export type {
  SessionManagerEvents,
  SessionManagerState,
  SessionManagerOptions,
} from "./manager.js";
