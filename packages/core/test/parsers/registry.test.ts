import { describe, it, expect } from "vitest";
import { createParser, supportedTools, SCHEMA_VERSION } from "../../src/index.js";

describe("createParser", () => {
  it("creates a claude-code parser with no options", () => {
    const parser = createParser("claude-code");
    expect(parser.tool).toBe("claude-code");
    expect(parser.version).toBe(SCHEMA_VERSION);
  });

  it("creates a claude-code parser with cliVersion hint", () => {
    const parser = createParser("claude-code", { cliVersion: "2.1.74" });
    expect(parser.tool).toBe("claude-code");
  });

  it("creates a claude-code parser with config overrides", () => {
    const parser = createParser("claude-code", {
      config: { bashOutputMaxChars: 50, thinkingExcerptMaxChars: 100 },
    });
    expect(parser.tool).toBe("claude-code");
  });

  it("falls back to latest parser for unknown CLI versions", () => {
    // Future CLI version should still get a parser (forward-compat)
    const parser = createParser("claude-code", { cliVersion: "99.0.0" });
    expect(parser.tool).toBe("claude-code");
  });

  it("throws for unsupported tools", () => {
    expect(() => createParser("aider" as never)).toThrow("No parser registered for tool: aider");
  });
});

describe("supportedTools", () => {
  it("returns only claude-code", () => {
    const tools = supportedTools();
    expect(tools).toEqual(["claude-code"]);
  });
});

describe("SCHEMA_VERSION", () => {
  it("is a semver-ish string", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+/);
  });

  it("matches the parser version", () => {
    const parser = createParser("claude-code");
    expect(parser.version).toBe(SCHEMA_VERSION);
  });
});
