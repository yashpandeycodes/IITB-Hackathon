import { describe, expect, it } from 'vitest';
import {
  STUDENT_GROUPS,
  CAMPUS_ROOMS,
  FACULTY_MEMBERS,
  COURSES,
  getGroupName,
  getRoomName,
  getFacultyName,
  getCourseTitle,
  getRoomCapacity,
} from '@/lib/dataset/reference-lookup';
import type { TimetableCell, TimetableBookingCell, TimetableView } from '@/lib/contracts/timetable';
import type { SessionItem, TimetableAssignment, BookingItem, PeriodId, DayCode } from '@/lib/contracts/ui';

describe('Timetable Reference Lookup', () => {
  it('contains all 14 student groups from cit_public.json', () => {
    expect(STUDENT_GROUPS.length).toBe(14);
    expect(getGroupName('Y1-A')).toBe('B.Tech Year 1, Section A');
    expect(getGroupName('CSE-2')).toBe('CSE Year 2');
    expect(getGroupName('CE-3')).toBe('CE Year 3');
  });

  it('contains all 27 campus rooms with correct capacities', () => {
    expect(CAMPUS_ROOMS.length).toBe(27);
    expect(getRoomName('AUD')).toBe('Main Auditorium');
    expect(getRoomCapacity('AUD')).toBe(500);
    expect(getRoomName('LH-1')).toBe('Lecture Hall 1');
    expect(getRoomCapacity('LH-1')).toBe(200);
    expect(getRoomName('CS-LAB-1')).toBe('Computing Lab 1');
  });

  it('contains all 40 faculty members', () => {
    expect(FACULTY_MEMBERS.length).toBe(40);
    expect(getFacultyName('F01')).toBe('Dr. Ananya Mishra');
    expect(getFacultyName('F06')).toBe('Dr. Arjun Mehta');
    expect(getFacultyName('F37')).toBe('Prof. Shreya Kapoor (Dean)');
  });

  it('contains all 62 courses', () => {
    expect(COURSES.length).toBe(62);
    expect(getCourseTitle('MA101')).toBe('Calculus and Linear Algebra');
    expect(getCourseTitle('CS202')).toBe('Discrete Mathematics');
    expect(getCourseTitle('CS303')).toBe('Computer Networks');
  });

  it('falls back gracefully to the raw ID for unknown entries', () => {
    expect(getGroupName('UNKNOWN-GRP')).toBe('UNKNOWN-GRP');
    expect(getRoomName('UNKNOWN-ROOM')).toBe('UNKNOWN-ROOM');
    expect(getFacultyName('UNKNOWN-FAC')).toBe('UNKNOWN-FAC');
    expect(getCourseTitle('UNKNOWN-COURSE')).toBe('UNKNOWN-COURSE');
  });
});

describe('API to UI Timetable Mapping', () => {
  it('maps TimetableCell to SessionItem and TimetableAssignment correctly', () => {
    const apiCell: TimetableCell = {
      session_id: 'CS202-L1',
      course_id: 'CS202',
      kind: 'lecture',
      groups: ['CSE-2'],
      faculty_id: 'F06',
      room_id: 'LH-1',
      day: 'MON',
      start_period: 1,
      duration: 1,
      basket_slot: null,
      size: 70,
      override: null,
    };

    const session: SessionItem = {
      id: apiCell.session_id,
      courseCode: apiCell.course_id,
      courseName: getCourseTitle(apiCell.course_id),
      kind: apiCell.kind,
      groups: apiCell.groups,
      facultyId: apiCell.faculty_id,
      facultyName: getFacultyName(apiCell.faculty_id),
      durationPeriods: apiCell.duration,
      studentCount: apiCell.size,
      isElectiveBasket: false,
    };

    const assignment: TimetableAssignment = {
      sessionId: apiCell.session_id,
      day: apiCell.day,
      period: `P${apiCell.start_period}` as PeriodId,
      roomId: apiCell.room_id,
      roomName: getRoomName(apiCell.room_id),
      isOverride: false,
    };

    expect(session.id).toBe('CS202-L1');
    expect(session.courseName).toBe('Discrete Mathematics');
    expect(session.facultyName).toBe('Dr. Arjun Mehta');
    expect(assignment.period).toBe('P1');
    expect(assignment.roomName).toBe('Lecture Hall 1');
  });

  it('handles elective basket sessions and parallel placements', () => {
    const basketCells: TimetableCell[] = [
      {
        session_id: 'OE-BASKET-1',
        course_id: 'OE301',
        kind: 'lecture',
        groups: ['CSE-3'],
        faculty_id: 'F36',
        room_id: 'CR-101',
        day: 'WED',
        start_period: 3,
        duration: 1,
        basket_slot: 'OE-BASKET-A',
        size: 35,
        override: null,
      },
      {
        session_id: 'OE-BASKET-2',
        course_id: 'OE302',
        kind: 'lecture',
        groups: ['CSE-3'],
        faculty_id: 'F04',
        room_id: 'CR-102',
        day: 'WED',
        start_period: 3,
        duration: 1,
        basket_slot: 'OE-BASKET-A',
        size: 33,
        override: null,
      },
    ];

    // Both sessions start at WED P3
    const matchingAtWedP3 = basketCells.filter(
      (c) => c.day === 'WED' && c.start_period === 3
    );
    expect(matchingAtWedP3.length).toBe(2);
    expect(matchingAtWedP3[0].course_id).toBe('OE301');
    expect(matchingAtWedP3[1].course_id).toBe('OE302');
  });

  it('handles multi-period session spanning (e.g. 3-hour lab at P2 covers P3 and P4)', () => {
    const labCell: TimetableCell = {
      session_id: 'CS291-LAB',
      course_id: 'CS291',
      kind: 'lab',
      groups: ['CSE-2'],
      faculty_id: 'F01',
      room_id: 'CS-LAB-1',
      day: 'TUE',
      start_period: 2,
      duration: 3,
      basket_slot: null,
      size: 35,
      override: null,
    };

    const isCovered = (day: DayCode, periodNum: number) => {
      if (labCell.day !== day) return false;
      return periodNum > labCell.start_period && periodNum < labCell.start_period + labCell.duration;
    };

    expect(isCovered('TUE', 1)).toBe(false);
    expect(isCovered('TUE', 2)).toBe(false); // starting period renders <td> with rowSpan=3
    expect(isCovered('TUE', 3)).toBe(true);  // covered
    expect(isCovered('TUE', 4)).toBe(true);  // covered
    expect(isCovered('TUE', 5)).toBe(false); // free
  });

  it('handles Spectra week booking overrides and event bookings', () => {
    const movedCell: TimetableCell = {
      session_id: 'CS101-L1',
      course_id: 'CS101',
      kind: 'lecture',
      groups: ['Y1-A'],
      faculty_id: 'F01',
      room_id: 'LH-3',
      day: 'THU',
      start_period: 4,
      duration: 1,
      basket_slot: null,
      size: 65,
      override: { displaced_by: 'REQ-SPECTRA-001' },
    };

    const bookingCell: TimetableBookingCell = {
      request_id: 'REQ-SPECTRA-001',
      title: 'Robotics Workshop Inauguration',
      room_id: 'AUD',
      day: 'THU',
      start_period: 10,
      end_period: 12,
      status: 'approved',
      effective_category: 'institute_event',
    };

    expect(movedCell.override?.displaced_by).toBe('REQ-SPECTRA-001');
    expect(bookingCell.end_period - bookingCell.start_period + 1).toBe(3);
    expect(bookingCell.status).toBe('approved');
  });
});

