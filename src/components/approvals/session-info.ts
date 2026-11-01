/**
 * What the approvals screens need to know about a session (course, groups, teacher, length),
 * gathered from the reference data, the sessions a change adds and any timetable cells loaded.
 */
import type {
  ChangeRequest,
  ReferenceSession,
  SessionKind,
  TimetableCell,
} from "@/lib/contracts";

export type SessionInfo = {
  id: string;
  course_id: string;
  kind: SessionKind;
  groups: string[];
  faculty_id: string;
  duration: number;
  size: number;
};

export function buildSessionInfo(
  referenceSessions: readonly ReferenceSession[],
  change: ChangeRequest | undefined,
  cells: readonly TimetableCell[] = [],
): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>();
  for (const s of referenceSessions) {
    map.set(s.id, {
      id: s.id,
      course_id: s.course_id,
      kind: s.kind,
      groups: s.groups,
      faculty_id: s.faculty_id,
      duration: s.duration,
      size: s.size,
    });
  }
  for (const entry of change?.changes ?? []) {
    if (entry.type !== "add_session" || map.has(entry.session.id)) continue;
    const s = entry.session;
    map.set(s.id, {
      id: s.id,
      course_id: s.course_id,
      kind: s.kind,
      groups: s.groups,
      faculty_id: s.faculty_id,
      duration: s.duration,
      size: s.size,
    });
  }
  for (const c of cells) {
    if (map.has(c.session_id)) continue;
    map.set(c.session_id, {
      id: c.session_id,
      course_id: c.course_id,
      kind: c.kind,
      groups: c.groups,
      faculty_id: c.faculty_id,
      duration: c.duration,
      size: c.size,
    });
  }
  return map;
}
