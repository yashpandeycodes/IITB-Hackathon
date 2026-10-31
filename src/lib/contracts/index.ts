/**
 * Single import point for every data contract: `import { SessionSchema, type Session } from "@/lib/contracts"`.
 * Safe for client components (no dataset JSON is pulled in from here).
 */
export * from "./enums";
export * from "./api";
export * from "./dataset";
export * from "./disruption";
export * from "./schedule";
export * from "./violation";
export * from "./priority";
export * from "./user";
export * from "./auth";
export * from "./timetable";
export * from "./exam-schedule";
export * from "./booking";
export * from "./change";
export * from "./settings";
export * from "./audit";
export * from "./dashboard";
export * from "./admin";

export type {
  DayCode,
  PeriodId,
  UiSessionKind,
  PriorityCategory,
  BookingStatus,
  SessionItem,
  TimetableAssignment,
  UiTimetableCell,
  CampusRoom,
  BookingItem,
  ReschedulingMove,
  BookingDraft,
  AssistantOptionCard,
  ChatMessage,
} from "./ui";
export { bookingDraftSchema } from "./ui";
