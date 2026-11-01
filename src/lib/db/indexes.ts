import "server-only";
import type { Db, IndexDescription } from "mongodb";
import { COLLECTIONS, type CollectionName } from "./collections";

/**
 * Every index from architecture §5, named explicitly so `ensureIndexes` is idempotent.
 * `users` is left to the auth module, which owns that collection.
 */
export const INDEXES: Partial<Record<CollectionName, IndexDescription[]>> = {
  [COLLECTIONS.rooms]: [
    { key: { type: 1 }, name: "type_1" },
    { key: { capacity: 1 }, name: "capacity_1" },
    { key: { seq: 1 }, name: "seq_1" },
  ],
  [COLLECTIONS.room_unavailability]: [
    { key: { room_id: 1, day: 1 }, name: "room_id_1_day_1" },
  ],
  [COLLECTIONS.faculty]: [{ key: { department: 1 }, name: "department_1" }],
  [COLLECTIONS.student_groups]: [
    { key: { department: 1, year: 1 }, name: "department_1_year_1" },
  ],
  [COLLECTIONS.sessions]: [
    { key: { faculty_id: 1 }, name: "faculty_id_1" },
    { key: { groups: 1 }, name: "groups_1" },
    { key: { basket_slot: 1 }, name: "basket_slot_1" },
    { key: { seq: 1 }, name: "seq_1" },
  ],
  [COLLECTIONS.exams]: [{ key: { groups: 1 }, name: "groups_1" }],
  [COLLECTIONS.booking_requests]: [
    { key: { state: 1 }, name: "state_1" },
    { key: { created_by: 1 }, name: "created_by_1" },
    { key: { submitted_at: 1 }, name: "submitted_at_1" },
    { key: { "windows.day": 1 }, name: "windows.day_1" },
  ],
  [COLLECTIONS.cancellations]: [
    { key: { request_id: 1 }, name: "request_id_1", unique: true },
  ],
  [COLLECTIONS.timetable_versions]: [
    {
      key: { status: 1 },
      name: "one_active_version",
      unique: true,
      partialFilterExpression: { status: "active" },
    },
    { key: { created_at: -1 }, name: "created_at_-1" },
  ],
  [COLLECTIONS.exam_schedules]: [
    {
      key: { status: 1 },
      name: "one_active_schedule",
      unique: true,
      partialFilterExpression: { status: "active" },
    },
    { key: { created_at: -1 }, name: "created_at_-1" },
  ],
  [COLLECTIONS.booking_decisions]: [
    { key: { status: 1 }, name: "status_1" },
    { key: { room_id: 1, day: 1 }, name: "room_id_1_day_1" },
    { key: { timetable_version: 1 }, name: "timetable_version_1" },
  ],
  [COLLECTIONS.session_overrides]: [
    { key: { displaced_by: 1 }, name: "displaced_by_1" },
    { key: { timetable_version: 1 }, name: "timetable_version_1" },
  ],
  [COLLECTIONS.change_requests]: [
    { key: { status: 1 }, name: "status_1" },
    { key: { requested_by: 1 }, name: "requested_by_1" },
    // Pending proposals built on one version (superseded together when one of them is applied).
    { key: { base_version: 1, status: 1 }, name: "base_version_1_status_1" },
    // The list's visibility filter (`GET /api/changes`): a coordinator's department, a faculty id.
    { key: { "scope.departments": 1 }, name: "scope.departments_1" },
    { key: { "scope.faculty_ids": 1 }, name: "scope.faculty_ids_1" },
    // Newest first.
    { key: { created_at: -1 }, name: "created_at_-1" },
  ],
  [COLLECTIONS.audit_log]: [
    { key: { at: -1 }, name: "at_-1" },
    { key: { entity: 1, entity_id: 1 }, name: "entity_1_entity_id_1" },
  ],
  [COLLECTIONS.ai_logs]: [
    { key: { at: -1 }, name: "at_-1" },
    { key: { feature: 1 }, name: "feature_1" },
    // Retention (`ai-logs.ts`): each entry is deleted once its `expire_at` Date has passed.
    { key: { expire_at: 1 }, name: "expire_at_ttl", expireAfterSeconds: 0 },
  ],
};

/** Creates every index that is missing. Safe to call repeatedly. Returns the index count. */
export async function ensureIndexes(db: Db): Promise<number> {
  const results = await Promise.all(
    Object.entries(INDEXES).map(([name, indexes]) =>
      db.collection(name).createIndexes(indexes),
    ),
  );
  return results.reduce((sum, names) => sum + names.length, 0);
}

const ensured = new Map<string, Promise<number>>();

/**
 * {@link ensureIndexes} at most once per database per process (cached promise; a failure is
 * forgotten so the next call retries). Repositories that rely on a unique index (the single
 * active timetable version or exam schedule, unique cancellations) call this before writing.
 */
export function ensureIndexesOnce(db: Db): Promise<number> {
  const key = db.databaseName;
  let pending = ensured.get(key);
  if (!pending) {
    pending = ensureIndexes(db).catch((err: unknown) => {
      ensured.delete(key);
      throw err;
    });
    ensured.set(key, pending);
  }
  return pending;
}
