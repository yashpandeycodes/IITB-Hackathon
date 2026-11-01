import "server-only";
import type { Db } from "mongodb";
import type { Dataset } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";
import { getBaseline, type Baseline } from "@/lib/db/repos/baselines";
import { getDatasetRaw } from "@/lib/db/repos/datasets";
import { validateDataset } from "./dataset";
import { getSettings } from "./settings";

/**
 * The baseline `schedule.json` (architecture §5.3): the export as it stood just before the first
 * change request was applied (captured by `captureBaselineIfMissing` in `export.ts`). Afterwards
 * `GET /api/export?file=schedule` serves this snapshot, checked against the dataset as it was
 * loaded, and `file=schedule_after` serves the live timetable, so the pair is exactly what
 * `validator.py --disruption <changes> --baseline schedule.json` compares.
 */

/** The baseline with its `team` re-stamped from the current settings, or null before any apply. */
export async function getBaselineSchedule(db: Db): Promise<Baseline | null> {
  const baseline = await getBaseline(db);
  if (!baseline) return null;
  const { team } = await getSettings(db);
  return { ...baseline, schedule: { ...baseline.schedule, team } };
}

/**
 * The dataset as it was loaded (`datasets.raw`), before any applied change: what
 * `validator.py --data` reads. The bundled dataset when nothing has been imported.
 */
export async function getOriginalDataset(db: Db): Promise<Dataset> {
  const stored = await getDatasetRaw(db);
  return stored ? validateDataset(stored.raw) : getBundledDataset();
}
