import "server-only";
import type { Db, Document, Filter } from "mongodb";
import type {
  BookingRequestRecord,
  BookingSource,
  Cancellation,
  Course,
  Exam,
  Faculty,
  RequestState,
  Room,
  RoomUnavailability,
  Session,
  StudentGroup,
} from "@/lib/contracts";
import { COLLECTIONS, type BaseDoc, type CollectionName } from "../collections";
import { nowIso, omit, stripMeta } from "./meta";

/**
 * Reference data (architecture §5.2): the starter-pack collections. Every document is the
 * contract object plus `_id` (= `id`), timestamps, `origin`, and `seq` (position in the
 * imported file, so reads return dataset order and the solver stays deterministic).
 */
type RefMeta = BaseDoc & { seq: number };

/** Rooms carry a derived `department` for labs (`lab_cs` → CSE, …), null otherwise. */
export type RoomRecord = Room & { department: string | null };
export type RoomDoc = RoomRecord & RefMeta;

/** `_id` = `${room_id}:${day}:${hash}`; `change_request_id` is set when a change added it. */
export type RoomUnavailabilityRecord = RoomUnavailability & {
  change_request_id?: string | null;
};
export type RoomUnavailabilityDoc = RoomUnavailabilityRecord & RefMeta;

/** `change_request_id` is set on faculty added by an applied change request. */
export type FacultyRecord = Faculty & {
  user_id?: string | null;
  change_request_id?: string | null;
};
export type FacultyDoc = FacultyRecord & RefMeta;

export type StudentGroupDoc = StudentGroup & RefMeta;
export type CourseDoc = Course & RefMeta;

/**
 * `removed` soft-deletes a session so diffs stay explainable; `removed_by` names the change
 * request that removed it. `change_request_id` is set on sessions an applied change added.
 */
export type SessionRecord = Session & {
  removed: boolean;
  removed_by?: string | null;
  change_request_id?: string | null;
};
export type SessionDoc = SessionRecord & RefMeta;

export type ExamDoc = Exam & RefMeta;
export type BookingRequestDoc = BookingRequestRecord & RefMeta;

/** `_id` = `request_id` (unique). */
export type CancellationDoc = Cancellation & RefMeta;

/** Lab room types owned by a department (architecture §5.2). */
export const LAB_DEPARTMENT: Readonly<Record<string, string>> = {
  lab_cs: "CSE",
  lab_elec: "ECE",
  workshop: "ME",
  lab_civil: "CE",
  lab_phy: "PH",
};

export function roomDepartment(room: Pick<Room, "type">): string | null {
  return Object.hasOwn(LAB_DEPARTMENT, room.type)
    ? LAB_DEPARTMENT[room.type]
    : null;
}

const SORT_BY_SEQ = { seq: 1, _id: 1 } as const;

function toRecord<T extends RefMeta>(doc: T): Omit<T, keyof RefMeta> {
  return omit(stripMeta(doc) as T, ["seq"]) as Omit<T, keyof RefMeta>;
}

/** Every matching doc in dataset order; `fields` limits the returned fields (a projection). */
async function findAll<D extends RefMeta>(
  db: Db,
  name: CollectionName,
  filter: Filter<D> = {},
  fields?: readonly string[],
): Promise<Omit<D, keyof RefMeta>[]> {
  const docs = await db
    .collection<D>(name)
    .find(filter, {
      sort: SORT_BY_SEQ,
      ...(fields && {
        projection: Object.fromEntries(fields.map((f) => [f, 1])),
      }),
    })
    .toArray();
  return docs.map((doc) => toRecord(doc as D));
}

async function findById<D extends RefMeta>(
  db: Db,
  name: CollectionName,
  id: string,
): Promise<Omit<D, keyof RefMeta> | null> {
  const doc = await db
    .collection<RefMeta & Document>(name)
    .findOne({ _id: id });
  return doc ? toRecord(doc as D) : null;
}

// ------------------------------------------------------------------------------------- reads

export const listRooms = (db: Db) => findAll<RoomDoc>(db, COLLECTIONS.rooms);
export const getRoom = (db: Db, id: string) =>
  findById<RoomDoc>(db, COLLECTIONS.rooms, id);

export function listRoomUnavailability(
  db: Db,
  filter: { room_id?: string; day?: string } = {},
) {
  return findAll<RoomUnavailabilityDoc>(
    db,
    COLLECTIONS.room_unavailability,
    filter as Filter<RoomUnavailabilityDoc>,
  );
}

export const listFaculty = (db: Db) =>
  findAll<FacultyDoc>(db, COLLECTIONS.faculty);
export const getFaculty = (db: Db, id: string) =>
  findById<FacultyDoc>(db, COLLECTIONS.faculty, id);

export const listStudentGroups = (db: Db) =>
  findAll<StudentGroupDoc>(db, COLLECTIONS.student_groups);
export const getStudentGroup = (db: Db, id: string) =>
  findById<StudentGroupDoc>(db, COLLECTIONS.student_groups, id);

export const listCourses = (db: Db) =>
  findAll<CourseDoc>(db, COLLECTIONS.courses);

/** Sessions in dataset order. Soft-removed sessions are left out unless asked for. */
export function listSessions(
  db: Db,
  options: { includeRemoved?: boolean } = {},
) {
  return findAll<SessionDoc>(
    db,
    COLLECTIONS.sessions,
    options.includeRemoved ? {} : { removed: { $ne: true } },
  );
}
export const getSession = (db: Db, id: string) =>
  findById<SessionDoc>(db, COLLECTIONS.sessions, id);

export const listExams = (db: Db) => findAll<ExamDoc>(db, COLLECTIONS.exams);

export type BookingRequestFilter = {
  state?: RequestState | RequestState[];
  /** Leave out these states. */
  not_state?: RequestState[];
  created_by?: string;
  /** Leave out requests this user created (e.g. for "approvals I may act on"). */
  not_created_by?: string;
  source?: BookingSource;
};

function bookingRequestQuery(
  filter: BookingRequestFilter,
): Filter<BookingRequestDoc> {
  const query: Filter<BookingRequestDoc> = {};
  if (filter.state !== undefined) {
    query.state = Array.isArray(filter.state)
      ? { $in: filter.state }
      : filter.state;
  } else if (filter.not_state !== undefined) {
    query.state = { $nin: filter.not_state };
  }
  if (filter.created_by !== undefined) {
    query.created_by = filter.created_by;
  } else if (filter.not_created_by !== undefined) {
    query.created_by = { $ne: filter.not_created_by };
  }
  if (filter.source !== undefined) query.source = filter.source;
  return query;
}

/**
 * Booking requests in dataset order, optionally filtered. `fields` returns only those fields
 * (a projection), for readers that need a few of them from every request.
 */
export function listBookingRequests(
  db: Db,
  filter?: BookingRequestFilter,
): Promise<BookingRequestRecord[]>;
export function listBookingRequests<K extends keyof BookingRequestRecord>(
  db: Db,
  filter: BookingRequestFilter,
  fields: readonly K[],
): Promise<Pick<BookingRequestRecord, K>[]>;
export function listBookingRequests(
  db: Db,
  filter: BookingRequestFilter = {},
  fields?: readonly string[],
): Promise<BookingRequestRecord[]> {
  return findAll<BookingRequestDoc>(
    db,
    COLLECTIONS.booking_requests,
    bookingRequestQuery(filter),
    fields,
  );
}

export function countBookingRequests(
  db: Db,
  filter: BookingRequestFilter = {},
): Promise<number> {
  return db
    .collection<BookingRequestDoc>(COLLECTIONS.booking_requests)
    .countDocuments(bookingRequestQuery(filter));
}

/**
 * Requests that are neither drafts nor cancelled and are not in `decided` (the request ids
 * with a decision for the active timetable version).
 */
export async function countUndecidedBookingRequests(
  db: Db,
  decided: readonly string[],
): Promise<number> {
  return db
    .collection<BookingRequestDoc>(COLLECTIONS.booking_requests)
    .countDocuments({
      state: { $nin: ["draft", "cancelled"] },
      _id: { $nin: [...decided] },
    });
}
export const getBookingRequest = (db: Db, id: string) =>
  findById<BookingRequestDoc>(db, COLLECTIONS.booking_requests, id);

export const listCancellations = (db: Db) =>
  findAll<CancellationDoc>(db, COLLECTIONS.cancellations);

/** Number of booking requests per state (every state present, zero when absent). */
export async function countBookingRequestsByState(
  db: Db,
): Promise<Record<RequestState, number>> {
  const counts: Record<RequestState, number> = {
    draft: 0,
    submitted: 0,
    pending_approval: 0,
    decided: 0,
    cancelled: 0,
  };
  const rows = await db
    .collection<BookingRequestDoc>(COLLECTIONS.booking_requests)
    .aggregate<{ _id: RequestState; n: number }>([
      { $group: { _id: "$state", n: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) {
    if (Object.hasOwn(counts, row._id)) counts[row._id] = row.n;
  }
  return counts;
}

// ------------------------------------------------------------------------------------ writes

/** The reference collections that a dataset import replaces wholesale. */
export const REFERENCE_COLLECTIONS = [
  COLLECTIONS.rooms,
  COLLECTIONS.room_unavailability,
  COLLECTIONS.faculty,
  COLLECTIONS.student_groups,
  COLLECTIONS.courses,
  COLLECTIONS.sessions,
  COLLECTIONS.exams,
  COLLECTIONS.booking_requests,
  COLLECTIONS.cancellations,
] as const satisfies readonly CollectionName[];

export type ReferenceCollection = (typeof REFERENCE_COLLECTIONS)[number];

export type ReferenceDocs = {
  rooms: RoomDoc[];
  room_unavailability: RoomUnavailabilityDoc[];
  faculty: FacultyDoc[];
  student_groups: StudentGroupDoc[];
  courses: CourseDoc[];
  sessions: SessionDoc[];
  exams: ExamDoc[];
  booking_requests: BookingRequestDoc[];
  cancellations: CancellationDoc[];
};

/**
 * Replaces every reference collection with `docs`: one ordered bulk write per collection
 * (delete all, then insert), all collections in parallel. Returns the inserted counts.
 */
export async function replaceReferenceData(
  db: Db,
  docs: ReferenceDocs,
): Promise<Record<ReferenceCollection, number>> {
  const entries = await Promise.all(
    REFERENCE_COLLECTIONS.map(async (name) => {
      const items: RefMeta[] = docs[name];
      const result = await db
        .collection<RefMeta>(name)
        .bulkWrite(
          [
            { deleteMany: { filter: {} } },
            ...items.map((document) => ({ insertOne: { document } })),
          ],
          { ordered: true },
        );
      return [name, result.insertedCount] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ReferenceCollection, number>;
}

// ------------------------------------------------------------- applied change requests

/**
 * The reference collections an applied change request writes to (`change-apply.ts`): faculty
 * unavailability and added faculty, room closures, added and removed sessions.
 */
export type ChangeTarget =
  | typeof COLLECTIONS.faculty
  | typeof COLLECTIONS.room_unavailability
  | typeof COLLECTIONS.sessions;

export type ChangeTargetDoc = {
  faculty: FacultyDoc;
  room_unavailability: RoomUnavailabilityDoc;
  sessions: SessionDoc;
};

const raw = <K extends ChangeTarget>(db: Db, name: K) =>
  db.collection<ChangeTargetDoc[K]>(name);

/** The highest `seq` in `name` (soft-removed sessions included), or -1 when it is empty. */
export async function maxReferenceSeq(
  db: Db,
  name: ChangeTarget,
): Promise<number> {
  const doc = await db
    .collection<RefMeta>(name)
    .findOne({}, { sort: { seq: -1 }, projection: { seq: 1 } });
  return doc?.seq ?? -1;
}

/** The stored documents (with their metadata) for `ids`, for snapshots taken before a write. */
export function findReferenceDocs<K extends ChangeTarget>(
  db: Db,
  name: K,
  ids: readonly string[],
): Promise<ChangeTargetDoc[K][]> {
  if (ids.length === 0) return Promise.resolve([]);
  return raw(db, name)
    .find({ _id: { $in: [...ids] } } as Filter<ChangeTargetDoc[K]>)
    .toArray() as Promise<ChangeTargetDoc[K][]>;
}

export async function insertReferenceDocs<K extends ChangeTarget>(
  db: Db,
  name: K,
  docs: readonly ChangeTargetDoc[K][],
): Promise<void> {
  if (docs.length === 0) return;
  await db.collection<RefMeta>(name).insertMany(
    docs.map((d) => ({ ...d })),
    {
      ordered: true,
    },
  );
}

export async function deleteReferenceDocs(
  db: Db,
  name: ChangeTarget,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.collection<RefMeta>(name).deleteMany({ _id: { $in: [...ids] } });
}

/** Puts each document back exactly as given (by `_id`, inserting it when missing). */
export async function restoreReferenceDocs<K extends ChangeTarget>(
  db: Db,
  name: K,
  docs: readonly ChangeTargetDoc[K][],
): Promise<void> {
  const collection = db.collection<RefMeta>(name);
  for (const doc of docs) {
    await collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }
}

/** Replaces a faculty member's whole `unavailable` list. */
export async function setFacultyUnavailable(
  db: Db,
  id: string,
  unavailable: Faculty["unavailable"],
): Promise<void> {
  await raw(db, COLLECTIONS.faculty).updateOne(
    { _id: id },
    { $set: { unavailable, updated_at: nowIso() } },
  );
}

/** Soft-removes sessions on behalf of change request `removedBy`. */
export async function markSessionsRemoved(
  db: Db,
  ids: readonly string[],
  removedBy: string,
): Promise<void> {
  if (ids.length === 0) return;
  await raw(db, COLLECTIONS.sessions).updateMany(
    { _id: { $in: [...ids] } },
    { $set: { removed: true, removed_by: removedBy, updated_at: nowIso() } },
  );
}
