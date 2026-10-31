/**
 * The scheduling engine: pure, deterministic functions over `@/lib/contracts` data.
 * The checkers are a line-by-line port of the official `validator.py` (proved by `scripts/parity.ts`).
 */
export * from "./types";
export {
  buildInstance,
  isFacultyUnavailable,
  isRoomUnavailable,
  isTeachingDay,
  slotKey,
  type Instance,
} from "./instance";
export {
  block,
  checkAssignMap,
  checkTimetable,
  groupSlotKey,
  isGroupBusy,
  toAssignMap,
  type GroupOccupancy,
  type TimetableCheck,
} from "./checker";
export { softScore, softScoreMap, type SoftScore } from "./soft";
export { checkBookings, outranks, type BookingsCheck } from "./bookings-check";
export { checkExams, examSeats, type ExamsCheck } from "./exams-check";
export { applyDisruption, DisruptionError } from "./disruption";
export {
  computeStability,
  dedupeViolations,
  validateSchedule,
} from "./validate";
export { mulberry32, pick, randomInt, shuffle, type Rng } from "./rng";
