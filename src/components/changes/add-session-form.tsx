"use client";

/**
 * Add a session (an extra lecture, tutorial or lab): an `add_session` change. Admins and
 * coordinators file it as a `disruption`; faculty as a `faculty_request` for a course they
 * already teach. Defaults are copied from an existing session of the same course and kind.
 */
import { useMemo, useState } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type {
  ChangeProposalRequestInput,
  ReferenceSession,
  SessionKind,
  SessionUser,
} from "@/lib/contracts";

import {
  coursesForNewSession,
  groupsForNewSession,
  kindFor,
  labTypeForDepartment,
  teachersForNewSession,
} from "./change-scope";
import { ChipToggle, Field, INPUT_CLASS, NoteField, Notice } from "./change-ui";
import { ProposalActions } from "./proposal-actions";

const KIND_LETTER: Record<SessionKind, string> = {
  lecture: "L",
  tutorial: "T",
  lab: "P",
};
const LECTURE_ROOM_TYPES = ["classroom", "lecture_hall", "auditorium"];

/** "CS202-T2": the next free id after the course's sessions of this kind. */
function suggestSessionId(
  courseId: string,
  kind: SessionKind,
  courseSessions: readonly ReferenceSession[],
  taken: ReadonlySet<string>,
): string {
  const sameKind = courseSessions.find((s) => s.kind === kind);
  const prefix = sameKind
    ? sameKind.id.replace(/\d+$/, "")
    : `${courseId}-${KIND_LETTER[kind]}`;
  let n = 1;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const rest = Number(id.slice(prefix.length));
    if (Number.isInteger(rest) && rest >= n) n = rest + 1;
  }
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export function AddSessionForm({
  user,
  initialCourse,
}: {
  user: SessionUser;
  initialCourse?: string | null;
}) {
  const { referenceData } = useReferenceData();
  const courses = useMemo(
    () =>
      [...coursesForNewSession(user, referenceData)].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true }),
      ),
    [user, referenceData],
  );
  const roomTypeOptions = useMemo(
    () => [...new Set(referenceData.rooms.map((r) => r.type))].sort(),
    [referenceData.rooms],
  );
  const takenIds = useMemo(
    () => new Set(referenceData.sessions.map((s) => s.id)),
    [referenceData.sessions],
  );

  const [courseChoice, setCourseChoice] = useState(initialCourse ?? "");
  const [kindChoice, setKindChoice] = useState<SessionKind | null>(null);
  const [facultyChoice, setFacultyChoice] = useState<string | null>(null);
  const [groupsChoice, setGroupsChoice] = useState<string[] | null>(null);
  const [sizeChoice, setSizeChoice] = useState<string | null>(null);
  const [durationChoice, setDurationChoice] = useState<number | null>(null);
  const [roomTypesChoice, setRoomTypesChoice] = useState<string[] | null>(null);
  const [idChoice, setIdChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const faculty = user.role === "faculty";
  if (faculty && !user.faculty_id) {
    return (
      <Notice tone="warning">
        Your account isn&apos;t linked to a faculty member, so you can&apos;t
        request extra sessions.
      </Notice>
    );
  }
  if (courses.length === 0) {
    return (
      <Notice tone="warning">
        {faculty
          ? "You don't teach any course in the loaded dataset, so there is nothing to add a session to."
          : "There is no course you can add a session to."}
      </Notice>
    );
  }

  const course = courses.find((c) => c.id === courseChoice) ?? null;
  const courseId = course?.id ?? "";
  const courseSessions = referenceData.sessions.filter(
    (s) => s.course_id === courseId,
  );
  const kind: SessionKind = kindChoice ?? courseSessions[0]?.kind ?? "lecture";
  const template =
    courseSessions.find((s) => s.kind === kind) ?? courseSessions[0] ?? null;
  const sameKindTemplate = template?.kind === kind ? template : null;

  const teacherOptions = course
    ? teachersForNewSession(user, referenceData, courseId)
    : [];
  const groupOptions = course
    ? groupsForNewSession(user, referenceData, courseId)
    : [];

  const facultyId = faculty
    ? (user.faculty_id ?? "")
    : facultyChoice !== null &&
        teacherOptions.some((f) => f.id === facultyChoice)
      ? facultyChoice
      : template && teacherOptions.some((f) => f.id === template.faculty_id)
        ? template.faculty_id
        : "";
  const groups =
    groupsChoice ??
    template?.groups.filter((g) => groupOptions.some((o) => o.id === g)) ??
    [];
  const groupSize = groups.reduce(
    (sum, g) => sum + (groupOptions.find((o) => o.id === g)?.size ?? 0),
    0,
  );
  const autoSize =
    sameKindTemplate && sameSet(sameKindTemplate.groups, groups)
      ? sameKindTemplate.size
      : groupSize;
  const sizeText = sizeChoice ?? (autoSize > 0 ? String(autoSize) : "");
  const size = Number(sizeText);
  const duration =
    durationChoice ?? sameKindTemplate?.duration ?? (kind === "lab" ? 3 : 1);
  const labType = course ? labTypeForDepartment(course.department) : null;
  const autoRoomTypes =
    kind === "lab"
      ? labType && roomTypeOptions.includes(labType)
        ? [labType]
        : []
      : LECTURE_ROOM_TYPES.filter((t) => roomTypeOptions.includes(t));
  const roomTypes = roomTypesChoice ?? autoRoomTypes;
  const idText =
    idChoice ??
    (course ? suggestSessionId(courseId, kind, courseSessions, takenIds) : "");
  const sessionId = idText.trim();

  const blockedReason = !course
    ? "Choose a course."
    : !sessionId
      ? "Give the new session an id."
      : sessionId.length > 64
        ? "The session id can be at most 64 characters."
        : takenIds.has(sessionId)
          ? `${sessionId} already exists: choose another id.`
          : !facultyId
            ? "Choose who teaches it."
            : groups.length === 0
              ? "Choose at least one group."
              : !Number.isInteger(size) || size < 1
                ? "Enter the number of students."
                : roomTypes.length === 0
                  ? "Choose at least one acceptable room type."
                  : null;

  const body: ChangeProposalRequestInput | null = blockedReason
    ? null
    : {
        kind: kindFor(user, "add_session"),
        description: note.trim() || undefined,
        changes: [
          {
            type: "add_session",
            session: {
              id: sessionId,
              course_id: courseId,
              kind,
              groups,
              faculty_id: facultyId,
              size,
              duration,
              room_types: roomTypes,
              needs_accessible: false,
              basket_slot: null,
              fixed_slot: null,
            },
          },
        ],
      };

  const onCourse = (id: string) => {
    setCourseChoice(id);
    setKindChoice(null);
    setFacultyChoice(null);
    setGroupsChoice(null);
    setSizeChoice(null);
    setDurationChoice(null);
    setRoomTypesChoice(null);
    setIdChoice(null);
  };
  const onKind = (next: SessionKind) => {
    setKindChoice(next);
    setDurationChoice(null);
    setRoomTypesChoice(null);
    setIdChoice(null);
    setSizeChoice(null);
  };
  const toggleGroup = (id: string) =>
    setGroupsChoice(
      groups.includes(id) ? groups.filter((g) => g !== id) : [...groups, id],
    );
  const toggleRoomType = (type: string) =>
    setRoomTypesChoice(
      roomTypes.includes(type)
        ? roomTypes.filter((t) => t !== type)
        : [...roomTypes, type],
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        {faculty
          ? "Ask for an extra session of a course you teach, for groups already on it. The engine places it where it fits, moving as few classes as possible."
          : "Add a new session. The engine places it where it fits, moving as few classes as possible."}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Course" htmlFor="add-course">
          <select
            id="add-course"
            value={courseId}
            onChange={(e) => onCourse(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Choose a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.title} ({c.department})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Session type">
          <div className="flex flex-wrap gap-1.5">
            {(["lecture", "tutorial", "lab"] as const).map((k) => (
              <ChipToggle
                key={k}
                selected={kind === k}
                onClick={() => onKind(k)}
                disabled={!course}
              >
                {k}
              </ChipToggle>
            ))}
          </div>
        </Field>
      </div>

      {course ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Session id"
              htmlFor="add-id"
              hint="Suggested from the course's other sessions."
            >
              <input
                id="add-id"
                type="text"
                maxLength={64}
                value={idText}
                onChange={(e) => setIdChoice(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Taught by" htmlFor="add-faculty">
              {faculty ? (
                <div className={INPUT_CLASS}>{facultyId} (you)</div>
              ) : (
                <select
                  id="add-faculty"
                  value={facultyId}
                  onChange={(e) => setFacultyChoice(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Choose a faculty member…</option>
                  {teacherOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} · {f.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Students" htmlFor="add-size">
                <input
                  id="add-size"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={sizeText}
                  onChange={(e) => setSizeChoice(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Periods" htmlFor="add-duration">
                <select
                  id="add-duration"
                  value={duration}
                  onChange={(e) => setDurationChoice(Number(e.target.value))}
                  className={INPUT_CLASS}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <Field
            label="Groups attending"
            hint={
              faculty
                ? "Only groups already taking this course."
                : groups.length > 0
                  ? `${groups.length} selected · ${groupSize} students`
                  : undefined
            }
          >
            {groupOptions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {groupOptions.map((g) => (
                  <ChipToggle
                    key={g.id}
                    selected={groups.includes(g.id)}
                    onClick={() => toggleGroup(g.id)}
                    title={`${g.name} · ${g.size} students`}
                  >
                    {g.id}
                  </ChipToggle>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-300">
                No group can attend a new session of this course.
              </p>
            )}
          </Field>

          <Field label="Acceptable room types">
            <div className="flex flex-wrap gap-1.5">
              {roomTypeOptions.map((t) => (
                <ChipToggle
                  key={t}
                  selected={roomTypes.includes(t)}
                  onClick={() => toggleRoomType(t)}
                >
                  {t.replace(/_/g, " ")}
                </ChipToggle>
              ))}
            </div>
          </Field>
        </>
      ) : null}

      <NoteField id="add-note" value={note} onChange={setNote} />
      <ProposalActions body={body} blockedReason={blockedReason} />
    </div>
  );
}
