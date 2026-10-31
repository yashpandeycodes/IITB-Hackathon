/**
 * Parse cache: an in-memory LRU per server instance, keyed by a sha256 over everything that
 * shapes an outcome: the text, the reference date, the dataset, the model and the prompt.
 */
import { createHash } from "node:crypto";

import { PARSE_PROMPT_ID } from "./constants";
import type { ParseCache, ParseOutcome } from "./types";

export type CacheKeyInput = {
  text: string;
  referenceDate: string;
  /** The campus the draft's room and group ids were resolved against. */
  datasetId: string;
  /** The model asked; null for the rule parser. */
  model: string | null;
};

/**
 * `sha256(text, referenceDate, datasetId, model or "rules", PARSE_PROMPT_ID)` as hex. NUL
 * separates the parts so they can't run together.
 */
export function cacheKey(input: CacheKeyInput): string {
  return createHash("sha256")
    .update(
      [
        input.text,
        input.referenceDate,
        input.datasetId,
        input.model ?? "rules",
        PARSE_PROMPT_ID,
      ].join("\u0000"),
    )
    .digest("hex");
}

/** LRU: a hit moves the entry to the newest end; inserting past `maxEntries` drops the oldest. */
export function lruParseCache(maxEntries: number): ParseCache {
  const limit = Math.max(1, Math.floor(maxEntries) || 1);
  const entries = new Map<string, ParseOutcome>();
  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return structuredClone(value);
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, structuredClone(value));
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
