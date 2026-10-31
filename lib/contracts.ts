/**
 * CIT Nexus - Central Data Contracts and Schemas
 * Strictly shared across API routes, UI components, and validation.
 */

import { z } from 'zod';

export type DayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type PeriodId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11' | 'P12' | 'P13';
export type SessionKind = 'lecture' | 'tutorial' | 'lab' | 'basket' | 'booking' | 'exam';
export type BookingStatus = 'approved' | 'alternative' | 'rejected' | 'pending' | 'cancelled';
export type PriorityCategory = 'exam' | 'regular_class' | 'institute_event' | 'guest_lecture' | 'department_event' | 'club_event';
export type ChangeStatus = 'pending' | 'approved' | 'applied' | 'rejected' | 'infeasible';
export type TimetableWeek = 'regular' | 'spectra' | 'exam';
export type ViewMode = 'group' | 'faculty' | 'room';

// ==========================================
// 1. Session & Assignment Contracts
// ==========================================

export interface SessionItem {
  id: string;
  courseCode: string;
  courseName: string;
  kind: SessionKind;
  groups: string[];
  facultyId: string;
  facultyName: string;
  durationPeriods: number; // e.g. 1 for L/T, 3 for P (lab)
  studentCount: number;
  isElectiveBasket?: boolean;
  basketName?: string;
  basketSubCourses?: Array<{
    code: string;
    name: string;
    room: string;
    faculty: string;
  }>;
}

export interface TimetableAssignment {
  sessionId: string;
  day: DayCode;
  period: PeriodId;
  roomId: string;
  roomName: string;
  isOverride?: boolean;
  overrideReason?: string;
  isGhost?: boolean; // For approval diff overlay
  isNew?: boolean;   // For approval diff overlay
}

export interface TimetableCell {
  day: DayCode;
  period: PeriodId;
  session?: SessionItem;
  assignment?: TimetableAssignment;
  booking?: BookingItem;
  isLunch?: boolean;
}

// ==========================================
// 2. Room Contracts
// ==========================================

export interface CampusRoom {
  id: string;
  name: string;
  type: 'Lecture Hall' | 'Seminar Hall' | 'Auditorium' | 'Computing Lab' | 'Department Lab' | 'Open Air Theatre';
  capacity: number;
  features: string[]; // e.g. 'Projector', 'PA System', 'AC', 'Stage', 'Computers', 'Power Benches'
  isAccessible: boolean;
  building: string;
  floor: number;
  isEventCapable: boolean;
}

// ==========================================
// 3. Booking & Spectra Contracts
// ==========================================

export interface BookingItem {
  id: string;
  title: string;
  requesterId: string;
  requesterName: string;
  requesterRole: 'Admin' | 'Department Coordinator' | 'Faculty' | 'Club Representative';
  requestedCategory: PriorityCategory;
  effectiveCategory: PriorityCategory;
  isCapped?: boolean;
  originalClaim?: string;
  day: DayCode;
  periodStart: PeriodId;
  periodEnd: PeriodId;
  durationHours: number;
  requestedRoomId?: string;
  assignedRoomId?: string;
  assignedRoomName?: string;
  expectedAttendance: number;
  requiredFeatures: string[];
  status: BookingStatus;
  decisionReason: string;
  decisionReasonCode?: string;
  alternativeOffer?: {
    day: DayCode;
    periodStart: PeriodId;
    periodEnd: PeriodId;
    roomId: string;
    roomName: string;
  };
  competingBookings?: string[];
  isSeries?: boolean;
  seriesId?: string;
}

// ==========================================
// 4. Change Request & Rescheduling Contracts
// ==========================================

export interface ReschedulingMove {
  id: string;
  sessionId: string;
  courseCode: string;
  courseName: string;
  fromDay: DayCode;
  fromPeriod: PeriodId;
  fromRoomId: string;
  fromRoomName: string;
  toDay: DayCode;
  toPeriod: PeriodId;
  toRoomId: string;
  toRoomName: string;
  moveType: 'time' | 'room' | 'both';
  reason: string;
  facultyName: string;
  groups: string[];
}

export interface ChangeRequest {
  id: string;
  title: string;
  type: 'faculty_leave' | 'room_closure' | 'add_session' | 'remove_session' | 'custom_file';
  requestedBy: string;
  requesterRole: string;
  createdAt: string;
  status: ChangeStatus;
  summary: string;
  reason: string;
  moves: ReschedulingMove[];
  hardViolationsCount: number;
  softPenaltyDelta: number;
  affectedGroups: string[];
  affectedFaculty: string[];
  infeasibleReasons?: Array<{
    rule: string;
    description: string;
    suggestion: string;
  }>;
  adminComment?: string;
}

// ==========================================
// 5. Exam Contracts
// ==========================================

export interface ExamSession {
  id: string;
  day: DayCode;
  slot: 'AM' | 'PM'; // AM 09:30-11:30, PM 14:00-16:00
  courseCode: string;
  courseName: string;
  groups: string[];
  totalStudents: number;
  roomAllocations: Array<{
    roomId: string;
    roomName: string;
    seatsAssigned: number;
  }>;
}

// ==========================================
// 6. Validation & Metrics Contracts
// ==========================================

export interface HardRuleCheck {
  code: string; // H1 to H14, B, E
  name: string;
  description: string;
  violationsCount: number;
  status: 'passed' | 'violated';
  details?: string[];
}

export interface SoftPenaltyCheck {
  code: string; // S1 to S6
  name: string;
  weight: number;
  penaltyPoints: number;
  description: string;
}

export interface ValidatorReport {
  hardPassed: boolean;
  totalHardViolations: number;
  totalSoftPenalty: number;
  hardRules: HardRuleCheck[];
  softRules: SoftPenaltyCheck[];
  bookingScore: {
    satisfied: number;
    totalPossible: number;
  };
  priorityInversions: number;
  roomUtilisationPercent: number;
  stabilityScore?: number;
}

// ==========================================
// 7. AI Assistant & NL Booking Contracts
// ==========================================

export interface BookingDraft {
  title: string;
  attendance: number;
  day: DayCode;
  periodStart: PeriodId;
  periodEnd: PeriodId;
  roomType: string;
  needs: string[];
  requestedRoom?: string;
  rawQuery?: string;
  assumptions: Array<{
    field: string;
    sourcePhrase: string;
    assumedValue: string | number;
  }>;
  followUpQuestion?: string;
  followUpOptions?: string[];
}

export interface AssistantOptionCard {
  id: string;
  title: string;
  proposedSlot: string;
  targetRoom: string;
  movedSessionsCount: number;
  softPenaltyImpact: string;
  isVerified: boolean;
  explanation: string;
  actionPayload: any;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  text: string;
  optionCards?: AssistantOptionCard[];
  ruleViolations?: string[];
  isAiOff?: boolean;
}

// ==========================================
// 8. Zod Validation Schemas
// ==========================================

export const bookingDraftSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  attendance: z.number().int().positive('Attendance must be a positive number'),
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  periodStart: z.string().min(2),
  periodEnd: z.string().min(2),
  roomType: z.string().default('Any'),
  needs: z.array(z.string()).default([]),
  requestedRoom: z.string().optional(),
});

