import "server-only";
import type { Db } from "mongodb";
import type { Dataset, DatasetSource } from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { stripMeta } from "./meta";

/** The dataset-wide rules and metadata (everything except the entity arrays). */
export type DatasetMeta = Pick<
  Dataset,
  "dataset_id" | "calendar" | "priority_order" | "role_category_cap"
> & {
  institute?: string;
  loaded_at: string;
  source: DatasetSource;
};

/** `_id` = `dataset_id`. `raw` keeps the original JSON so a reset can re-import it. */
export type DatasetDoc = DatasetMeta & BaseDoc & { raw: unknown };

/**
 * The loaded dataset's metadata (without `raw`), or null when nothing has been imported.
 * The collection holds a single document: an import replaces it.
 */
export async function getDatasetMeta(db: Db): Promise<DatasetMeta | null> {
  const doc = await db
    .collection<DatasetDoc>(COLLECTIONS.datasets)
    .findOne({}, { sort: { loaded_at: -1 }, projection: { raw: 0 } });
  return doc ? (stripMeta(doc) as DatasetMeta) : null;
}

/** Just the loaded `dataset_id`, or null. */
export async function getDatasetId(db: Db): Promise<string | null> {
  const doc = await db
    .collection<DatasetDoc>(COLLECTIONS.datasets)
    .findOne({}, { sort: { loaded_at: -1 }, projection: { _id: 1 } });
  return doc?._id ?? null;
}

/** The original JSON of the loaded dataset, or null. */
export async function getDatasetRaw(
  db: Db,
): Promise<{ raw: unknown; source: DatasetSource } | null> {
  const doc = await db
    .collection<DatasetDoc>(COLLECTIONS.datasets)
    .findOne(
      {},
      { sort: { loaded_at: -1 }, projection: { raw: 1, source: 1 } },
    );
  return doc ? { raw: doc.raw, source: doc.source } : null;
}

/** Makes `doc` the only dataset document. */
export async function replaceDatasetDoc(
  db: Db,
  doc: DatasetDoc,
): Promise<void> {
  const collection = db.collection<DatasetDoc>(COLLECTIONS.datasets);
  await collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
  await collection.deleteMany({ _id: { $ne: doc._id } });
}
