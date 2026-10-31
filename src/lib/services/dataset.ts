import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import {
  Category,
  type Dataset,
  type DatasetIssue,
  type DatasetSource,
  type DatasetValidationDetails,
  type DerivedCleared,
  type ImportReport,
  type Origin,
  type RequestState,
} from "@/lib/contracts";
import { getBundledDataset, parseDataset } from "@/lib/dataset";
import { COLLECTIONS, type CollectionName } from "@/lib/db/collections";
import { ensureIndexesOnce } from "@/lib/db/indexes";
import { withDatasetLock } from "@/lib/db/locks";
import { appendAuditLog } from "@/lib/db/repos/audit-log";
import {
  getDatasetId,
  getDatasetMeta,
  replaceDatasetDoc,
} from "@/lib/db/repos/datasets";
import { nowIso, omit } from "@/lib/db/repos/meta";
import {
  listBookingRequests,
  listCancellations,
  listCourses,
  listExams,
  listFaculty,
  listRoomUnavailability,
  listRooms,
  listSessions,
  listStudentGroups,
  replaceReferenceData,
  roomDepartment,
  type ReferenceDocs,
} from "@/lib/db/repos/reference";
import { getStoredSettings, saveSettings } from "@/lib/db/repos/settings";
import { validationError } from "@/lib/errors";

/** Working state derived from a dataset; it is meaningless once a different dataset loads. */
export const DERIVED_COLLECTIONS = [
  COLLECTIONS.timetable_versions,
  COLLECTIONS.exam_schedules,
  COLLECTIONS.booking_decisions,
  COLLECTIONS.session_overrides,
  COLLECTIONS.change_requests,
] as const satisfies readonly CollectionName[];

export type DerivedCollection = (typeof DERIVED_COLLECTIONS)[number];

const MAX_REPORTED_ISSUES = 50;

/**
 * Validates `input` as a `cit_public.json`-shaped dataset. A bad file becomes a
 * `VALIDATION_ERROR` whose details list the first issues with their paths.
 */
export function validateDataset(input: unknown): Dataset {
  try {
    return parseDataset(input);
  } catch (err) {
    if (!(err instanceof z.core.$ZodError)) throw err;
    const issues: DatasetIssue[] = err.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    }));
    const details: DatasetValidationDetails = {
      issue_count: issues.length,
      issues: issues.slice(0, MAX_REPORTED_ISSUES),
    };
    throw validationError("The dataset file is invalid.", details);
  }
}

/** The dataset's priority order with any missing category appended, so it is complete. */
export function completePriorityOrder(order: readonly Category[]): Category[] {
  return [...order, ...Category.options.filter((c) => !order.includes(c))];
}

function shortHash(value: unknown): string {
  return createHash("sha1")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 8);
}

/** Turns a parsed dataset into the reference documents (architecture §5.2). */
export function buildReferenceDocs(
  dataset: Dataset,
  options: { at?: string; origin?: Origin } = {},
): { docs: ReferenceDocs; duplicate_cancellations: string[] } {
  const at = options.at ?? nowIso();
  const origin = options.origin ?? "dataset";
  const meta = (id: string, seq: number) => ({
    _id: id,
    seq,
    origin,
    created_at: at,
    updated_at: at,
  });

  const cancelled = new Set<string>();
  const duplicate_cancellations: string[] = [];
  const cancellations: ReferenceDocs["cancellations"] = [];
  dataset.cancellations.forEach((cancellation, seq) => {
    if (cancelled.has(cancellation.request_id)) {
      duplicate_cancellations.push(cancellation.request_id);
      return;
    }
    cancelled.add(cancellation.request_id);
    cancellations.push({
      ...cancellation,
      ...meta(cancellation.request_id, seq),
    });
  });

  const unavailabilityIds = new Set<string>();
  const room_unavailability = dataset.room_unavailability.map((entry, seq) => {
    const base = `${entry.room_id}:${entry.day}:${shortHash(entry)}`;
    let id = base;
    for (let n = 2; unavailabilityIds.has(id); n++) id = `${base}-${n}`;
    unavailabilityIds.add(id);
    return { ...entry, change_request_id: null, ...meta(id, seq) };
  });

  const docs: ReferenceDocs = {
    rooms: dataset.rooms.map((room, seq) => {
      const own = (room as { department?: unknown }).department;
      return {
        ...room,
        department: typeof own === "string" ? own : roomDepartment(room),
        ...meta(room.id, seq),
      };
    }),
    room_unavailability,
    faculty: dataset.faculty.map((faculty, seq) => ({
      ...faculty,
      ...meta(faculty.id, seq),
    })),
    student_groups: dataset.student_groups.map((group, seq) => ({
      ...group,
      ...meta(group.id, seq),
    })),
    courses: dataset.courses.map((course, seq) => ({
      ...course,
      ...meta(course.id, seq),
    })),
    sessions: dataset.sessions.map((session, seq) => ({
      ...session,
      removed: false,
      ...meta(session.id, seq),
    })),
    exams: dataset.exams.map((exam, seq) => ({
      ...exam,
      ...meta(exam.id, seq),
    })),
    booking_requests: dataset.booking_requests.map((request, seq) => ({
      ...request,
      state: (cancelled.has(request.id)
        ? "cancelled"
        : "submitted") satisfies RequestState,
      source: "dataset" as const,
      created_by: null,
      ...meta(request.id, seq),
    })),
    cancellations,
  };
  return { docs, duplicate_cancellations };
}

/** Deletes every document in the derived working-state collections. */
export async function clearDerivedState(db: Db): Promise<DerivedCleared> {
  const entries = await Promise.all(
    DERIVED_COLLECTIONS.map(async (name) => {
      const result = await db.collection(name).deleteMany({});
      return [name, result.deletedCount] as const;
    }),
  );
  return Object.fromEntries(entries) as DerivedCleared;
}

/**
 * Full-replace import (architecture §5.5): validates `input`, replaces every reference
 * collection (one bulk write each), stores the `datasets` doc with the original JSON in `raw`,
 * clears working state built on the previous data, and resets the settings' priority order to
 * the new dataset's. Importing the same file twice leaves the same data.
 *
 * Runs under the dataset lock, so an overlapping reset or import gets `CONFLICT` (409).
 *
 * Failure and recovery: the whole file is validated before anything is written, so a rejected
 * file leaves the database untouched. Mongo here has no multi-collection transactions
 * (standalone locally), so a write failure part-way (e.g. the connection drops) can leave the
 * reference collections half-replaced. The `datasets` doc is written last and still names the
 * previous data in that case; recover with `POST /api/admin/reset` (bundled data by default,
 * or `{ "from": "stored" }` for the previously loaded dataset).
 */
export async function importDataset(
  db: Db,
  input: unknown,
  source: DatasetSource,
  options: { actor?: string } = {},
): Promise<ImportReport> {
  const dataset = validateDataset(input);
  return withDatasetLock(db, () =>
    writeDataset(db, dataset, input, source, options),
  );
}

/**
 * {@link importDataset} for a caller that already holds the dataset lock and has validated the
 * file with {@link validateDataset} (a reset validates before it deletes anything).
 */
export async function importValidatedDatasetUnlocked(
  db: Db,
  dataset: Dataset,
  input: unknown,
  source: DatasetSource,
  options: { actor?: string } = {},
): Promise<ImportReport> {
  return writeDataset(db, dataset, input, source, options);
}

async function writeDataset(
  db: Db,
  dataset: Dataset,
  input: unknown,
  source: DatasetSource,
  options: { actor?: string },
): Promise<ImportReport> {
  await ensureIndexesOnce(db);
  const loaded_at = nowIso();
  const { docs, duplicate_cancellations } = buildReferenceDocs(dataset, {
    at: loaded_at,
  });

  const cleared = await clearDerivedState(db);
  const counts = await replaceReferenceData(db, docs);
  await replaceDatasetDoc(db, {
    _id: dataset.dataset_id,
    dataset_id: dataset.dataset_id,
    ...(dataset.institute !== undefined
      ? { institute: dataset.institute }
      : {}),
    calendar: dataset.calendar,
    priority_order: dataset.priority_order,
    role_category_cap: dataset.role_category_cap,
    loaded_at,
    source,
    raw: input,
    created_at: loaded_at,
    updated_at: loaded_at,
  });

  const settings = await getStoredSettings(db);
  if (settings) {
    await saveSettings(db, {
      ...settings,
      priority_order: completePriorityOrder(dataset.priority_order),
    });
  }

  const report: ImportReport = {
    dataset_id: dataset.dataset_id,
    source,
    loaded_at,
    counts,
    duplicate_cancellations,
    cleared,
  };
  if (options.actor) {
    await appendAuditLog(db, {
      actor: options.actor,
      action: "import",
      entity: COLLECTIONS.datasets,
      entity_id: dataset.dataset_id,
      after: { source, counts, cleared },
    });
  }
  return report;
}

// --------------------------------------------------------------------------------- reading

const RECORD_ONLY_KEYS = {
  rooms: ["department"],
  room_unavailability: ["change_request_id"],
  faculty: ["user_id"],
  sessions: ["removed"],
  booking_requests: ["state", "source", "created_by", "ai_meta"],
} as const;

/** Which booking requests a dataset read includes (see {@link getActiveDataset}). */
export type DatasetOrigin = "dataset" | "all";

/**
 * The dataset as currently stored in Mongo (reference collections plus the `datasets` rules),
 * in file order and in the `Dataset` shape the engine takes. Soft-removed sessions and draft
 * requests are left out, and cancellations only refer to requests that are included.
 *
 * `origin: "all"` (default, for views and what-if checks) includes requests users submitted in
 * the app. `origin: "dataset"` keeps only requests that came from the imported file
 * (`source: "dataset"`) and their cancellations: the validator only knows those, so exports and
 * validation use it (see {@link getDatasetForExport}). Falls back to the bundled dataset when
 * nothing has been imported.
 */
export async function getActiveDataset(
  db: Db,
  options: { origin?: DatasetOrigin } = {},
): Promise<Dataset> {
  const meta = await getDatasetMeta(db);
  if (!meta) return getBundledDataset();
  const origin = options.origin ?? "all";
  const [
    rooms,
    room_unavailability,
    faculty,
    student_groups,
    courses,
    sessions,
    booking_requests,
    cancellations,
    exams,
  ] = await Promise.all([
    listRooms(db),
    listRoomUnavailability(db),
    listFaculty(db),
    listStudentGroups(db),
    listCourses(db),
    listSessions(db),
    listBookingRequests(db, {
      state: ["submitted", "pending_approval", "decided", "cancelled"],
      ...(origin === "dataset" ? { source: "dataset" as const } : {}),
    }),
    listCancellations(db),
    listExams(db),
  ]);
  const requestIds = new Set(booking_requests.map((r) => r.id));
  return parseDataset({
    dataset_id: meta.dataset_id,
    ...(meta.institute !== undefined ? { institute: meta.institute } : {}),
    calendar: meta.calendar,
    priority_order: meta.priority_order,
    role_category_cap: meta.role_category_cap,
    rooms: rooms.map((x) => omit(x, RECORD_ONLY_KEYS.rooms)),
    room_unavailability: room_unavailability.map((x) =>
      omit(x, RECORD_ONLY_KEYS.room_unavailability),
    ),
    faculty: faculty.map((x) => omit(x, RECORD_ONLY_KEYS.faculty)),
    student_groups,
    courses,
    sessions: sessions.map((x) => omit(x, RECORD_ONLY_KEYS.sessions)),
    booking_requests: booking_requests.map((x) =>
      omit(x, RECORD_ONLY_KEYS.booking_requests),
    ),
    cancellations: cancellations.filter((c) => requestIds.has(c.request_id)),
    exams,
  });
}

/** The dataset as the official validator sees it: {@link getActiveDataset} with `origin: "dataset"`. */
export function getDatasetForExport(db: Db): Promise<Dataset> {
  return getActiveDataset(db, { origin: "dataset" });
}

/** The loaded `dataset_id`, or the bundled one when nothing has been imported. */
export async function getActiveDatasetId(db: Db): Promise<string> {
  return (await getDatasetId(db)) ?? getBundledDataset().dataset_id;
}

/** The loaded dataset's priority rules, or the bundled ones. */
export async function getActivePriorityRules(
  db: Db,
): Promise<
  Pick<Dataset, "dataset_id" | "priority_order" | "role_category_cap">
> {
  const meta = await getDatasetMeta(db);
  const source = meta ?? getBundledDataset();
  return {
    dataset_id: source.dataset_id,
    priority_order: source.priority_order,
    role_category_cap: source.role_category_cap,
  };
}
