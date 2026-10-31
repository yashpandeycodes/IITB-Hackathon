/**
 * Shared enums — frozen vocabulary used by the DB, API, UI, engine and export.
 * Values are exactly the strings used in the starter-pack dataset (see docs/architecture.md §4.3).
 */
import { z } from "zod";

export const Day = z.enum(["MON", "TUE", "WED", "THU", "FRI"]);
export type Day = z.infer<typeof Day>;
export const DAYS = Day.options;

export const ExamDay = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
export type ExamDay = z.infer<typeof ExamDay>;

/** Any period, 1–13. P1–P9 are teaching periods, P10–P13 are events only. */
export const Period = z.number().int().min(1).max(13);
export type Period = z.infer<typeof Period>;

/** Teaching periods only, 1–9. */
export const TeachingPeriod = z.number().int().min(1).max(9);
export type TeachingPeriod = z.infer<typeof TeachingPeriod>;

export const SessionKind = z.enum(["lecture", "tutorial", "lab"]);
export type SessionKind = z.infer<typeof SessionKind>;

export const RoomType = z.enum([
  "classroom",
  "lecture_hall",
  "auditorium",
  "seminar_hall",
  "outdoor",
  "lab_cs",
  "lab_elec",
  "lab_phy",
  "workshop",
  "lab_civil",
]);
export type RoomType = z.infer<typeof RoomType>;

export const Feature = z.enum([
  "projector",
  "ac",
  "pa_system",
  "stage",
  "power_benches",
  "computers",
]);
export type Feature = z.infer<typeof Feature>;

/** Booking "needs": a room feature or "accessible". */
export const Need = z.union([Feature, z.literal("accessible")]);
export type Need = z.infer<typeof Need>;

export const RoomUse = z.enum(["lecture", "tutorial", "lab", "exam", "event"]);
export type RoomUse = z.infer<typeof RoomUse>;

/** Priority categories, highest first (the dataset's `priority_order` is authoritative at runtime). */
export const Category = z.enum([
  "exam",
  "regular_session",
  "institute_event",
  "guest_lecture",
  "department_event",
  "club_event",
]);
export type Category = z.infer<typeof Category>;

export const Role = z.enum([
  "admin",
  "department_coordinator",
  "faculty",
  "club",
]);
export type Role = z.infer<typeof Role>;

export const DecisionStatus = z.enum([
  "approved",
  "rejected",
  "alternative_offered",
]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const RequestState = z.enum([
  "draft",
  "submitted",
  "pending_approval",
  "decided",
  "cancelled",
]);
export type RequestState = z.infer<typeof RequestState>;

export const ChangeStatus = z.enum([
  "proposing",
  "pending",
  "approved",
  "rejected",
  "infeasible",
  "applied",
]);
export type ChangeStatus = z.infer<typeof ChangeStatus>;

export const ExamSession = z.enum(["AM", "PM"]);
export type ExamSession = z.infer<typeof ExamSession>;

/** Where a reference-data document came from. */
export const Origin = z.enum(["dataset", "disruption", "manual"]);
export type Origin = z.infer<typeof Origin>;
