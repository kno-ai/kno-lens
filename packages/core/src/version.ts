/**
 * Schema version for the core model and event types.
 *
 * Bump MAJOR when: event types or model interfaces change in ways that
 * would break existing consumers (removed fields, changed semantics).
 *
 * Bump MINOR when: new event types, new optional fields, or new activity
 * kinds are added — existing consumers can safely ignore them.
 *
 * This version travels with serialized data via SessionMeta.schemaVersion,
 * so consumers can detect and handle version mismatches at runtime.
 */
export const SCHEMA_VERSION = "1.1";
