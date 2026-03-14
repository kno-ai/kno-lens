import { createReadStream } from "fs";
import { watch, type FSWatcher } from "fs";
import { createInterface, type Interface as ReadlineInterface } from "readline";
import { EventEmitter } from "events";
import type { SessionEvent, Parser } from "@kno-lens/core";
import { createParser } from "@kno-lens/core";

// ─── Types ──────────────────────────────────────────────────────────────

export interface TailerEvents {
  events: [SessionEvent[]];
  error: [Error];
  end: [];
}

// ─── SessionTailer ──────────────────────────────────────────────────────

/**
 * Tails a JSONL file, emitting parsed SessionEvents as they appear.
 *
 * Reads the existing file content first (catch-up), then watches for
 * new lines appended to the file.
 *
 * @example
 *   const tailer = new SessionTailer("/path/to/session.jsonl");
 *   tailer.on("events", (events) => { ... });
 *   await tailer.start();
 *   // Later:
 *   tailer.stop();
 */
export class SessionTailer extends EventEmitter<TailerEvents> {
  private filePath: string;
  private parser: Parser;
  private watcher: FSWatcher | null = null;
  private rl: ReadlineInterface | null = null;
  private stream: ReturnType<typeof createReadStream> | null = null;
  private bytesRead = 0;
  private stopped = false;
  private reading = false;
  private changeWhileReading = false;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.parser = createParser("claude-code");
  }

  /**
   * Start tailing. Reads existing content, then watches for changes.
   * Resolves once the initial catch-up read is complete.
   */
  async start(): Promise<void> {
    if (this.stopped) throw new Error("Tailer already stopped");

    // Initial read of existing content
    await this.readFrom(0);

    // Watch for changes
    this.watcher = watch(this.filePath, (eventType) => {
      if (eventType !== "change") return;
      if (this.reading) {
        // A write happened while we're mid-read. Flag it so we re-read
        // after the current read completes — otherwise those bytes are lost.
        this.changeWhileReading = true;
        return;
      }
      this.readFrom(this.bytesRead).catch((err) => {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.watcher.on("error", (err) => {
      this.emit("error", err);
    });
  }

  /** Stop tailing and clean up resources. */
  stop(): void {
    this.stopped = true;
    this.watcher?.close();
    this.watcher = null;
    this.rl?.close();
    this.rl = null;
    this.stream?.destroy();
    this.stream = null;

    // Flush any remaining parser state
    const endEvents = this.parser.end();
    if (endEvents.length > 0) {
      this.emit("events", endEvents);
    }
    this.emit("end");
  }

  private async readFrom(startByte: number): Promise<void> {
    if (this.stopped) return;
    this.reading = true;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const stream = createReadStream(this.filePath, {
        start: startByte,
        encoding: "utf-8",
      });
      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      // Store references for stop() to clean up
      this.stream = stream;
      this.rl = rl;

      stream.on("data", (chunk) => {
        if (typeof chunk === "string") {
          this.bytesRead += Buffer.byteLength(chunk, "utf-8");
        } else {
          this.bytesRead += (chunk as Buffer).length;
        }
      });

      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const events = this.parser.parse(line);
          if (events.length > 0) {
            this.emit("events", events);
          }
        } catch (err) {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        }
      });

      rl.on("close", () => {
        this.reading = false;
        if (settled) return;
        settled = true;
        if (this.changeWhileReading && !this.stopped) {
          this.changeWhileReading = false;
          this.readFrom(this.bytesRead).then(resolve, reject);
        } else {
          resolve();
        }
      });

      stream.on("error", (err) => {
        this.reading = false;
        if (settled) return;
        settled = true;
        // If stopped, stream.destroy() may fire an error — don't propagate
        if (this.stopped) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }
}
