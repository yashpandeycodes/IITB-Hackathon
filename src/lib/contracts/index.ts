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
export * from "./explain";
export * from "./assistant";
export * from "./settings";
export * from "./audit";
export * from "./dashboard";
export * from "./admin";
export * from "./reference";
export * from "./ai";

// Frontend view-model types (`ui.ts`, owned by the frontend team). Its `BookingDraft` and
// `bookingDraftSchema` are not re-exported here: `BookingDraft` from this index is the API
// contract in `booking.ts` (import the UI one from "@/lib/contracts/ui" if needed).
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
  AssistantOptionCard,
  ChatMessage,
} from "./ui";
