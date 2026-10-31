/**
 * Disruption (change) files, as applied by `validator.py`'s `apply_disruption`.
 * Changes are permanent: they hold for every week after they're applied.
 * An unknown `type` is rejected, matching the validator.
 */
import { z } from "zod";

import { FacultySchema, SessionSchema } from "./dataset";
import { Period } from "./enums";
import { Id, type KnownFields } from "./util";

/**
 * Days are kept as given: the validator appends any day string, and one outside the
 * calendar simply never matches a placement. The engine drops non-calendar days on apply.
 */
const ChangeDays = z.array(z.string().min(1));

/** Appends one `unavailable` entry per day to the faculty member. */
export const FacultyUnavailableChangeSchema = z.looseObject({
  type: z.literal("faculty_unavailable"),
  faculty_id: Id,
  days: ChangeDays,
  periods: z.array(Period),
  reason: z.string().optional(),
});
export type FacultyUnavailableChange = KnownFields<
  z.infer<typeof FacultyUnavailableChangeSchema>
>;

/** Appends one `room_unavailability` entry per day. */
export const RoomUnavailableChangeSchema = z.looseObject({
  type: z.literal("room_unavailable"),
  room_id: Id,
  days: ChangeDays,
  periods: z.array(Period),
  reason: z.string().optional(),
});
export type RoomUnavailableChange = KnownFields<
  z.infer<typeof RoomUnavailableChangeSchema>
>;

export const AddFacultyChangeSchema = z.looseObject({
  type: z.literal("add_faculty"),
  faculty: FacultySchema,
});
export type AddFacultyChange = KnownFields<
  z.infer<typeof AddFacultyChangeSchema>
>;

export const AddSessionChangeSchema = z.looseObject({
  type: z.literal("add_session"),
  session: SessionSchema,
});
export type AddSessionChange = KnownFields<
  z.infer<typeof AddSessionChangeSchema>
>;

export const RemoveSessionChangeSchema = z.looseObject({
  type: z.literal("remove_session"),
  session_id: Id,
});
export type RemoveSessionChange = KnownFields<
  z.infer<typeof RemoveSessionChangeSchema>
>;

export const DisruptionChangeSchema = z.discriminatedUnion("type", [
  FacultyUnavailableChangeSchema,
  RoomUnavailableChangeSchema,
  AddFacultyChangeSchema,
  AddSessionChangeSchema,
  RemoveSessionChangeSchema,
]);
export type DisruptionChange = KnownFields<
  z.infer<typeof DisruptionChangeSchema>
>;
export type DisruptionChangeType = DisruptionChange["type"];

export const DisruptionSchema = z.looseObject({
  id: z.string().optional(),
  /** The `dataset_id` the file was written for. */
  dataset: z.string().optional(),
  description: z.string().optional(),
  changes: z.array(DisruptionChangeSchema).default([]),
});
export type Disruption = KnownFields<z.infer<typeof DisruptionSchema>>;
