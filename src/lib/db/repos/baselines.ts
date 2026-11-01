import "server-only";
import type { Db } from "mongodb";
import { BaselineSchema, type Baseline } from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { isDuplicateKeyError, nowIso } from "./meta";

/**
 * `baselines`: `schedule.json` as it was just before the first change request was applied, so
 * the export keeps serving the timetable the applied changes started from (what the validator's
 * `--baseline` compares with) while `schedule_after.json` follows the live timetable. A singleton
 * (`_id: "schedule"`); reset and import clear it with the rest of the derived state.
 */
export const BASELINE_ID = "schedule";

export type { Baseline };

export type BaselineDoc = Baseline & BaseDoc;

const collection = (db: Db) =>
  db.collection<BaselineDoc>(COLLECTIONS.baselines);

/** The stored baseline (parsed as a whole, so a malformed document fails loudly), or null. */
export async function getBaseline(db: Db): Promise<Baseline | null> {
  const doc = await collection(db).findOne({ _id: BASELINE_ID });
  return doc ? BaselineSchema.parse(doc) : null;
}

/**
 * Stores `baseline` unless one exists already. Returns true when this call stored it (so a
 * failed apply can remove exactly what it added), false when a baseline was already there.
 */
export async function insertBaselineIfMissing(
  db: Db,
  baseline: Omit<Baseline, "captured_at">,
): Promise<boolean> {
  const at = nowIso();
  try {
    await collection(db).insertOne({
      ...BaselineSchema.parse({ ...baseline, captured_at: at }),
      _id: BASELINE_ID,
      created_at: at,
      updated_at: at,
    });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err, "_id")) return false;
    throw err;
  }
}

export async function deleteBaseline(db: Db): Promise<void> {
  await collection(db).deleteOne({ _id: BASELINE_ID });
}
