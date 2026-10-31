import "server-only";
import type { Db } from "mongodb";
import {
  SettingsSchema,
  type Category,
  type Settings,
  type SettingsPatch,
} from "@/lib/contracts";
import { COLLECTIONS } from "@/lib/db/collections";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  SETTINGS_ID,
  getStoredSettings,
  saveSettings,
} from "@/lib/db/repos/settings";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { validationError } from "@/lib/errors";
import { completePriorityOrder, getActivePriorityRules } from "./dataset";

/**
 * Defaults (architecture §5.3): team from `TEAM_NAME`, the dataset's priority order, and
 * `LLM_ENABLED`, `APP_REFERENCE_DATE`, `SOLVER_SEED` from the environment.
 */
export function defaultSettings(
  datasetPriorityOrder: readonly Category[],
  env: ServerEnv = getServerEnv(),
): Settings {
  return SettingsSchema.parse({
    team: env.TEAM_NAME,
    priority_order: completePriorityOrder(datasetPriorityOrder),
    llm_enabled: env.LLM_ENABLED,
    reference_date: env.APP_REFERENCE_DATE,
    solver_seed: env.SOLVER_SEED,
  });
}

/** The stored settings, or the defaults (not persisted) when none have been saved yet. */
export async function getSettings(db: Db): Promise<Settings> {
  const stored = await getStoredSettings(db);
  if (stored) return stored;
  const rules = await getActivePriorityRules(db);
  return defaultSettings(rules.priority_order);
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/**
 * Applies an admin's patch. `priority_order` must be a permutation of the dataset's
 * categories. Writes an audit entry with the before and after values.
 */
export async function updateSettings(
  db: Db,
  patch: SettingsPatch,
  actor: string,
): Promise<Settings> {
  const before = await getSettings(db);
  if (patch.priority_order) {
    const rules = await getActivePriorityRules(db);
    const allowed = completePriorityOrder(rules.priority_order);
    if (!sameMembers(patch.priority_order, allowed)) {
      throw validationError("The request body is invalid.", {
        formErrors: [],
        fieldErrors: {
          priority_order: [
            `priority_order must be a permutation of the dataset's categories: ${allowed.join(", ")}`,
          ],
        },
      });
    }
  }
  const after = await saveSettings(db, { ...before, ...patch });
  await appendAuditLog(db, {
    actor,
    action: "update",
    entity: COLLECTIONS.settings,
    entity_id: SETTINGS_ID,
    before,
    after,
  });
  return after;
}
