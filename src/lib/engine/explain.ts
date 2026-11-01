/**
 * Session fact bundles for "why is this class here?" (backend.md §3.7). Everything is computed
 * from the timetable with every other session held where it is: the room choice, the soft points
 * the session costs at its slot, and for every other start whether it would fit (with the soft
 * delta) or which hard rule blocks it. The summary is a template over those facts only, so every
 * number it uses is in them.
 */
import {
  isAvoidPreference,
  type Assignment,
  type Dataset,
  type Day,
  type Room,
  type Session,
  type SessionFacts,
  type SlotAlternative,
  type SoftCost,
} from "@/lib/contracts";

import { block, checkTimetable, toAssignMap } from "./checker";
import {
  Occupancy,
  roomSuits,
  RuleTally,
  structuralStarts,
  UnitProbe,
  unitOf,
} from "./conflicts";
import { formatPeriods, listJoin, plural, roomNeed } from "./format";
import {
  buildInstance,
  isRoomUnavailable,
  isTeachingDay,
  type Instance,
} from "./instance";
import { newViolations } from "./manual";
import { isPyInt } from "./py";
import { softScore } from "./soft";
import { LAST_TEACHING_PERIOD } from "./types";

/** Free alternatives listed in the facts. */
const BEST_ALTERNATIVES = 3;

/** "08:00–09:00" from the calendar, or "P1–P2" when the calendar lacks a period. */
function clockTime(dataset: Dataset, start: number, end: number): string {
  const periods = dataset.calendar.periods;
  const from = periods.find((p) => p.id === start)?.start;
  const to = periods.find((p) => p.id === end)?.end;
  return from && to
    ? `${from}–${to}`
    : start === end
      ? `P${start}`
      : `P${start}–P${end}`;
}

/** The unit's sessions moved to one start in these rooms; everything else as it is. */
function moveUnit(
  assignments: readonly Assignment[],
  unit: readonly Session[],
  day: string,
  start: number,
  rooms: readonly string[],
): Assignment[] {
  const ids = new Set(unit.map((s) => s.id));
  const out = assignments.filter((a) => !ids.has(a.session_id));
  unit.forEach((s, i) =>
    out.push({
      session_id: s.id,
      day: day as Day,
      start_period: start,
      room_id: rooms[i],
    }),
  );
  return out;
}

/** Soft points the session itself costs where it is (S1, S5, S6 own; S2–S4 marginal). */
function softCosts(
  instance: Instance,
  assignments: readonly Assignment[],
  s: Session,
  day: string,
  start: number,
  room: Room | undefined,
): SoftCost[] {
  const out: SoftCost[] = [];
  const per = block(start, s.duration);
  for (const pref of instance.faculty.get(s.faculty_id)?.preferences ?? []) {
    if (!isAvoidPreference(pref)) continue;
    const days: readonly string[] = pref.days ?? instance.days;
    if (!days.includes(day)) continue;
    const hit = per.filter((p) => pref.periods.includes(p));
    if (hit.length === 0) continue;
    // The preference's own note is the faculty member's private text: never quoted here, since
    // these facts are shown to every role.
    out.push({
      rule: "S1",
      points: 2 * hit.length,
      detail: `${s.faculty_id} asked to avoid ${day} ${formatPeriods(hit)}`,
    });
  }
  const without = softScore(
    instance,
    assignments.filter((a) => a.session_id !== s.id),
  ).penalties;
  const all = softScore(instance, assignments).penalties;
  const groups = listJoin(s.groups);
  const has = s.groups.length > 1 ? "have" : "has";
  const marginal = (rule: "S2" | "S3" | "S4", detail: string) => {
    const points = all[rule] - without[rule];
    if (points > 0) out.push({ rule, points, detail });
  };
  marginal("S2", `${groups} ${has} idle periods around it on ${day}`);
  marginal("S3", `${groups} ${has} more than 6 hours of class on ${day}`);
  marginal(
    "S4",
    s.basket_slot
      ? `another ${s.course_id} basket lecture is on ${day}`
      : `${groups} ${has} another ${s.course_id} lecture on ${day}`,
  );
  if (room && room.capacity && s.size / room.capacity < 0.4) {
    out.push({
      rule: "S5",
      points: 1,
      detail: `${s.size} students fill ${Math.floor((s.size * 100) / room.capacity)}% of ${room.id}`,
    });
  }
  if (per.includes(LAST_TEACHING_PERIOD)) {
    out.push({
      rule: "S6",
      points: 1,
      detail: `runs in the last teaching period, P${LAST_TEACHING_PERIOD}`,
    });
  }
  const order = ["S1", "S2", "S3", "S4", "S5", "S6"];
  return out.sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule));
}

/**
 * Why `session_id` sits where it is in `assignments`, with every other session held fixed: its
 * room choice, the soft points it costs there, and for every other start slot whether it would fit
 * (and the soft delta) or which hard rule blocks it. Null for an unknown session.
 */
export function explainSession(input: {
  dataset: Dataset;
  assignments: readonly Assignment[];
  session_id: string;
  version_id: string | null;
}): SessionFacts | null {
  const { dataset, assignments } = input;
  const instance = buildInstance(dataset);
  const session = instance.sessions.get(input.session_id);
  const unit = unitOf(instance, input.session_id);
  if (!session || !unit) return null;
  const pos = unit.sessions.indexOf(session);
  const ids = new Set(unit.sessions.map((s) => s.id));
  const current = toAssignMap(assignments).assign;
  const entry = current.get(session.id);

  let placed: SessionFacts["placed"] = null;
  if (
    entry &&
    isTeachingDay(instance, entry.day) &&
    isPyInt(entry.start_period) &&
    entry.start_period >= 1 &&
    entry.start_period + session.duration - 1 <= LAST_TEACHING_PERIOD &&
    typeof entry.room_id === "string" &&
    entry.room_id.length > 0
  ) {
    const start = entry.start_period;
    const end = start + session.duration - 1;
    placed = {
      day: entry.day as Day,
      start_period: start,
      end_period: end,
      room_id: entry.room_id,
      time: clockTime(dataset, start, end),
    };
  }

  // ---- room
  const others = new Occupancy(instance, assignments, new Set([session.id]));
  let roomFacts: SessionFacts["room"] = null;
  const room = placed ? instance.rooms.get(placed.room_id) : undefined;
  if (placed && room) {
    const per = block(placed.start_period, session.duration);
    const suitable = [...instance.rooms.values()].filter((r) =>
      roomSuits(r, session),
    );
    const busy = (r: Room) =>
      per.some((p) => others.room(r.id, placed.day, p).length > 0);
    const closed = (r: Room) =>
      per.some((p) => isRoomUnavailable(instance, r.id, placed.day, p));
    const smaller = suitable.filter((r) => r.capacity < room.capacity);
    const smallerBusy = smaller.filter(busy).map((r) => r.id);
    const smallerFree = smaller
      .filter((r) => !busy(r) && !closed(r))
      .map((r) => r.id);
    const fill = room.capacity
      ? Math.floor((session.size * 100) / room.capacity)
      : 0;
    let note: string;
    if (!roomSuits(room, session)) {
      note = `${room.id} doesn't suit it: it needs a ${roomNeed(session)}`;
    } else if (suitable.length === 1) {
      note = `${room.id} is the only suitable room for ${session.size} students`;
    } else if (smaller.length === 0) {
      const tie = suitable.some(
        (r) => r.id !== room.id && r.capacity === room.capacity,
      );
      note = `${room.id} is ${tie ? "one of the smallest" : "the smallest"} of the ${plural(suitable.length, "suitable room")} for ${session.size} students`;
    } else if (smallerFree.length === 0) {
      note = `Every smaller suitable room is taken or closed at this time (${listJoin(smaller.map((r) => r.id))})`;
    } else {
      note = `${listJoin(smallerFree)} ${smallerFree.length > 1 ? "are" : "is"} smaller, suitable and also free at this time`;
    }
    roomFacts = {
      room_id: room.id,
      room_name: room.name,
      type: room.type,
      capacity: room.capacity,
      fill_percent: fill,
      suitable_rooms: suitable.length,
      smaller_suitable_busy: smallerBusy,
      note,
    };
  }

  const soft_costs = placed
    ? softCosts(
        instance,
        assignments,
        session,
        placed.day,
        placed.start_period,
        room,
      )
    : [];

  // ---- alternatives: every other start, the whole basket moving together
  const occ = new Occupancy(instance, assignments, ids);
  const probe = new UnitProbe(instance, unit, {
    prefer: unit.sessions.map((s) => {
      const r = current.get(s.id)?.room_id;
      return typeof r === "string" ? r : null;
    }),
  });
  const starts = structuralStarts(instance, unit).filter(
    (st) =>
      !(
        placed &&
        st.day === placed.day &&
        st.start_period === placed.start_period
      ),
  );
  const tally = new RuleTally(instance);
  const softNow = softScore(instance, assignments).total;
  const free: (SlotAlternative & { rooms: readonly string[] })[] = [];
  for (const st of starts) {
    const verdict = probe.check(occ, st.day, st.start_period);
    if (!verdict.free) {
      tally.add(verdict.rule, verdict.who);
      continue;
    }
    const moved = moveUnit(
      assignments,
      unit.sessions,
      st.day,
      st.start_period,
      verdict.rooms,
    );
    free.push({
      day: st.day as Day,
      start_period: st.start_period,
      room_id: verdict.rooms[pos],
      soft_delta: softScore(instance, moved).total - softNow,
      rooms: verdict.rooms,
    });
  }
  const dayOrder = (d: string) => instance.days.indexOf(d);
  const ranked = [...free].sort(
    (a, b) =>
      a.soft_delta - b.soft_delta ||
      dayOrder(a.day) - dayOrder(b.day) ||
      a.start_period - b.start_period,
  );
  const before = checkTimetable(instance, assignments).violations;
  const best: SlotAlternative[] = [];
  for (const alt of ranked) {
    if (best.length >= BEST_ALTERNATIVES) break;
    const moved = moveUnit(
      assignments,
      unit.sessions,
      alt.day,
      alt.start_period,
      alt.rooms,
    );
    if (
      newViolations(before, checkTimetable(instance, moved).violations).length >
      0
    )
      continue;
    best.push({
      day: alt.day,
      start_period: alt.start_period,
      room_id: alt.room_id,
      soft_delta: alt.soft_delta,
    });
  }
  const entries = tally.entries();
  const blocked = entries.map(({ rule, count, detail }) => ({
    rule,
    count,
    detail,
  }));
  const alternatives: SessionFacts["alternatives"] = {
    considered: starts.length,
    free: free.length,
    better: free.filter((a) => a.soft_delta < 0).length,
    blocked,
    best,
  };

  const course = dataset.courses.find((c) => c.id === session.course_id);
  const faculty = instance.faculty.get(session.faculty_id);
  const facts: SessionFacts = {
    session_id: session.id,
    course_id: session.course_id,
    course_name: course?.title ?? null,
    kind: session.kind,
    groups: [...session.groups],
    faculty_id: session.faculty_id,
    faculty_name: faculty?.name || null,
    size: session.size,
    duration: session.duration,
    fixed_slot: session.fixed_slot !== null && session.fixed_slot !== undefined,
    basket_slot: session.basket_slot || null,
    version_id: input.version_id,
    placed,
    room: roomFacts,
    soft_costs,
    alternatives,
    summary: "",
  };
  facts.summary = summarise(
    facts,
    unit.sessions,
    session,
    entries.map((e) => e.phrase),
  );
  return facts;
}

/** The template explanation; it only quotes values that are in `facts`. */
function summarise(
  facts: SessionFacts,
  unit: readonly Session[],
  session: Session,
  /** Blocked-start reasons as sentence parts, largest first ("CSE-2 is already in class in 20"). */
  blockedPhrases: readonly string[],
): string {
  const parts: string[] = [];
  const { placed, room, alternatives: alt } = facts;
  const course = facts.course_name ?? facts.course_id;
  const kind = course.toLowerCase().endsWith(facts.kind)
    ? ""
    : ` ${facts.kind}`;
  const what = `${facts.session_id} (${course}${kind})`;
  if (!placed) {
    parts.push(`${what} isn't placed in this timetable.`);
  } else {
    const periods =
      placed.start_period === placed.end_period
        ? `P${placed.start_period}`
        : `P${placed.start_period}–P${placed.end_period}`;
    parts.push(
      `${what} is on ${placed.day} ${placed.time} (${periods}) in ${placed.room_id}.`,
    );
  }
  const fx = session.fixed_slot;
  if (fx) {
    const atFixed =
      placed &&
      placed.day === fx.day &&
      placed.start_period === fx.start_period;
    parts.push(
      atFixed
        ? `The dataset fixes it at ${fx.day} P${fx.start_period}, so it can't move.`
        : `The dataset fixes it at ${fx.day} P${fx.start_period}.`,
    );
  }
  if (facts.basket_slot) {
    // Sibling ids aren't in the facts, so the summary doesn't name them.
    parts.push(
      unit.length > 1
        ? `It runs in elective basket ${facts.basket_slot}, whose sessions share one time slot, so the other slots below move the whole basket.`
        : `It runs in elective basket ${facts.basket_slot}.`,
    );
  }
  if (room) parts.push(`${room.note}.`);
  if (placed) {
    parts.push(
      facts.soft_costs.length > 0
        ? `Here it costs ${listJoin(facts.soft_costs.map((c) => `${c.rule} ${plural(c.points, "point")} (${c.detail})`))}.`
        : "It costs no soft points here.",
    );
  }
  if (!fx) {
    if (alt.considered === 0) {
      parts.push("No other start fits its block.");
    } else {
      let text =
        alt.free > 0
          ? `Of the ${alt.considered} other start slots, ${alt.free} would fit without moving anything`
          : `None of the ${alt.considered} other start slots would fit without moving something`;
      if (alt.free > 0) {
        const top = alt.best[0];
        text +=
          alt.better > 0 && top
            ? `, and ${alt.better} of those would lower the soft penalty (best: ${top.day} P${top.start_period} in ${top.room_id}, ${top.soft_delta} points)`
            : ", none with a lower soft penalty";
      }
      if (blockedPhrases.length > 0) {
        const lead = alt.free > 0 ? "; of the rest, " : ": ";
        text += `${lead}${listJoin(blockedPhrases.slice(0, 3))}`;
      }
      parts.push(`${text}.`);
      if (placed && alt.free > 0 && alt.better === 0) {
        parts.push(
          `That is why it stays at ${placed.time}: no free slot costs less.`,
        );
      }
    }
  }
  return parts.join(" ");
}
