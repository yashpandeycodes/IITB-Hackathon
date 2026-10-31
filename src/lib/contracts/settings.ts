/**
 * App settings (singleton `settings` doc, `_id: "app"`).
 */
import { z } from "zod";

import { Category } from "./enums";

/** An admin-edited priority order: every category exactly once, highest first. */
export const CompletePriorityOrderSchema = z
  .array(Category)
  .refine(
    (order) =>
      order.length === Category.options.length &&
      new Set(order).size === order.length,
    { message: "priority_order must list every category exactly once" },
  );

export const SettingsSchema = z.strictObject({
  team: z.string().min(1),
  /** Editable copy; defaults to the dataset's. */
  priority_order: CompletePriorityOrderSchema,
  llm_enabled: z.boolean(),
  /** What "today" and "kal" resolve against, `YYYY-MM-DD`. */
  reference_date: z.iso.date(),
  solver_seed: z.number().int().nonnegative(),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** `PATCH /api/settings`: any subset of fields, at least one. */
export const SettingsPatchSchema = SettingsSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: "Nothing to update" },
);
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
