"use client";

/**
 * Pin one session at a day, start period and room. Admins and coordinators file it with
 * `POST /api/manual/place` (a `manual_edit` request); faculty ask for a move of one of their own
 * sessions (`faculty_request` with a placement). Hard rules are checked live with the what-if
 * `POST /api/timetable/check` before anything is filed.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, OctagonAlert } from "lucide-react";

import { HardRuleChip } from "@/components/semantic/badges";
import { useReferenceData } from "@/hooks/use-reference-data";
import { apiGet, checkTimetable, placeManually } from "@/lib/api-client";
import {
  TimetableViewSchema,
  type Assignment,
  type ChangeProposalRequestInput,
  type Day,
  type SessionUser,
  type Violation,
} from "@/lib/contracts";

import { errorMessage } from "./api-errors";
import { formatDelta, formatSlot, ruleLabel } from "./change-format";
import { isStaff, sessionsInScope } from "./change-scope";
import {
  Field,
  INPUT_CLASS,
  NoteField,
  Notice,
  calendarOptions,
} from "./change-ui";
import { ProposalActions } from "./proposal-actions";
import { SessionSelect } from "./session-select";

const violationKey = (v: Violation) => `${v.rule}|${v.where}|${v.detail}`;
const MAX_SHOWN = 12;

export function MoveSessionForm({
  user,
  initialSession,
}: {
  user: SessionUser;
  initialSession?: string | null;
}) {
  const { referenceData } = useReferenceData();
  const sessions = useMemo(
    () => sessionsInScope(user, referenceData),
    [user, referenceData],
  );
  const calendar = calendarOptions(referenceData.calendar);
  const rooms = useMemo(
    () =>
      [...referenceData.rooms].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true }),
      ),
    [referenceData.rooms],
  );

  const [sessionChoice, setSessionChoice] = useState(initialSession ?? "");
  const [day, setDay] = useState("");
  const [period, setPeriod] = useState("");
  const [roomId, setRoomId] = useState("");
  const [repairChoice, setRepairChoice] = useState<boolean | null>(null);
  const [note, setNote] = useState("");

  const staff = isStaff(user);
  const session = sessions.find((s) => s.id === sessionChoice) ?? null;
  const placement: Assignment | null =
    session && day && period && roomId
      ? {
          session_id: session.id,
          day: day as Day,
          start_period: Number(period),
          room_id: roomId,
        }
      : null;

  // Where the session sits now (its teacher's week in the active timetable).
  const current = useQuery({
    queryKey: ["change-form", "faculty-week", session?.faculty_id ?? ""],
    queryFn: ({ signal }) =>
      apiGet(
        `/api/timetable?view=faculty&id=${encodeURIComponent(session?.faculty_id ?? "")}`,
        TimetableViewSchema,
        { signal },
      ),
    enabled: session !== null,
    staleTime: 30_000,
  });
  const currentCell =
    session && current.data
      ? (current.data.cells.find((c) => c.session_id === session.id) ?? null)
      : null;

  // Violations already in the active timetable, so only the new ones are shown.
  const baseline = useQuery({
    queryKey: ["change-form", "check-baseline"],
    queryFn: ({ signal }) => checkTimetable({ assignments: [] }, { signal }),
    staleTime: 60_000,
    retry: false,
  });
  const check = useQuery({
    queryKey: ["change-form", "check", placement],
    queryFn: ({ signal }) =>
      checkTimetable({ assignments: placement ? [placement] : [] }, { signal }),
    enabled: placement !== null && baseline.isSuccess,
    staleTime: 15_000,
    retry: false,
  });
  const newViolations = useMemo(() => {
    if (!check.data || !baseline.data) return null;
    const known = new Set(baseline.data.violations.map(violationKey));
    return check.data.violations.filter((v) => !known.has(violationKey(v)));
  }, [check.data, baseline.data]);

  if (user.role === "faculty" && !user.faculty_id) {
    return (
      <Notice tone="warning">
        Your account isn&apos;t linked to a faculty member, so you can&apos;t
        ask to move a session.
      </Notice>
    );
  }
  if (sessions.length === 0) {
    return <Notice tone="warning">There are no sessions you can move.</Notice>;
  }

  const unchanged =
    placement !== null &&
    currentCell !== null &&
    currentCell.day === placement.day &&
    currentCell.start_period === placement.start_period &&
    currentCell.room_id === placement.room_id;
  const breaksRules = (newViolations?.length ?? 0) > 0;
  const repair = repairChoice ?? breaksRules;

  const blockedReason = !session
    ? "Choose a session."
    : !day || !period || !roomId
      ? "Choose the day, start period and room."
      : unchanged
        ? "That is where the session already is."
        : null;

  const body: ChangeProposalRequestInput | null =
    blockedReason || !placement
      ? null
      : {
          kind: staff ? "manual_edit" : "faculty_request",
          description: note.trim() || undefined,
          placements: [placement],
        };

  const submit =
    staff && placement
      ? () =>
          placeManually({
            ...placement,
            repair,
            description: note.trim() || undefined,
          })
      : undefined;

  const checkPending =
    placement !== null &&
    newViolations === null &&
    !check.isError &&
    !baseline.isError;
  const submitBlockedReason =
    staff && checkPending && !repair
      ? "Waiting for the hard-constraint check…"
      : staff && breaksRules && !repair
        ? "This slot breaks hard rules as the timetable stands: tick “move what's in the way” or pick a free slot."
        : null;

  const isLab = session?.kind === "lab";
  const labStarts = referenceData.calendar.lab_start_periods;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#98A6BB]">
        {staff
          ? "Place one session exactly where you want it. Hard rules are checked as you choose; an admin approves the result before it goes live."
          : "Ask to move one of your sessions to another slot. Hard rules are checked as you choose; an admin approves the move."}
      </p>

      <Field label="Session" htmlFor="move-session">
        <SessionSelect
          id="move-session"
          sessions={sessions}
          value={session?.id ?? ""}
          onChange={(id) => {
            setSessionChoice(id);
            setRepairChoice(null);
          }}
        />
      </Field>

      {session ? (
        <div className="rounded-2xl border border-white/10 bg-[#101A2B] p-3 font-mono text-[11px] text-[#98A6BB]">
          {session.kind} · {session.groups.join(", ")} · {session.size} students
          · {session.duration} period
          {session.duration === 1 ? "" : "s"}
          {session.basket_slot
            ? ` · basket ${session.basket_slot} (its whole basket moves with it)`
            : ""}
          <div className="mt-1 text-white/90">
            Now:{" "}
            {current.isLoading
              ? "loading…"
              : current.isError
                ? "couldn't load the current slot"
                : currentCell
                  ? formatSlot(
                      {
                        day: currentCell.day,
                        start_period: currentCell.start_period,
                        room_id: currentCell.room_id,
                      },
                      currentCell.duration,
                    )
                  : "not placed in the active timetable"}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Day" htmlFor="move-day">
          <select
            id="move-day"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setRepairChoice(null);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Day…</option>
            {calendar.days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Start period"
          htmlFor="move-period"
          hint={
            isLab && labStarts.length > 0
              ? `Labs start at ${labStarts.map((p) => `P${p}`).join(" or ")}.`
              : undefined
          }
        >
          <select
            id="move-period"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setRepairChoice(null);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Period…</option>
            {calendar.periods.map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room" htmlFor="move-room">
          <select
            id="move-room"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setRepairChoice(null);
            }}
            className={INPUT_CLASS}
          >
            <option value="">Room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.type.replace(/_/g, " ")} · {r.capacity} seats
                {session && r.capacity < session.size ? " (too small)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {placement && !unchanged ? (
        <section
          aria-live="polite"
          aria-label="Hard-constraint check"
          className="rounded-2xl border border-white/10 bg-[#070A12]/60 p-3"
        >
          {baseline.isError || check.isError ? (
            <p className="text-xs text-rose-300">
              Couldn&apos;t check this slot:{" "}
              {errorMessage(baseline.error ?? check.error, "the check failed.")}
            </p>
          ) : !newViolations ? (
            <p className="flex items-center gap-2 font-mono text-xs text-[#98A6BB]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Checking hard constraints…
            </p>
          ) : newViolations.length === 0 ? (
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-emerald-300">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              The slot is free: no hard rule is broken.
              {check.data?.soft_delta !== null &&
              check.data?.soft_delta !== undefined ? (
                <span className="text-[#98A6BB]">
                  Soft penalty {formatDelta(check.data.soft_delta)}
                </span>
              ) : null}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-xs text-rose-200">
                <OctagonAlert
                  className="mt-0.5 size-4 shrink-0 text-rose-400"
                  aria-hidden="true"
                />
                <span>
                  This slot would break {newViolations.length} hard rule
                  {newViolations.length === 1 ? "" : "s"} as the timetable
                  stands.{" "}
                  {staff
                    ? "Pick another slot, or let the engine move what's in the way."
                    : "The engine will try to move what's in the way; the preview shows exactly what."}
                </span>
              </p>
              <ul className="space-y-1">
                {newViolations.slice(0, MAX_SHOWN).map((v) => (
                  <li
                    key={violationKey(v)}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-white/85"
                  >
                    <HardRuleChip code={v.rule} label={ruleLabel(v.rule)} />
                    <span className="break-words">{v.detail}</span>
                  </li>
                ))}
              </ul>
              {newViolations.length > MAX_SHOWN ? (
                <p className="font-mono text-[10px] text-[#98A6BB]">
                  … and {newViolations.length - MAX_SHOWN} more
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {staff ? (
        <label className="flex items-start gap-2 text-xs text-white/90">
          <input
            type="checkbox"
            checked={repair}
            onChange={(e) => setRepairChoice(e.target.checked)}
            className="mt-0.5 accent-[#66E3F0]"
          />
          <span>
            Move what&apos;s in the way (repair)
            <span className="block text-[11px] text-[#98A6BB]">
              Off: the slot must be free as it is. On: sessions blocking it
              move, using the fewest moves.
            </span>
          </span>
        </label>
      ) : null}

      <NoteField id="move-note" value={note} onChange={setNote} />
      <ProposalActions
        body={body}
        blockedReason={blockedReason}
        submit={submit}
        submitBlockedReason={submitBlockedReason}
      />
    </div>
  );
}
