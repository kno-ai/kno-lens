import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { createInterface } from "readline";

/**
 * Looks up a single JSONL record by its `uuid` field.
 *
 * Streams the file line-by-line, skipping lines that don't contain the
 * UUID string before parsing JSON. Returns the full parsed record, or
 * null if not found.
 *
 * This is O(n) in file size but only runs on explicit user action
 * (clicking an activity), not on the hot path.
 */
export async function lookupRecordByUuid(
  filePath: string,
  uuid: string,
): Promise<Record<string, unknown> | null> {
  await access(filePath, constants.R_OK);

  return new Promise((resolve, reject) => {
    let settled = false;

    const stream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    stream.on("error", (err) => {
      if (settled) return;
      settled = true;
      rl.close();
      reject(err);
    });

    rl.on("line", (line) => {
      if (settled) return;
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes(uuid)) return;
      try {
        const record = JSON.parse(trimmed);
        if (record && record.uuid === uuid) {
          settled = true;
          rl.close();
          stream.destroy();
          resolve(record);
        }
      } catch {
        // Malformed line — skip
      }
    });

    rl.on("close", () => {
      if (settled) return;
      settled = true;
      resolve(null);
    });
  });
}
