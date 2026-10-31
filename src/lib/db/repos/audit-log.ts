import "server-only";
import { ObjectId, type Db, type Filter } from "mongodb";
import { AuditLogEntrySchema, type AuditLogEntry } from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { nowIso, stripMeta } from "./meta";

/** `audit_log`: append-only. `_id` = `id` = `AL-<ObjectId hex>` (time-sortable). */
export type AuditLogDoc = AuditLogEntry & BaseDoc;

const collection = (db: Db) =>
  db.collection<AuditLogDoc>(COLLECTIONS.audit_log);

export type NewAuditLogEntry = Omit<AuditLogEntry, "id" | "at"> & {
  at?: string;
};

/** Appends one entry and returns it. */
export async function appendAuditLog(
  db: Db,
  entry: NewAuditLogEntry,
): Promise<AuditLogEntry> {
  const at = entry.at ?? nowIso();
  const id = `AL-${new ObjectId().toHexString()}`;
  const defined = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  );
  const parsed = AuditLogEntrySchema.parse({ ...defined, id, at });
  await collection(db).insertOne({
    ...parsed,
    _id: id,
    created_at: at,
    updated_at: at,
  });
  return parsed;
}

/** Newest first, optionally for one entity. */
export async function listAuditLog(
  db: Db,
  filter: {
    entity?: string;
    entity_id?: string;
    actor?: string;
    limit?: number;
  } = {},
): Promise<AuditLogEntry[]> {
  const query: Filter<AuditLogDoc> = {};
  if (filter.entity !== undefined) query.entity = filter.entity;
  if (filter.entity_id !== undefined) query.entity_id = filter.entity_id;
  if (filter.actor !== undefined) query.actor = filter.actor;
  const docs = await collection(db)
    .find(query, { sort: { _id: -1 }, limit: filter.limit ?? 100 })
    .toArray();
  return docs.map((doc) => AuditLogEntrySchema.parse(stripMeta(doc)));
}
