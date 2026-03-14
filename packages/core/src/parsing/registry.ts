import type { Parser, SupportedTool, SessionCoreConfig } from "./events.js";
import { ClaudeCodeParserV1 } from "./claude-code/ClaudeCodeParserV1.js";

// ─── Parser registration ─────────────────────────────────────────────────

interface ParserRegistration {
  /** Schema version this parser produces (matches SCHEMA_VERSION at time of writing). */
  schemaVersion: string;
  /** Minimum CLI version this parser handles. Undefined = handles all versions. */
  minCliVersion?: string | undefined;
  /** Maximum CLI version this parser handles (exclusive). Undefined = no upper bound. */
  maxCliVersion?: string | undefined;
  /** Factory function to create the parser instance. */
  create: (config?: Partial<SessionCoreConfig>) => Parser;
}

const registry = new Map<SupportedTool, ParserRegistration[]>();

// Register parsers — newest last within each tool.
// When a new parser version is added (e.g., ClaudeCodeParserV2 for CLI v4+),
// add another entry with appropriate version bounds.
registry.set("claude-code", [
  {
    schemaVersion: "1.1",
    // V1 handles all known CLI versions
    create: (config) => new ClaudeCodeParserV1(config),
  },
]);

// ─── Factory ──────────────────────────────────────────────────────────────

export interface CreateParserOptions {
  /** CLI version from the log file. Used to select the best parser. */
  cliVersion?: string | undefined;
  /** Parser configuration overrides. */
  config?: Partial<SessionCoreConfig> | undefined;
}

/**
 * Create the appropriate parser for a given tool.
 *
 * If `cliVersion` is provided, selects the parser whose version range
 * contains it. Otherwise returns the latest registered parser.
 *
 * @example
 *   // Let the factory pick the latest parser
 *   const parser = createParser("claude-code");
 *
 *   // Route based on CLI version from the log's first record
 *   const parser = createParser("claude-code", { cliVersion: "2.1.74" });
 */
export function createParser(tool: SupportedTool, options?: CreateParserOptions): Parser {
  const registrations = registry.get(tool);
  if (!registrations || registrations.length === 0) {
    throw new Error(`No parser registered for tool: ${tool}`);
  }

  const cliVersion = options?.cliVersion;

  // If CLI version provided, find the best matching parser
  if (cliVersion) {
    for (let i = registrations.length - 1; i >= 0; i--) {
      const reg = registrations[i]!;
      if (matchesVersionRange(cliVersion, reg.minCliVersion, reg.maxCliVersion)) {
        return reg.create(options?.config);
      }
    }
    // Fall through to latest if no range matches (forward-compat for new CLI versions)
  }

  // Default: return the latest registered parser
  return registrations[registrations.length - 1]!.create(options?.config);
}

/**
 * List all supported tools that have registered parsers.
 */
export function supportedTools(): SupportedTool[] {
  return [...registry.keys()];
}

// ─── Version comparison ──────────────────────────────────────────────────

function matchesVersionRange(version: string, min?: string, max?: string): boolean {
  if (min && compareVersions(version, min) < 0) return false;
  if (max && compareVersions(version, max) >= 0) return false;
  return true;
}

/**
 * Simple semver-ish comparison. Returns negative if a < b, 0 if equal, positive if a > b.
 * Handles versions like "2.1.74", "3.0.0", "2.1".
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
