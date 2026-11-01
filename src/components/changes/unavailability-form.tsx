"use client";

/** Faculty unavailability (leave): a `faculty_unavailable` change for one faculty member. */
import { useMemo, useState } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type { ChangeProposalRequestInput, SessionUser } from "@/lib/contracts";

import { facultyInScope, kindFor } from "./change-scope";
import {
  DayPicker,
  Field,
  INPUT_CLASS,
  NoteField,
  Notice,
  PeriodPicker,
  calendarOptions,
} from "./change-ui";
import { ProposalActions } from "./proposal-actions";

export function UnavailabilityForm({
  user,
  initialFaculty,
  initialDay,
}: {
  user: SessionUser;
  initialFaculty?: string | null;
  initialDay?: string | null;
}) {
  const { referenceData } = useReferenceData();
  const options = useMemo(
    () =>
      [...facultyInScope(user, referenceData)].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true }),
      ),
    [user, referenceData],
  );
  const calendar = calendarOptions(referenceData.calendar);

  const [facultyChoice, setFacultyChoice] = useState(initialFaculty ?? "");
  const [days, setDays] = useState<string[]>(
    initialDay && calendar.days.includes(initialDay) ? [initialDay] : [],
  );
  const [periodChoice, setPeriodChoice] = useState<number[] | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const self = user.role === "faculty";
  const facultyId = self
    ? (user.faculty_id ?? "")
    : options.some((f) => f.id === facultyChoice)
      ? facultyChoice
      : "";
  const periods = periodChoice ?? calendar.periods;

  if (self && !user.faculty_id) {
    return (
      <Notice tone="warning">
        Your account isn&apos;t linked to a faculty member, so you can&apos;t
        mark unavailability. Ask an admin to link it.
      </Notice>
    );
  }
  if (!self && options.length === 0) {
    return (
      <Notice tone="warning">
        There is no faculty member you can mark unavailable
        {user.department ? ` in ${user.department}` : ""}.
      </Notice>
    );
  }

  const blockedReason = !facultyId
    ? "Choose a faculty member."
    : days.length === 0
      ? "Choose at least one day."
      : periods.length === 0
        ? "Choose at least one period."
        : null;

  const body: ChangeProposalRequestInput | null = blockedReason
    ? null
    : {
        kind: kindFor(user, "unavailability"),
        description: note.trim() || undefined,
        changes: [
          {
            type: "faculty_unavailable",
            faculty_id: facultyId,
            days: calendar.days.filter((d) => days.includes(d)),
            periods: [...periods].sort((a, b) => a - b),
            reason: reason.trim() || undefined,
          },
        ],
      };

  const me = options.find((f) => f.id === facultyId);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        Mark when a faculty member can&apos;t teach. Every week from then on,
        their classes in those periods move, using the fewest moves possible.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Faculty member" htmlFor="unavail-faculty">
          {self ? (
            <div className={INPUT_CLASS}>
              {facultyId}
              {me ? ` · ${me.name}` : ""}
            </div>
          ) : (
            <select
              id="unavail-faculty"
              value={facultyId}
              onChange={(e) => setFacultyChoice(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Choose a faculty member…</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} · {f.name}
                  {f.department ? ` (${f.department})` : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Reason" htmlFor="unavail-reason">
          <input
            id="unavail-reason"
            type="text"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Conference travel every Monday"
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field label="Days">
        <DayPicker days={calendar.days} value={days} onChange={setDays} />
      </Field>
      <Field label="Periods">
        <PeriodPicker
          periods={calendar.periods}
          value={periods}
          onChange={setPeriodChoice}
          lunchAfter={calendar.lunchAfter}
        />
      </Field>
      <NoteField id="unavail-note" value={note} onChange={setNote} />

      <ProposalActions
        body={body}
        blockedReason={blockedReason}
        hint={
          user.role === "admin"
            ? "Filed as an admin change: you can approve it yourself after reviewing the moves."
            : "An admin reviews the moves before anything changes."
        }
      />
    </div>
  );
}
