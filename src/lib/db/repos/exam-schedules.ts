import "server-only";
import type { Db } from "mongodb";
import { ExamScheduleSchema, type ExamSchedule } from "@/lib/contracts";
import { notFound } from "@/lib/errors";
import { COLLECTIONS, type BaseDoc } from "../collections";
import { ensureIndexesOnce } from "../indexes";
import { insertWithSequentialId, nowIso, stripMeta } from "./meta";

/** `exam_schedules`: versioned like timetables (`EXS-NNNN`, at most one `active`). */
export type ExamScheduleDoc = ExamSchedule & BaseDoc;

const collection = (db: Db) =>
  db.collection<ExamScheduleDoc>(COLLECTIONS.exam_schedules);

function toSchedule(doc: ExamScheduleDoc): ExamSchedule {
  return ExamScheduleSchema.parse(stripMeta(doc, ["created_at"]));
}

export async function getActiveExamSchedule(
  db: Db,
): Promise<ExamSchedule | null> {
  const doc = await collection(db).findOne({ status: "active" });
  return doc ? toSchedule(doc) : null;
}

export async function getExamSchedule(
  db: Db,
  id: string,
): Promise<ExamSchedule | null> {
  const doc = await collection(db).findOne({ _id: id });
  return doc ? toSchedule(doc) : null;
}

/** Newest first. */
export async function listExamSchedules(
  db: Db,
  limit = 50,
): Promise<ExamSchedule[]> {
  const docs = await collection(db)
    .find({}, { sort: { _id: -1 }, limit })
    .toArray();
  return docs.map(toSchedule);
}

export type NewExamSchedule = Omit<ExamSchedule, "id" | "created_at">;

/** Stores a new schedule under the next `EXS-NNNN` id. */
export async function insertExamSchedule(
  db: Db,
  schedule: NewExamSchedule,
): Promise<ExamSchedule> {
  await ensureIndexesOnce(db);
  const at = nowIso();
  const build = (id: string) =>
    ExamScheduleSchema.parse({ ...schedule, id, created_at: at });
  const id = await insertWithSequentialId<ExamScheduleDoc>(
    db,
    COLLECTIONS.exam_schedules,
    "EXS",
    (id) => ({ ...build(id), _id: id, updated_at: at }),
  );
  return build(id);
}

/** Makes `id` the active exam schedule and supersedes the previous one. */
export async function activateExamSchedule(
  db: Db,
  id: string,
): Promise<ExamSchedule> {
  await ensureIndexesOnce(db);
  const target = await collection(db).findOne({ _id: id });
  if (!target) throw notFound(`Exam schedule ${id} not found.`);
  if (target.status !== "active") {
    const at = nowIso();
    await collection(db).updateMany(
      { status: "active", _id: { $ne: id } },
      { $set: { status: "superseded", updated_at: at } },
    );
    await collection(db).updateOne(
      { _id: id },
      { $set: { status: "active", updated_at: at } },
    );
  }
  const updated = await getExamSchedule(db, id);
  if (!updated) throw notFound(`Exam schedule ${id} not found.`);
  return updated;
}
