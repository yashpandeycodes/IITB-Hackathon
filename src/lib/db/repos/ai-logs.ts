import "server-only";
import { ObjectId, type Db } from "mongodb";
import type { z } from "zod";
import { AiLogEntrySchema, type AiLogEntry } from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { nowIso, omit, stripMeta } from "./meta";

/**
 * `ai_logs` (architecture §5.3): one entry per AI call or rule-parser fallback, backing the
 * AI_USAGE declarations and the eval. `_id` = `id` = `AI-<ObjectId hex>` (time-sortable).
 *
 * Retention: entries hold users' own text, so they expire {@link AI_LOG_RETENTION_DAYS} days
 * after they were written. `at` is an ISO string (the contract's), which a TTL index can't read,
 * so each document also stores `expire_at` (a BSON Date; TTL index in `indexes.ts`), stripped on
 * read.
 */
export const AI_LOG_RETENTION_DAYS = 30;
const RETENTION_MS = AI_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type AiLogDoc = AiLogEntry &
  BaseDoc & {
    /** When MongoDB's TTL monitor may delete the entry. */
    expire_at: Date;
  };

const collection = (db: Db) => db.collection<AiLogDoc>(COLLECTIONS.ai_logs);

/** A new entry: `cached`, `assumptions` and `follow_up` default like the schema's. */
export type NewAiLogEntry = Omit<
  z.input<typeof AiLogEntrySchema>,
  "id" | "at"
> & { at?: string };

/** Appends one entry and returns it. */
export async function appendAiLog(
  db: Db,
  entry: NewAiLogEntry,
): Promise<AiLogEntry> {
  const at = entry.at ?? nowIso();
  const id = `AI-${new ObjectId().toHexString()}`;
  const parsed = AiLogEntrySchema.parse({ ...entry, id, at });
  await collection(db).insertOne({
    ...parsed,
    _id: id,
    created_at: at,
    updated_at: at,
    expire_at: new Date(Date.now() + RETENTION_MS),
  });
  return parsed;
}

export async function getAiLog(db: Db, id: string): Promise<AiLogEntry | null> {
  const doc = await collection(db).findOne({ _id: id });
  return doc
    ? AiLogEntrySchema.parse(omit(stripMeta(doc), ["expire_at"]))
    : null;
}
