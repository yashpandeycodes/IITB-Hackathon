import "server-only";
import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";

/**
 * Spectra-week (Week 7) state: `booking_decisions` and `session_overrides`. Both carry the
 * `timetable_version` they were computed against, and every reader keeps only the active
 * version's, so state left over from another version is ignored rather than shown.
 */

export type SpectraCleared = {
  booking_decisions: number;
  session_overrides: number;
};

/**
 * Deletes Spectra-week state: everything, or with `versionId` only what was computed for that
 * timetable version. Timetable activation and generation call this before a new Spectra run.
 * Request `state`s are left alone; the Spectra run that follows sets them.
 */
export async function clearSpectraState(
  db: Db,
  versionId?: string,
): Promise<SpectraCleared> {
  const filter =
    versionId === undefined ? {} : { timetable_version: versionId };
  const [decisions, overrides] = await Promise.all([
    db.collection(COLLECTIONS.booking_decisions).deleteMany(filter),
    db.collection(COLLECTIONS.session_overrides).deleteMany(filter),
  ]);
  return {
    booking_decisions: decisions.deletedCount,
    session_overrides: overrides.deletedCount,
  };
}
