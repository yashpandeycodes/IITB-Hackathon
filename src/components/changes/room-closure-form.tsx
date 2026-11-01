"use client";

/** Room closure (maintenance window): a `room_unavailable` change. */
import { useMemo, useState } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type { ChangeProposalRequestInput, SessionUser } from "@/lib/contracts";

import { closableRooms, kindFor } from "./change-scope";
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

export function RoomClosureForm({
  user,
  initialRoom,
  initialDay,
}: {
  user: SessionUser;
  initialRoom?: string | null;
  initialDay?: string | null;
}) {
  const { referenceData } = useReferenceData();
  const rooms = useMemo(
    () => closableRooms(user, referenceData),
    [user, referenceData],
  );
  const calendar = calendarOptions(referenceData.calendar);

  const [roomChoice, setRoomChoice] = useState(initialRoom ?? "");
  const [days, setDays] = useState<string[]>(
    initialDay && calendar.days.includes(initialDay) ? [initialDay] : [],
  );
  const [periodChoice, setPeriodChoice] = useState<number[] | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  if (rooms.length === 0) {
    return (
      <Notice tone="warning">
        {user.role === "department_coordinator"
          ? `Coordinators can close only their department's labs, and ${user.department ?? "your department"} has none. Ask an admin to close other rooms.`
          : "There are no rooms you can close."}
      </Notice>
    );
  }

  const roomId = rooms.some((r) => r.id === roomChoice) ? roomChoice : "";
  const periods = periodChoice ?? calendar.periods;
  const blockedReason = !roomId
    ? "Choose a room."
    : days.length === 0
      ? "Choose at least one day."
      : periods.length === 0
        ? "Choose at least one period."
        : null;

  const body: ChangeProposalRequestInput | null = blockedReason
    ? null
    : {
        kind: kindFor(user, "disruption"),
        description: note.trim() || undefined,
        changes: [
          {
            type: "room_unavailable",
            room_id: roomId,
            days: calendar.days.filter((d) => days.includes(d)),
            periods: [...periods].sort((a, b) => a - b),
            reason: reason.trim() || undefined,
          },
        ],
      };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        Close a room for maintenance. Classes held there in those periods move
        to another suitable room first, and change time only if they must.
      </p>
      {user.role === "department_coordinator" ? (
        <Notice>
          You can close {user.department ?? "your department"}&apos;s labs.
          Other rooms are closed by an admin.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Room" htmlFor="closure-room">
          <select
            id="closure-room"
            value={roomId}
            onChange={(e) => setRoomChoice(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Choose a room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.name} ({r.type.replace(/_/g, " ")}, {r.capacity}{" "}
                seats)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" htmlFor="closure-reason">
          <input
            id="closure-reason"
            type="text"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Water leak repair"
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
      <NoteField id="closure-note" value={note} onChange={setNote} />
      <ProposalActions body={body} blockedReason={blockedReason} />
    </div>
  );
}
