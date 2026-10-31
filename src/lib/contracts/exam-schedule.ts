/**
 * Stored exam schedules (`exam_schedules`), versioned like timetables.
 */
import { z } from "zod";

import { ExamPlacementSchema } from "./schedule";
import { TimetableVersionStatus } from "./timetable";
import { Count, Id, Timestamp } from "./util";

export const ExamScheduleSchema = z.strictObject({
  /** e.g. "EXS-0001". */
  id: Id,
  status: TimetableVersionStatus,
  exams: z.array(ExamPlacementSchema),
  /** Exam soft penalty: 5 per extra exam a group sits on the same day. */
  penalty: Count,
  created_at: Timestamp,
});
export type ExamSchedule = z.infer<typeof ExamScheduleSchema>;
