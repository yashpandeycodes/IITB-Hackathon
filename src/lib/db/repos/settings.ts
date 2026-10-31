import "server-only";
import type { Db } from "mongodb";
import { SettingsSchema, type Settings } from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { nowIso, stripMeta } from "./meta";

/** The singleton settings document (`_id: "app"`, architecture §5.3). */
export const SETTINGS_ID = "app";

export type SettingsDoc = Settings & BaseDoc;

const collection = (db: Db) => db.collection<SettingsDoc>(COLLECTIONS.settings);

/** The stored settings, or null when none have been written yet. */
export async function getStoredSettings(db: Db): Promise<Settings | null> {
  const doc = await collection(db).findOne({ _id: SETTINGS_ID });
  return doc ? SettingsSchema.parse(stripMeta(doc)) : null;
}

/** Writes the whole settings document, keeping the original `created_at`. */
export async function saveSettings(
  db: Db,
  settings: Settings,
): Promise<Settings> {
  const parsed = SettingsSchema.parse(settings);
  const at = nowIso();
  await collection(db).updateOne(
    { _id: SETTINGS_ID },
    {
      $set: { ...parsed, updated_at: at },
      $setOnInsert: { created_at: at },
    },
    { upsert: true },
  );
  return parsed;
}
