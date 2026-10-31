/**
 * Deterministic post-processing (backend.md §5.3), the same for LLM and rule extractions:
 * clamp windows to the calendar, resolve rooms and groups against the campus (never inventing
 * an id), add implied needs, derive room types, fill attendance from compulsory groups, then
 * compute `missing`, the assumption chips and one follow-up question. Lists stay within the
 * `BookingDraftSchema` caps, and a field the text leaves unusable (an invalid time, a duration
 * longer than every window) stays in `missing`, so a draft submission would refuse is never
 * complete. Pure.
 */
import {
  RoomType,
  type BookingDraftLLM,
  type Category,
  type Day,
  type ExtractedWindow,
  type ParsedBookingDraft,
  type ParseSource,
} from "@/lib/contracts";

import { groupsSize, resolveGroupRef } from "./groups";
import { impliedNeeds } from "./needs";
import {
  buildRoomIndex,
  deriveRoomTypes,
  resolveRoomText,
  roomNote,
} from "./rooms";
import {
  AUTHORITY_NOTE,
  claimsAuthority,
  findClaim,
  groupAttendanceNote,
} from "./rules";
import { calendarSlots, dayLabel, parseSchedule, windowLabel } from "./time";
import type { ParseContext, ParseOutcome } from "./types";
import { cleanText, clip, uniq } from "./text";

export type Processed = {
  /** The extraction after post-processing (resolved ids, derived fields, chips, follow-up). */
  extraction: BookingDraftLLM;
  draft: ParsedBookingDraft;
  requested_room: ParseOutcome["requested_room"];
  conditions: string[];
  claimed_category: Category | null;
  confidence: number;
};

export const ONE_HOUR_NOTE = "No duration given; assumed one hour";

/**
 * Chips or conditions from an LLM that talk about decisions are dropped (the engine decides),
 * in English or Hinglish ("manzoor", "pakka").
 */
const DECISION_TALK =
  /\b(?:(?:pre-?)?approv\w*|reject\w*|status|confirm\w*|guarantee\w*|priorit\w*|bump\w*|override\w*|sanction\w*|accepted|cleared|allowed|granted|manzoo?r\w*|manjoo?r\w*|pakk?a)\b/i;

/** `BookingDraftSchema` list caps (the draft must stay submittable as far as sizes go). */
export const DRAFT_CAPS = {
  windows: 20,
  room_types: 10,
  needs: 10,
  mandatory_for_groups: 40,
  repeat_days: 7,
  assumptions: 16,
  text: 300,
} as const;

type Missing = ParsedBookingDraft["missing"][number];

/**
 * Chips clipped to 300 characters, deduplicated and capped at 16. Over the cap, the chips this
 * post-processing added (calendar problems, room notes, derived values) are kept first and the
 * extraction's own chips fill what is left, in their original order.
 */
function capChips(
  chips: readonly string[],
  fromInput: readonly string[],
): string[] {
  const unique = uniq(chips.map((c) => clip(c, DRAFT_CAPS.text)));
  if (unique.length <= DRAFT_CAPS.assumptions) return unique;
  const input = new Set(fromInput.map((c) => clip(c, DRAFT_CAPS.text)));
  const own = unique
    .filter((c) => !input.has(c))
    .slice(0, DRAFT_CAPS.assumptions);
  const room = DRAFT_CAPS.assumptions - own.length;
  const keep = new Set([
    ...unique.filter((c) => input.has(c)).slice(0, room),
    ...own,
  ]);
  return unique.filter((c) => keep.has(c));
}

export function postProcess(
  input: BookingDraftLLM,
  text: string,
  ctx: ParseContext,
  source: ParseSource,
): Processed {
  const original = cleanText(text);
  const lower = original.toLowerCase();
  const slots = calendarSlots(ctx);
  const first = slots[0];
  const last = slots[slots.length - 1];
  const minPeriod = first?.id ?? 1;
  const maxPeriod = Math.min(13, last?.id ?? 13);
  const calendarDays = ctx.calendar.days;
  const dayOrder = (d: Day) => calendarDays.indexOf(d);
  const fromLlm = source === "llm";
  const inputChips = fromLlm
    ? input.assumptions.filter((a) => !DECISION_TALK.test(a))
    : [...input.assumptions];
  const chips: string[] = [...inputChips];

  // Windows: calendar days only, periods inside the calendar, from ≤ to, no duplicates.
  const clampPeriod = (p: number) =>
    Math.min(maxPeriod, Math.max(minPeriod, p));
  const byKey = new Map<string, ExtractedWindow>();
  for (const w of input.windows) {
    if (!calendarDays.includes(w.day)) continue;
    let from = clampPeriod(w.from_period);
    let to = clampPeriod(w.to_period);
    if (from > to) [from, to] = [to, from];
    byKey.set(`${w.day}:${from}:${to}`, {
      day: w.day,
      from_period: from,
      to_period: to,
    });
  }
  const allWindows = [...byKey.values()].sort(
    (a, b) =>
      dayOrder(a.day) - dayOrder(b.day) || a.from_period - b.from_period,
  );
  const windows = allWindows.slice(0, DRAFT_CAPS.windows);
  if (allWindows.length > windows.length)
    chips.push(
      `Only the first ${DRAFT_CAPS.windows} of ${allWindows.length} time windows were kept`,
    );
  const windowDays = new Set(windows.map((w) => w.day));
  const repeatDays = uniq(
    input.repeat_days.filter(
      (d) => calendarDays.includes(d) && !windowDays.has(d),
    ),
  )
    .sort((a, b) => dayOrder(a) - dayOrder(b))
    .slice(0, DRAFT_CAPS.repeat_days);

  // Groups: ids or phrases → ids that exist.
  const groups: string[] = [];
  for (const ref of input.mandatory_for_groups) {
    const ids = resolveGroupRef(ref, ctx);
    if (ids.length === 0)
      chips.push(clip(`No student group matches "${ref}"`, 300));
    groups.push(...ids);
  }
  const mandatory = uniq(groups).slice(0, DRAFT_CAPS.mandatory_for_groups);

  // Attendance: stated, else the compulsory groups' size.
  let attendance = input.attendance;
  if (attendance === null) {
    const size = groupsSize(mandatory, ctx);
    if (size !== null) {
      attendance = size;
      chips.push(groupAttendanceNote(mandatory, size));
    }
  }

  // Needs: stated plus implied by the event type and size.
  const implied = impliedNeeds(lower, attendance, input.needs);
  const needs = uniq([...input.needs, ...implied.needs]).slice(
    0,
    DRAFT_CAPS.needs,
  );
  chips.push(...implied.assumptions);

  // Requested room and room types.
  const index = buildRoomIndex(ctx);
  const resolution = resolveRoomText(input.requested_room_text, index);
  let roomTypes = uniq(input.room_types);
  if (roomTypes.length === 0) {
    const derived = deriveRoomTypes(
      lower,
      attendance,
      needs,
      resolution.room,
      ctx.rooms,
    );
    roomTypes = derived.types;
    if (derived.assumption) chips.push(derived.assumption);
  } else if (resolution.room) {
    const type = RoomType.safeParse(resolution.room.type);
    if (type.success && !roomTypes.includes(type.data))
      roomTypes = [type.data, ...roomTypes];
  }
  roomTypes = roomTypes.slice(0, DRAFT_CAPS.room_types);
  const room = roomNote(resolution, needs, attendance, roomTypes, ctx.rooms);
  if (resolution.room && resolution.numbered)
    chips.push(
      `'${resolution.text}' read as ${resolution.room.id} (${resolution.room.name})`,
    );

  // Clock times the text gives that can't be used as written.
  const schedule = parseSchedule(original, ctx);
  const unusable = schedule.problems.find((p) => p.kind !== "reversed");
  const reversed = schedule.problems.find((p) => p.kind === "reversed");
  const dayHours = first && last ? `${first.startClock}–${last.endClock}` : "";
  for (const p of schedule.problems)
    chips.push(
      p.kind === "reversed"
        ? `'${p.text}' ends before it starts; the end time was left out`
        : p.kind === "night"
          ? `'${p.text}' is outside the bookable day (${dayHours}); no window was made from it`
          : `'${p.text}' isn't a valid time; no window was made from it`,
    );

  // Duration: stated or from a range; a single start period means one hour (unless the text
  // gave an end time that can't be used: then the length is asked for).
  let duration = input.duration_periods;
  if (duration !== null)
    duration = Math.min(13, Math.max(1, Math.round(duration)));
  if (
    duration === null &&
    !reversed &&
    windows.length > 0 &&
    windows.every((w) => w.from_period === w.to_period)
  ) {
    duration = 1;
    chips.push(ONE_HOUR_NOTE);
  }

  // Calendar problems the text runs into (lunch, after the last period, weekend).
  const flags = new Set(schedule.flags);
  const lunch = ctx.calendar.lunch;
  const afterLunch = slots.find((s) => s.id === lunch.after_period + 1);
  const beforeLunch = slots.find((s) => s.id === lunch.after_period);
  if (flags.has("lunch"))
    chips.push(
      `${lunch.start}–${lunch.end} is lunch, not a bookable period${afterLunch ? `; the window starts at ${afterLunch.startClock} (P${afterLunch.id})` : ""}`,
    );
  if (flags.has("lunch_end"))
    chips.push(
      `${lunch.start}–${lunch.end} is lunch, not a bookable period${beforeLunch ? `; the window ends at ${beforeLunch.endClock} (P${beforeLunch.id})` : ""}`,
    );
  if (flags.has("past_end") && last)
    chips.push(`Events end at ${last.endClock} (P${last.id})`);
  if (flags.has("before_start") && first)
    chips.push(`The day starts at ${first.startClock} (P${first.id})`);
  const weekRange = `${dayLabel(calendarDays[0] ?? "MON")} to ${dayLabel(calendarDays[calendarDays.length - 1] ?? "FRI")}`;
  if (flags.has("weekend"))
    chips.push(`Bookings run ${weekRange}; weekend days are left out`);
  if (claimsAuthority(lower)) chips.push(AUTHORITY_NOTE);

  const title = input.title?.trim() ? clip(input.title.trim(), 200) : null;
  const missing: Missing[] = [];
  if (!title) missing.push("title");
  if (attendance === null) missing.push("attendance");
  if (duration === null) missing.push("duration_periods");
  if (windows.length === 0) missing.push("windows");
  if (roomTypes.length === 0) missing.push("room_types");

  const outOfScope =
    !title &&
    attendance === null &&
    duration === null &&
    windows.length === 0 &&
    !schedule.hasDay &&
    !schedule.hasTime &&
    needs.length === 0 &&
    roomTypes.length === 0 &&
    !resolution.text &&
    mandatory.length === 0;

  const longest = Math.max(
    0,
    ...windows.map((w) => w.to_period - w.from_period + 1),
  );
  const tooLong = duration !== null && windows.length > 0 && duration > longest;
  // Submission refuses a duration longer than every window, and an unusable time means the
  // windows aren't what was asked: both stay missing until the user fixes them.
  if (tooLong && !missing.includes("duration_periods"))
    missing.push("duration_periods");
  if (unusable && !missing.includes("windows")) missing.push("windows");

  let followUp: string | null = null;
  if (outOfScope) {
    followUp = claimsAuthority(lower)
      ? "Approvals and priority are decided by the scheduling rules, not by the request text. What would you like to book: the event, day, time and number of people?"
      : "I can only help book rooms for events. What's the event, which day and time, and roughly how many people?";
  } else if (unusable) {
    const what =
      unusable.kind === "night"
        ? `'${unusable.text}' is outside the bookable day (${dayHours}).`
        : `'${unusable.text}' isn't a valid time.`;
    followUp = `${what} ${schedule.hasDay || windows.length > 0 ? "What time do you need the room?" : "Which day and time do you need the room?"}`;
  } else if (windows.length === 0) {
    followUp = flags.has("weekend")
      ? `Bookings run ${weekRange}. Which weekday would you like?`
      : schedule.hasTime && !schedule.hasDay
        ? `Which day of fest week (${weekRange})?`
        : "Which day and time do you need the room?";
  } else if (reversed) {
    followUp = `'${reversed.text}' ends before it starts. When should it end?`;
  } else if (attendance === null) {
    followUp = "About how many people will attend?";
  } else if (duration === null) {
    followUp = "How long do you need it: 1, 2 or 3 hours?";
  } else if (roomTypes.length === 0) {
    followUp =
      "What kind of room do you need: classroom, lecture hall, seminar hall, auditorium, lab or outdoor?";
  } else if (flags.has("lunch")) {
    followUp = `${lunch.start}–${lunch.end} is lunch and can't be booked. Is starting at ${afterLunch?.startClock ?? lunch.end}${afterLunch ? ` (P${afterLunch.id})` : ""} okay?`;
  } else if (flags.has("lunch_end") && beforeLunch) {
    followUp = `${lunch.start}–${lunch.end} is lunch and can't be booked, so the window ends at ${beforeLunch.endClock} (P${beforeLunch.id}). Is that okay, or should it continue after lunch?`;
  } else if (flags.has("past_end") && last) {
    followUp = `Events end at ${last.endClock} (P${last.id}). Can you start earlier or keep it shorter?`;
  } else if (tooLong) {
    const w = windows.reduce((a, b) =>
      b.to_period - b.from_period > a.to_period - a.from_period ? b : a,
    );
    followUp = `The window ${windowLabel(slots, w.from_period, w.to_period)} is shorter than ${duration} hours. Can you widen it or shorten the event?`;
  } else if (flags.has("before_start") && first) {
    followUp = `The day starts at ${first.startClock} (P${first.id}). Is starting then okay?`;
  } else if (resolution.text && !resolution.room && resolution.numbered) {
    const ids = resolution.numbered.candidates.map((r) => r.id);
    followUp =
      ids.length > 1
        ? `Which room did you mean by "${resolution.text}": ${ids.slice(0, -1).join(", ")} or ${ids[ids.length - 1]}?`
        : `There's no room numbered ${resolution.numbered.number}. Which room did you mean?`;
  } else if (resolution.text && !resolution.room) {
    followUp = room.suggestion
      ? `${resolution.text} doesn't exist. Did you mean ${room.suggestion.id}?`
      : `I couldn't find a room called "${resolution.text}". Which room did you mean?`;
  } else if (resolution.room && room.note) {
    followUp = room.suggestion
      ? `${resolution.room.id} doesn't have everything you asked for. Shall I try ${room.suggestion.id} instead?`
      : `${resolution.room.id} doesn't have everything you asked for. Is another room okay?`;
  }

  const assumptions = capChips(chips, inputChips);
  let confidence =
    0.1 +
    (title ? 0.1 : 0) +
    (attendance !== null ? 0.2 : 0) +
    (duration !== null ? 0.2 : 0) +
    (windows.length > 0 ? 0.2 : 0) +
    (roomTypes.length > 0 ? 0.2 : 0) -
    0.03 * assumptions.length -
    (followUp ? 0.1 : 0);
  if (fromLlm) confidence = (confidence + input.confidence) / 2;
  confidence = Math.round(Math.min(1, Math.max(0.05, confidence)) * 100) / 100;

  const conditions = (
    fromLlm
      ? input.conditions.filter((c) => !DECISION_TALK.test(c))
      : input.conditions
  ).map((c) => clip(c, 300));
  const follow = followUp ? clip(followUp, DRAFT_CAPS.text) : null;

  return {
    extraction: {
      title,
      attendance,
      duration_periods: duration,
      windows,
      room_types: roomTypes,
      needs,
      requested_room_text: resolution.text ? clip(resolution.text, 100) : null,
      mandatory_for_groups: mandatory,
      repeat_days: repeatDays,
      claimed_category: input.claimed_category,
      conditions,
      assumptions,
      follow_up: follow,
      confidence,
    },
    draft: {
      title,
      attendance,
      duration_periods: duration,
      windows,
      room_types: roomTypes,
      needs,
      requested_room: resolution.room?.id ?? null,
      mandatory_for_groups: mandatory,
      repeat_days: repeatDays,
      assumptions,
      follow_up: follow,
      missing,
    },
    requested_room: {
      text: resolution.text,
      room_id: resolution.room?.id ?? null,
      suggestion: room.suggestion?.id ?? null,
      note: room.note,
    },
    conditions,
    claimed_category: input.claimed_category ?? findClaim(lower),
    confidence,
  };
}
