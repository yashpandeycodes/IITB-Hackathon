import "server-only";
import type { Collection, Document } from "mongodb";
import type { Origin } from "@/lib/contracts/enums";
import { getDb } from "./client";

/** Every MongoDB collection (docs/architecture.md §5). Use these constants, never string literals. */
export const COLLECTIONS = {
  // Reference data (mirrors the starter pack)
  datasets: "datasets",
  rooms: "rooms",
  room_unavailability: "room_unavailability",
  faculty: "faculty",
  student_groups: "student_groups",
  courses: "courses",
  sessions: "sessions",
  exams: "exams",
  booking_requests: "booking_requests",
  cancellations: "cancellations",
  // Working state
  timetable_versions: "timetable_versions",
  exam_schedules: "exam_schedules",
  booking_decisions: "booking_decisions",
  session_overrides: "session_overrides",
  change_requests: "change_requests",
  /** `schedule.json` as it was just before the first applied change (singleton `_id: "schedule"`). */
  baselines: "baselines",
  users: "users",
  revoked_sessions: "revoked_sessions",
  settings: "settings",
  audit_log: "audit_log",
  ai_logs: "ai_logs",
  /** Single-flight locks (reset, import); see `db/locks.ts`. */
  locks: "locks",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const COLLECTION_NAMES: readonly CollectionName[] =
  Object.values(COLLECTIONS);

/** Mongo-only metadata every stored document carries. `_id` equals the contract `id` where one exists. */
export type BaseDoc = {
  _id: string;
  created_at: string;
  updated_at: string;
  origin?: Origin;
};

export async function getCollection<T extends Document = Document>(
  name: CollectionName,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}
