/**
 * Minimal vscode module mock for unit tests.
 * Only the API surface actually used by the extension is stubbed.
 */
import { vi } from "vitest";

// ─── Uri ────────────────────────────────────────────────────────────────

export class Uri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.fsPath = path;
    this.path = path;
  }

  static file(path: string): Uri {
    return new Uri("file", path);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...segments].join("/"));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

// ─── QuickPickItemKind ──────────────────────────────────────────────────

export enum QuickPickItemKind {
  Default = 0,
  Separator = -1,
}

// ─── workspace ──────────────────────────────────────────────────────────

const configStore: Record<string, unknown> = {};

export function __setConfigValue(section: string, key: string, value: unknown): void {
  configStore[`${section}.${key}`] = value;
}

export function __clearConfig(): void {
  for (const k of Object.keys(configStore)) {
    delete configStore[k];
  }
}

export const workspace = {
  getConfiguration(section: string) {
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const fullKey = `${section}.${key}`;
        if (fullKey in configStore) return configStore[fullKey] as T;
        return defaultValue;
      },
    };
  },
  workspaceFolders: undefined as { uri: Uri }[] | undefined,
  openTextDocument: vi.fn().mockResolvedValue({}),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
};

// ─── window ─────────────────────────────────────────────────────────────

export const window = {
  showQuickPick: vi.fn(),
  showTextDocument: vi.fn(),
};

// ─── Disposable ─────────────────────────────────────────────────────────

export class Disposable {
  private fn: () => void;
  constructor(fn: () => void) {
    this.fn = fn;
  }
  dispose() {
    this.fn();
  }
}
