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
import { omit, stripMeta } from "./meta";

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

export type FacultyRecord = Faculty & { user_id?: string | null };
export type FacultyDoc = FacultyRecord & RefMeta;

export type StudentGroupDoc = StudentGroup & RefMeta;
export type CourseDoc = Course & RefMeta;

/** `removed` soft-deletes a session so diffs stay explainable. */
export type SessionRecord = Session & { removed: boolean };
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

async function findAll<D extends RefMeta>(
  db: Db,
  name: CollectionName,
  filter: Filter<D> = {},
): Promise<Omit<D, keyof RefMeta>[]> {
  const docs = await db
    .collection<D>(name)
    .find(filter, { sort: SORT_BY_SEQ })
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

export function listBookingRequests(db: Db, filter: BookingRequestFilter = {}) {
  return findAll<BookingRequestDoc>(
    db,
    COLLECTIONS.booking_requests,
    bookingRequestQuery(filter),
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
