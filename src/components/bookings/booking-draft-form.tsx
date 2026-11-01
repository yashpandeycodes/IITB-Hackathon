"use client";

import { HelpCircle, Info, Plus, Trash2, X } from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";

import {
  Feature,
  RoomType,
  type CalendarPeriod,
  type Day,
  type Need,
  type ReferenceRoom,
  type ReferenceStudentGroup,
  type SessionUser,
} from "@/lib/contracts";
import { formatDay } from "@/lib/format";

import {
  NEED_LABEL,
  NEED_OPTIONS,
  ROOM_TYPE_LABEL,
  periodOptionLabel,
  roleLabel,
  type DraftField,
  type DraftFormState,
  type DraftWindowForm,
  type FieldErrors,
} from "./booking-utils";

const inputClass =
  "w-full rounded-xl border bg-[#101A2B] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#66E3F0] disabled:opacity-60";

function borderFor(messages: string[] | undefined): string {
  return messages && messages.length > 0
    ? "border-rose-500/60"
    : "border-white/10";
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block font-mono text-[11px] text-[#98A6BB] uppercase"
    >
      {children}
    </label>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 font-mono text-[11px] text-[#98A6BB] uppercase">
      {children}
    </div>
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5" role="alert">
      {messages.map((m) => (
        <li key={m} className="font-mono text-[11px] text-rose-300">
          {m}
        </li>
      ))}
    </ul>
  );
}

function ToggleChip({
  selected,
  onClick,
  children,
  disabled,
  tone = "default",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: "default" | "warning";
}) {
  const selectedClass =
    tone === "warning"
      ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
      : "border-[#66E3F0]/50 bg-[#66E3F0]/15 text-[#66E3F0]";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-60 ${
        selected
          ? selectedClass
          : "border-white/10 bg-white/5 text-[#98A6BB] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function windowLength(w: DraftWindowForm): number {
  return w.to_period - w.from_period + 1;
}

export type BookingDraftFormProps = {
  value: DraftFormState;
  onChange: (next: DraftFormState, field: DraftField) => void;
  errors: FieldErrors;
  rooms: readonly ReferenceRoom[];
  /** Every student group (selected ones outside `allowedGroups` stay removable). */
  groups: readonly ReferenceStudentGroup[];
  allowedGroupIds: ReadonlySet<string>;
  user: SessionUser;
  days: readonly Day[];
  periods: readonly CalendarPeriod[];
  disabled?: boolean;
};

/** The editable booking draft, shared by the plain-language and the manual path. */
export function BookingDraftForm({
  value,
  onChange,
  errors,
  rooms,
  groups,
  allowedGroupIds,
  user,
  days,
  periods,
  disabled,
}: BookingDraftFormProps) {
  const id = useId();
  const maxPeriod = periods.length > 0 ? periods[periods.length - 1].id : 13;

  const set = <K extends DraftField>(field: K, next: DraftFormState[K]) =>
    onChange({ ...value, [field]: next }, field);

  // Room types and needs offered: what the campus's rooms actually have, plus anything the
  // parser already put in the draft.
  const roomTypeOptions = useMemo(() => {
    const present = new Set<string>(rooms.map((r) => r.type));
    const options = RoomType.options.filter(
      (t) => present.size === 0 || present.has(t),
    );
    for (const t of value.room_types) if (!options.includes(t)) options.push(t);
    return options;
  }, [rooms, value.room_types]);

  const needOptions = useMemo(() => {
    const present = new Set<string>(rooms.flatMap((r) => r.features));
    const options: Need[] = NEED_OPTIONS.filter(
      (n) =>
        n === "accessible" ||
        present.size === 0 ||
        (Feature.safeParse(n).success && present.has(n)),
    );
    for (const n of value.needs) if (!options.includes(n)) options.push(n);
    return options;
  }, [rooms, value.needs]);

  const groupOptions = useMemo(
    () =>
      groups.filter(
        (g) =>
          allowedGroupIds.has(g.id) ||
          value.mandatory_for_groups.includes(g.id),
      ),
    [groups, allowedGroupIds, value.mandatory_for_groups],
  );
  const unknownSelectedGroups = value.mandatory_for_groups.filter(
    (g) => !groups.some((x) => x.id === g),
  );

  const setDuration = (raw: string) => {
    const duration = raw === "" ? null : Number(raw);
    // Widen windows that are now too short, so the manual path doesn't trip over it.
    const windows =
      duration === null
        ? value.windows
        : value.windows.map((w) =>
            windowLength(w) >= duration
              ? w
              : {
                  ...w,
                  to_period: Math.min(maxPeriod, w.from_period + duration - 1),
                },
          );
    onChange(
      { ...value, duration_periods: duration, windows },
      "duration_periods",
    );
  };

  const setWindow = (index: number, patch: Partial<DraftWindowForm>) => {
    const windows = value.windows.map((w, i) => {
      if (i !== index) return w;
      const next = { ...w, ...patch };
      if (patch.from_period !== undefined && next.to_period < next.from_period)
        next.to_period = Math.min(
          maxPeriod,
          next.from_period + (value.duration_periods ?? 1) - 1,
        );
      return next;
    });
    set("windows", windows);
  };

  const addWindow = () => {
    const last = value.windows[value.windows.length - 1];
    const duration = value.duration_periods ?? 1;
    const day = last
      ? (days.find((d) => !value.windows.some((w) => w.day === d)) ?? last.day)
      : (days[0] ?? "MON");
    const from = last?.from_period ?? 10;
    set("windows", [
      ...value.windows,
      {
        day,
        from_period: from,
        to_period: Math.min(maxPeriod, from + duration - 1),
      },
    ]);
  };

  const setRequestedRoom = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    const type = room ? RoomType.safeParse(room.type) : undefined;
    const roomTypes =
      type?.success && !value.room_types.includes(type.data)
        ? [...value.room_types, type.data]
        : value.room_types;
    onChange(
      {
        ...value,
        requested_room: roomId === "" ? null : roomId,
        room_types: roomTypes,
      },
      "requested_room",
    );
  };

  const requestedRoomKnown =
    value.requested_room === null ||
    rooms.length === 0 ||
    rooms.some((r) => r.id === value.requested_room);

  return (
    <div className="space-y-5">
      {/* Follow-up question and assumptions from the parser */}
      {value.follow_up ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-3.5">
          <div className="flex items-start gap-2 font-mono text-xs text-amber-200">
            <HelpCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
              aria-hidden="true"
            />
            <span>
              <span className="font-bold text-amber-300">Question: </span>
              {value.follow_up}
              <span className="mt-0.5 block text-[10px] text-amber-200/70">
                Answer it by editing the fields below.
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => set("follow_up", null)}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] text-amber-200 hover:bg-amber-500/20"
          >
            Done
          </button>
        </div>
      ) : null}

      {value.assumptions.length > 0 ? (
        <div>
          <GroupLabel>
            Assumptions made (check them, remove when wrong)
          </GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {value.assumptions.map((a, i) => (
              <span
                key={`${i}-${a}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 py-0.5 pr-1 pl-2 font-mono text-[10px] text-amber-200"
              >
                <Info className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="break-words">{a}</span>
                <button
                  type="button"
                  aria-label={`Remove assumption: ${a}`}
                  disabled={disabled}
                  onClick={() =>
                    set(
                      "assumptions",
                      value.assumptions.filter((_, j) => j !== i),
                    )
                  }
                  className="rounded-full p-0.5 hover:bg-amber-500/30"
                >
                  <X className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-title`}>Event title</FieldLabel>
          <input
            id={`${id}-title`}
            type="text"
            value={value.title}
            maxLength={200}
            disabled={disabled}
            placeholder="e.g. Quiz prelims"
            onChange={(e) => set("title", e.target.value)}
            className={`${inputClass} ${borderFor(errors.title)}`}
          />
          <FieldError messages={errors.title} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-attendance`}>
            Expected attendance
          </FieldLabel>
          <input
            id={`${id}-attendance`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value.attendance}
            disabled={disabled}
            placeholder="e.g. 120"
            onChange={(e) => set("attendance", e.target.value)}
            className={`${inputClass} ${borderFor(errors.attendance)}`}
          />
          <FieldError messages={errors.attendance} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-duration`}>
            Duration (1 period = 1 hour)
          </FieldLabel>
          <select
            id={`${id}-duration`}
            value={value.duration_periods ?? ""}
            disabled={disabled}
            onChange={(e) => setDuration(e.target.value)}
            className={`${inputClass} ${borderFor(errors.duration_periods)}`}
          >
            {value.duration_periods === null ? (
              <option value="">Choose…</option>
            ) : null}
            {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} period{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <FieldError messages={errors.duration_periods} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-room`}>
            Preferred room (optional)
          </FieldLabel>
          <select
            id={`${id}-room`}
            value={value.requested_room ?? ""}
            disabled={disabled}
            onChange={(e) => setRequestedRoom(e.target.value)}
            className={`${inputClass} ${borderFor(errors.requested_room)}`}
          >
            <option value="">Any suitable room</option>
            {!requestedRoomKnown && value.requested_room ? (
              <option value={value.requested_room}>
                {value.requested_room} (unknown room)
              </option>
            ) : null}
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.name} · {r.capacity} seats
              </option>
            ))}
          </select>
          <FieldError messages={errors.requested_room} />
        </div>
      </div>

      <div>
        <GroupLabel>
          When you can hold it (the engine picks inside these)
        </GroupLabel>
        <p className="mb-1.5 font-mono text-[10px] text-[#98A6BB] sm:hidden">
          Each window: day, then from (start time) and to (end time).
        </p>
        <div className="space-y-2">
          {value.windows.length > 0 ? (
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 font-mono text-[10px] text-[#98A6BB] sm:grid">
              <span>Day</span>
              <span>From (start)</span>
              <span>To (end)</span>
              <span className="w-[34px]" aria-hidden="true" />
            </div>
          ) : null}
          {value.windows.map((w, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <select
                aria-label={`Window ${i + 1} day`}
                value={w.day}
                disabled={disabled}
                onChange={(e) => setWindow(i, { day: e.target.value as Day })}
                className={`${inputClass} ${borderFor(errors.windows)} order-1 col-span-2 sm:order-none sm:col-span-1`}
              >
                {(days.includes(w.day) ? days : [w.day, ...days]).map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Window ${i + 1} from period`}
                value={w.from_period}
                disabled={disabled}
                onChange={(e) =>
                  setWindow(i, { from_period: Number(e.target.value) })
                }
                className={`${inputClass} ${borderFor(errors.windows)} order-3 sm:order-none`}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {periodOptionLabel(p, "start")}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Window ${i + 1} to period`}
                value={w.to_period}
                disabled={disabled}
                onChange={(e) =>
                  setWindow(i, { to_period: Number(e.target.value) })
                }
                className={`${inputClass} ${borderFor(errors.windows)} order-3 sm:order-none`}
              >
                {periods
                  .filter((p) => p.id >= w.from_period)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {periodOptionLabel(p, "end")}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                aria-label={`Remove window ${i + 1}`}
                disabled={disabled}
                onClick={() =>
                  set(
                    "windows",
                    value.windows.filter((_, j) => j !== i),
                  )
                }
                className="order-2 rounded-xl border border-white/10 bg-white/5 p-2 text-[#98A6BB] hover:text-rose-300 sm:order-none"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {value.windows.length < 20 ? (
            <button
              type="button"
              onClick={addWindow}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-1.5 font-mono text-[11px] text-[#66E3F0] hover:bg-white/5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add a time window
            </button>
          ) : null}
        </div>
        <FieldError messages={errors.windows} />
      </div>

      <div>
        <GroupLabel>Acceptable room types</GroupLabel>
        <div className="flex flex-wrap gap-1.5">
          {roomTypeOptions.map((t) => (
            <ToggleChip
              key={t}
              selected={value.room_types.includes(t)}
              disabled={disabled}
              onClick={() => set("room_types", toggle(value.room_types, t))}
            >
              {ROOM_TYPE_LABEL[t]}
            </ToggleChip>
          ))}
        </div>
        <FieldError messages={errors.room_types} />
      </div>

      <div>
        <GroupLabel>Needs</GroupLabel>
        <div className="flex flex-wrap gap-1.5">
          {needOptions.map((n) => (
            <ToggleChip
              key={n}
              selected={value.needs.includes(n)}
              disabled={disabled}
              onClick={() => set("needs", toggle(value.needs, n))}
            >
              {NEED_LABEL[n]}
            </ToggleChip>
          ))}
        </div>
        <FieldError messages={errors.needs} />
      </div>

      <div>
        <GroupLabel>
          Repeat on other days too (each becomes its own request)
        </GroupLabel>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => {
            const isWindowDay = value.windows.some((w) => w.day === d);
            return (
              <ToggleChip
                key={d}
                selected={value.repeat_days.includes(d) && !isWindowDay}
                disabled={disabled || isWindowDay}
                onClick={() => set("repeat_days", toggle(value.repeat_days, d))}
              >
                {formatDay(d)}
              </ToggleChip>
            );
          })}
        </div>
        <FieldError messages={errors.repeat_days} />
      </div>

      <div>
        <GroupLabel>Compulsory for student groups</GroupLabel>
        {groupOptions.length === 0 && unknownSelectedGroups.length === 0 ? (
          <p className="font-mono text-[11px] text-[#98A6BB]">
            {user.role === "club"
              ? "Club events can't be made compulsory for student groups."
              : `As ${roleLabel(user.role)}${user.department ? ` (${user.department})` : " without a department"}, you can't make an event compulsory for any group.`}
          </p>
        ) : (
          <>
            {user.role !== "admin" ? (
              <p className="mb-1.5 font-mono text-[10px] text-[#98A6BB]">
                {user.role === "club"
                  ? "Clubs can't name compulsory groups; remove these before submitting."
                  : `You can name ${user.department ?? "your department's"} groups only.`}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {groupOptions.map((g) => {
                const allowed = allowedGroupIds.has(g.id);
                return (
                  <ToggleChip
                    key={g.id}
                    selected={value.mandatory_for_groups.includes(g.id)}
                    tone={allowed ? "default" : "warning"}
                    disabled={
                      disabled ||
                      (!allowed && !value.mandatory_for_groups.includes(g.id))
                    }
                    onClick={() =>
                      set(
                        "mandatory_for_groups",
                        toggle(value.mandatory_for_groups, g.id),
                      )
                    }
                  >
                    {g.id}
                    <span className="ml-1 text-[10px] opacity-70">
                      {g.size}
                    </span>
                  </ToggleChip>
                );
              })}
              {unknownSelectedGroups.map((g) => (
                <ToggleChip
                  key={g}
                  selected
                  tone="warning"
                  disabled={disabled}
                  onClick={() =>
                    set(
                      "mandatory_for_groups",
                      toggle(value.mandatory_for_groups, g),
                    )
                  }
                >
                  {g} (unknown)
                </ToggleChip>
              ))}
            </div>
          </>
        )}
        <FieldError messages={errors.mandatory_for_groups} />
      </div>
    </div>
  );
}
