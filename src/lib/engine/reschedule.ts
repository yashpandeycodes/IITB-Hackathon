/**
 * Minimal-move rescheduling (backend.md §3.5). A change list is applied with `applyDisruption`
 * semantics; every baseline session whose slot still holds stays exactly where it is, and the
 * rest (broken by the change, added by it, or pinned by a placement) are re-placed with the fewest
 * moves: room only, another free start, or an ejection chain (see `repair.ts`). The result is
 * re-checked with the validator port and its stability counted the validator's way. When no fix
 * exists, every session that can't be placed gets a conflict report naming the rules in the way.
 * Pure and deterministic: same input, same result (only `meta.ms` varies).
 */
import {
  Day,
  type Assignment,
  type ConflictEntry,
  type Dataset,
  type DisruptionChange,
  type MoveCause,
  type MoveDiff,
  type MoveKind,
  type PathIssue,
  type RescheduleMeta,
  type SlotRef,
  type SoftPenaltySummary,
  type Violation,
} from "@/lib/contracts";

import { block, checkTimetable, toAssignMap } from "./checker";
import {
  conflictEntries,
  Occupancy,
  roomRuleBroken,
  structuralStarts,
  unitName,
  type Start,
} from "./conflicts";
import { applyDisruption } from "./disruption";
import {
  clip,
  formatDays,
  formatPeriods,
  listJoin,
  roomNeed,
  slotLabel,
  unique,
} from "./format";
import {
  buildInstance,
  isFacultyUnavailable,
  isRoomUnavailable,
  type Instance,
} from "./instance";
import { dayOfSlot, FREE, periodOfSlot, slotOf } from "./model";
import { isPyInt } from "./py";
import {
  RepairContext,
  searchLimits,
  type PinRequest,
  type RepairOutcome,
  type SearchLimits,
} from "./repair";
import { softScore } from "./soft";
import { LAST_TEACHING_PERIOD } from "./types";
import { computeStability } from "./validate";

/** Deepest ejection chain tried (a blocker of a blocker of a blocker). */
export const DEFAULT_RESCHEDULE_DEPTH = 3;
/** Default deterministic search budget, in expanded nodes. */
export const DEFAULT_RESCHEDULE_NODES = 200_000;
/** Default wall-clock safety cap. */
export const DEFAULT_RESCHEDULE_TIME_MS = 4_000;

/** `RescheduleMeta.algorithm`. */
export const RESCHEDULE_ALGORITHM =
  "minimal-move repair (room, time, ejection chains ≤ 3)";

const DEFAULTS = {
  maxDepth: DEFAULT_RESCHEDULE_DEPTH,
  maxNodes: DEFAULT_RESCHEDULE_NODES,
  timeBudgetMs: DEFAULT_RESCHEDULE_TIME_MS,
};

export type RescheduleOptions = {
  /** Max ejection-chain depth (default {@link DEFAULT_RESCHEDULE_DEPTH}). */
  maxDepth?: number;
  /** Deterministic search budget in expanded nodes. */
  maxNodes?: number;
  /** Wall-clock safety cap in ms. */
  timeBudgetMs?: number;
  /**
   * The clock (ms) behind the wall-clock cap and `meta.ms`; default `performance.now`. Results
   * are deterministic whenever the node budget, not the clock, ends the search (`stopped_by` is
   * `complete` or `nodes`): only the time cap reads the clock. A frozen clock (`() => 0`) never
   * ends a search, so the same input always gives the same result, `meta.ms` included.
   */
  now?: () => number;
};

export type RescheduleInput = {
  /** The dataset the baseline was built for (the active dataset, before `changes`). */
  dataset: Dataset;
  /** The active timetable's assignments. */
  baseline: readonly Assignment[];
  /** Starter-pack changes, applied in order with `applyDisruption` semantics. */
  changes?: readonly DisruptionChange[];
  /**
   * Sessions pinned exactly at these slots (manual placement, an assistant option). A placement
   * on a basket member pins the whole basket slot's time; the other members keep their rooms
   * where possible.
   */
  placements?: readonly Assignment[];
  options?: RescheduleOptions;
};

export type RescheduleResult = {
  /** Every session of the changed dataset placed, zero hard violations, every placement honoured. */
  feasible: boolean;
  /** `applyDisruption(dataset, changes)`. */
  dataset: Dataset;
  /** Full timetable for the changed dataset in dataset session order (the best partial if infeasible). */
  assignments: Assignment[];
  /** Moved, added and removed sessions vs the baseline, in dataset session order. */
  diff: MoveDiff[];
  /** Validator semantics (`computeStability`): sessions in both whose (day, start, room) differs. */
  moved_count: number;
  time_changed: number;
  room_only_changed: number;
  /** The baseline's S1–S6 on the original dataset. */
  soft_before: SoftPenaltySummary;
  /** The result's S1–S6 on the changed dataset (null when infeasible). */
  soft_after: SoftPenaltySummary | null;
  /** `soft_after.total - soft_before.total` (0 when infeasible). */
  soft_delta: number;
  /** Independent `checkTimetable` re-check of `assignments` on the changed dataset. */
  hard: Violation[];
  /** Why sessions could not be placed (infeasible only). */
  conflicts: ConflictEntry[];
  meta: RescheduleMeta;
};

const clockNow = () => performance.now();

function summary(
  instance: Instance,
  assignments: readonly Assignment[],
): SoftPenaltySummary {
  const { penalties, total } = softScore(instance, assignments);
  return { ...penalties, total };
}

export function reschedule(input: RescheduleInput): RescheduleResult {
  const now = input.options?.now ?? clockNow;
  const started = now();
  const changes = input.changes ?? [];
  const changed = applyDisruption(input.dataset, { changes });
  const ctx = new RepairContext(changed, input.baseline);
  const limits = searchLimits(input.options ?? {}, DEFAULTS, now);
  const pins = input.placements ?? [];
  const outcome = ctx.run(pins, limits);
  return assemble({
    ctx,
    outcome,
    original: input.dataset,
    changed,
    changes,
    baseline: input.baseline,
    pins,
    limits,
    softBefore: summary(buildInstance(input.dataset), input.baseline),
    started,
    now,
  });
}

type AssembleArgs = {
  ctx: RepairContext;
  outcome: RepairOutcome;
  original: Dataset;
  changed: Dataset;
  changes: readonly DisruptionChange[];
  baseline: readonly Assignment[];
  pins: readonly PinRequest[];
  limits: SearchLimits;
  softBefore: SoftPenaltySummary;
  started: number;
  /** The run's clock (for `meta.ms`). */
  now: () => number;
};

/** The public result for the run the context's state now holds. */
function assemble(args: AssembleArgs): RescheduleResult {
  const { ctx, outcome, baseline, pins } = args;
  const { instance } = ctx;
  const assignments = ctx.state.toAssignments();
  const hard = checkTimetable(instance, assignments).violations;
  const nowMap = toAssignMap(assignments).assign;
  const stability = computeStability(
    instance,
    nowMap,
    toAssignMap(baseline).assign,
  );
  const placed = new Map(assignments.map((a) => [a.session_id, a]));
  const pinsHold = pins.every((p) => {
    const a = placed.get(p.session_id);
    return (
      a !== undefined &&
      a.day === p.day &&
      a.start_period === p.start_period &&
      a.room_id === p.room_id
    );
  });
  const feasible =
    outcome.unplaced.length === 0 &&
    hard.length === 0 &&
    outcome.pinIssues.length === 0 &&
    pinsHold;
  const softAfter = feasible ? summary(instance, assignments) : null;
  const diff = buildDiff(args, placed);
  const conflicts = feasible ? [] : buildConflicts(args, assignments);
  let broken = 0;
  for (const cause of outcome.causes) {
    if (cause === "broken" || cause === "added" || cause === "requested")
      broken++;
  }
  const meta: RescheduleMeta = {
    broken,
    evictions: diff.filter((d) => d.cause === "evicted").length,
    depth: outcome.depth,
    nodes: outcome.nodes,
    ms: Math.max(0, Math.round(args.now() - args.started)),
    stopped_by: outcome.stoppedBy,
    algorithm: RESCHEDULE_ALGORITHM,
  };
  return {
    feasible,
    dataset: args.changed,
    assignments,
    diff,
    moved_count: stability.sessions_moved,
    time_changed: stability.time_changed,
    room_only_changed: stability.room_only_changed,
    soft_before: args.softBefore,
    soft_after: softAfter,
    soft_delta: softAfter ? softAfter.total - args.softBefore.total : 0,
    hard,
    conflicts,
    meta,
  };
}

// ------------------------------------------------------------------------------------- diff

const DAY_VALUES: readonly string[] = Day.options;

/** A baseline entry as a `SlotRef`, or null when it isn't a valid teaching slot. */
function slotRef(a: Assignment): SlotRef | null {
  const p = a.start_period;
  if (
    !DAY_VALUES.includes(a.day) ||
    !isPyInt(p) ||
    p < 1 ||
    p > LAST_TEACHING_PERIOD
  ) {
    return null;
  }
  if (typeof a.room_id !== "string" || a.room_id.length === 0) return null;
  return { day: a.day, start_period: p, room_id: a.room_id };
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** "same time, now in CR-104" / "now at THU P4 in LH-2" / "now at THU P4, same room". */
function whereNow(base: Assignment, now: Assignment): string {
  if (base.day === now.day && base.start_period === now.start_period) {
    return `same time, now in ${now.room_id}`;
  }
  const at = slotLabel(now.day, now.start_period);
  return base.room_id === now.room_id
    ? `now at ${at}, same room`
    : `now at ${at} in ${now.room_id}`;
}

function periodsOf(
  instance: Instance,
  sessionId: string,
  start: unknown,
): number[] {
  const s = instance.sessions.get(sessionId);
  return s && isPyInt(start) ? block(start, s.duration) : [];
}

/** "CR-102 closed MON–FRI P1–P9 (Water leak…)", from the change that closed it when there is one. */
function closureText(
  args: AssembleArgs,
  roomId: string,
  day: string,
  periods: readonly number[],
): string {
  const calendar = args.changed.calendar.days;
  for (const ch of args.changes) {
    if (
      ch.type === "room_unavailable" &&
      ch.room_id === roomId &&
      ch.days.includes(day) &&
      ch.periods.some((p) => periods.includes(p))
    ) {
      const why = ch.reason ? ` (${clip(ch.reason)})` : "";
      return `${roomId} closed ${formatDays(ch.days, calendar)} ${formatPeriods(ch.periods)}${why}`;
    }
  }
  const closed = periods.filter((p) =>
    isRoomUnavailable(args.ctx.instance, roomId, day, p),
  );
  return `${roomId} closed ${day} ${formatPeriods(closed)}`;
}

/** "F07 unavailable MON P1–P9 (Conference travel…)". */
function unavailableText(
  args: AssembleArgs,
  facultyId: string,
  day: string,
  periods: readonly number[],
): string {
  const calendar = args.changed.calendar.days;
  for (const ch of args.changes) {
    if (
      ch.type === "faculty_unavailable" &&
      ch.faculty_id === facultyId &&
      ch.days.includes(day) &&
      ch.periods.some((p) => periods.includes(p))
    ) {
      const why = ch.reason ? ` (${clip(ch.reason)})` : "";
      return `${facultyId} unavailable ${formatDays(ch.days, calendar)} ${formatPeriods(ch.periods)}${why}`;
    }
  }
  const hit = periods.filter((p) =>
    isFacultyUnavailable(args.ctx.instance, facultyId, day, p),
  );
  return `${facultyId} unavailable ${day} ${formatPeriods(hit)}`;
}

/** Why a broken session's old slot fails, in words. */
function brokenWhy(
  args: AssembleArgs,
  sessionId: string,
  rules: readonly string[],
): string {
  const { instance } = args.ctx;
  const s = instance.sessions.get(sessionId);
  const base = args.ctx.baseline.get(sessionId);
  if (!s || !base) return "its old slot no longer holds";
  const periods = periodsOf(instance, sessionId, base.start_period);
  switch (rules[0]) {
    case "H8":
      return closureText(args, base.room_id, base.day, periods);
    case "H7":
      return unavailableText(args, s.faculty_id, base.day, periods);
    case "H5":
    case "H6":
    case "H10":
      return `${base.room_id} no longer suits it (needs ${roomNeed(s)})`;
    case "H14":
      return `it must sit at its fixed slot ${slotLabel(s.fixed_slot!.day, s.fixed_slot!.start_period)}`;
    case "H9":
      return `its old start ${slotLabel(base.day, base.start_period)} breaks the period rules`;
    case "H1":
      return instance.rooms.has(base.room_id)
        ? `${base.day} is not a teaching day`
        : `room ${base.room_id} doesn't exist`;
    case "H11":
      return `its basket's sessions were not at one time`;
    case "H4":
    case "H2":
    case "H3":
    case "H12":
      return "its old slot clashed with another session";
    default:
      return "its old slot no longer holds";
  }
}

/**
 * What the displacing session (`by`, or a member of its basket) needed from an evicted session's
 * old slot: "WED P4 in LH-3" (its room), "CSE-2 at WED P4" (a group both have), "F06 at WED P4"
 * (their teacher). Just the old slot ("WED P4") when no shared cell is found.
 */
function freedCell(
  args: AssembleArgs,
  sessionId: string,
  base: Assignment,
  by: string,
  placed: ReadonlyMap<string, Assignment>,
): string {
  const { instance, model, memberIndex } = args.ctx;
  const start = slotLabel(base.day, base.start_period);
  const s = instance.sessions.get(sessionId);
  const byIndex = memberIndex.get(by);
  if (!s || byIndex === undefined) return start;
  const mine = periodsOf(instance, sessionId, base.start_period);
  const takers = model.units[model.members[byIndex].unit].members;
  for (const { session: t } of takers) {
    const at = placed.get(t.id);
    if (!at || at.day !== base.day) continue;
    const overlap = block(at.start_period, t.duration).filter((p) =>
      mine.includes(p),
    );
    if (overlap.length === 0) continue;
    if (at.room_id === base.room_id) return `${start} in ${base.room_id}`;
    const cell = `${base.day} ${formatPeriods(overlap)}`;
    const group = s.groups.find((g) => t.groups.includes(g));
    if (group !== undefined) return `${group} at ${cell}`;
    if (s.faculty_id === t.faculty_id) return `${s.faculty_id} at ${cell}`;
  }
  return start;
}

/** One diff entry per session that moved, was added or was removed, in dataset order. */
function buildDiff(
  args: AssembleArgs,
  placed: ReadonlyMap<string, Assignment>,
): MoveDiff[] {
  const { ctx, outcome, original, changed, changes } = args;
  const { model } = ctx;
  const inChanged = new Set(changed.sessions.map((s) => s.id));
  const removedByChange = new Set(
    changes.filter((c) => c.type === "remove_session").map((c) => c.session_id),
  );
  const out: MoveDiff[] = [];
  const done = new Set<string>();

  const entryFor = (sid: string): MoveDiff | null => {
    const m = ctx.memberIndex.get(sid);
    const now = placed.get(sid);
    if (m === undefined || !now) return null;
    const base = ctx.baseline.get(sid);
    const to: SlotRef = {
      day: now.day,
      start_period: now.start_period,
      room_id: now.room_id,
    };
    if (!base) {
      return {
        session_id: sid,
        from: null,
        to,
        move: "added",
        cause: "added",
        rules: [],
        displaced_by: null,
        reason: `New session placed at ${slotLabel(now.day, now.start_period)} in ${now.room_id}${outcome.causes[m] === "requested" ? " as requested" : ""}`,
      };
    }
    const sameTime =
      base.day === now.day && base.start_period === now.start_period;
    if (sameTime && base.room_id === now.room_id) return null;
    const move: MoveKind = sameTime
      ? "room_only"
      : base.room_id === now.room_id
        ? "time_only"
        : "time_and_room";
    const raw = outcome.causes[m];
    const cause: MoveCause = raw === "kept" ? "evicted" : raw;
    let reason: string;
    let displaced: string | null = null;
    let rules: string[] = [];
    if (cause === "requested") {
      const by = outcome.pinnedWith[m];
      const at = slotLabel(now.day, now.start_period);
      reason = by
        ? `Moves with basket ${model.members[m].session.basket_slot} to ${at} (requested for ${by}); now in ${now.room_id}`
        : `Placed at ${at} in ${now.room_id} as requested`;
    } else if (cause === "evicted") {
      displaced = outcome.displacedBy[m];
      reason = displaced
        ? `Moved to free ${freedCell(args, sid, base, displaced, placed)} for ${displaced}; ${whereNow(base, now)}`
        : `Moved to make room for another session; ${whereNow(base, now)}`;
    } else {
      rules = [...outcome.rules[m]];
      let why: string;
      if (rules.length > 0) {
        why = brokenWhy(args, sid, rules);
      } else {
        // A basket member that moves because a sibling's old slot broke.
        const unit = model.units[model.members[m].unit];
        const sibling = unit.members.find(
          (x) => outcome.rules[x.index].length > 0,
        );
        why = sibling
          ? `basket ${unit.basket} moved because of ${sibling.session.id}: ${brokenWhy(args, sibling.session.id, outcome.rules[sibling.index])}`
          : unit.basket
            ? `basket ${unit.basket} moved so all its sessions fit`
            : "its old slot no longer holds";
      }
      reason = capitalise(`${why}; ${whereNow(base, now)}`);
    }
    return {
      session_id: sid,
      from: slotRef(base),
      to,
      move,
      cause,
      rules,
      displaced_by: displaced,
      reason,
    };
  };

  const emit = (sid: string) => {
    if (done.has(sid)) return;
    done.add(sid);
    const entry = entryFor(sid);
    if (entry) out.push(entry);
  };

  for (const s of original.sessions) {
    if (inChanged.has(s.id)) {
      emit(s.id);
      continue;
    }
    if (done.has(s.id)) continue;
    done.add(s.id);
    const base = ctx.baseline.get(s.id);
    if (!base) continue;
    out.push({
      session_id: s.id,
      from: slotRef(base),
      to: null,
      move: "removed",
      cause: "removed",
      rules: [],
      displaced_by: null,
      reason: removedByChange.has(s.id)
        ? "Removed from the timetable by the change"
        : "No longer in the dataset",
    });
  }
  for (const s of changed.sessions) emit(s.id);
  return out;
}

// -------------------------------------------------------------------------------- conflicts

function buildConflicts(
  args: AssembleArgs,
  assignments: readonly Assignment[],
): ConflictEntry[] {
  const { ctx, outcome } = args;
  const { instance, model } = ctx;
  const occ = new Occupancy(instance, assignments);
  const issues = new Map<string, string[]>();
  for (const { session_id, contradiction } of outcome.pinIssues) {
    const list = issues.get(session_id);
    if (list) list.push(contradiction);
    else issues.set(session_id, [contradiction]);
  }
  const pinnedSessions = new Set(
    outcome.pinnedUnits.flatMap((u) =>
      model.units[u].members.map((m) => m.session.id),
    ),
  );
  const out: ConflictEntry[] = [];
  const covered = new Set<string>();
  for (const u of outcome.unplaced) {
    const view = ctx.unitView(u);
    const extra: string[] = [];
    for (const s of view.sessions) {
      extra.push(...(issues.get(s.id) ?? []));
      covered.add(s.id);
    }
    // A fixed session whose only slot is taken by a pinned one.
    const fx = view.fixed;
    if (fx) {
      const holders = new Set<string>();
      for (const s of view.sessions) {
        for (const p of block(fx.start_period, s.duration)) {
          for (const g of s.groups)
            for (const x of occ.group(g, fx.day, p)) holders.add(x);
          for (const x of occ.faculty(s.faculty_id, fx.day, p)) holders.add(x);
        }
      }
      for (const x of holders) {
        if (pinnedSessions.has(x)) {
          extra.push(
            `the placement of ${x} collides with ${unitName(view)}, fixed at ${slotLabel(fx.day, fx.start_period)}`,
          );
        }
      }
    }
    out.push(
      ...conflictEntries(occ, view, {
        extra,
        issues: model.issues,
        chainDepth: args.limits.maxDepth,
      }),
    );
  }
  for (const [sid, texts] of issues) {
    if (covered.has(sid)) continue;
    const more = texts.length - 1;
    out.push({
      session_id: sid,
      blocking: [],
      contradictions: texts,
      summary: `The placement of ${sid} can't hold: ${texts[0]}${more > 0 ? ` (and ${more} more)` : ""}.`,
    });
  }
  return out;
}

// ------------------------------------------------------------------------- change checks

/**
 * A problem in a change list or placement, found before anything runs: a `PathIssue` (`path`
 * like "changes[2].faculty_id" or "placements[0].room_id") with its severity.
 */
export type ChangeIssue = PathIssue & {
  /** `error` blocks the proposal (`400 VALIDATION_ERROR`); `warning` is stored on it. */
  severity: "error" | "warning";
};

/** Issues of each severity listed before the rest are counted in one closing issue. */
export const MAX_CHANGE_ISSUES = 20;
/** Bad days named in one warning before "and N more". */
const NAMED_DAYS = 5;

/**
 * Reference checks the validator would crash on or silently ignore: unknown faculty, room or
 * session ids, duplicate added ids, an added session whose course, groups or faculty don't exist
 * (counting faculty added earlier in the same list), placements of unknown or removed sessions,
 * unknown rooms. Days outside the calendar and non-teaching periods are a warning (they never
 * match a placement), one per change. At most {@link MAX_CHANGE_ISSUES} errors and as many
 * warnings are listed; each list then ends with one issue of that severity counting the rest.
 */
export function validateChanges(
  dataset: Dataset,
  changes: readonly DisruptionChange[],
  placements: readonly Assignment[] = [],
): ChangeIssue[] {
  const issues: ChangeIssue[] = [];
  const listed = { error: 0, warning: 0 };
  const cut: Record<ChangeIssue["severity"], { count: number; path: string }> =
    { error: { count: 0, path: "" }, warning: { count: 0, path: "" } };
  const add = (
    severity: ChangeIssue["severity"],
    path: string,
    message: string,
  ) => {
    if (listed[severity] < MAX_CHANGE_ISSUES) {
      listed[severity]++;
      issues.push({ path, message, severity });
    } else {
      if (cut[severity].count === 0) cut[severity].path = path;
      cut[severity].count++;
    }
  };
  const error = (path: string, message: string) => add("error", path, message);
  const warning = (path: string, message: string) =>
    add("warning", path, message);
  const calendar: readonly string[] = dataset.calendar.days;
  const faculty = new Set(dataset.faculty.map((f) => f.id));
  const addedFaculty = new Set<string>();
  const rooms = new Set(dataset.rooms.map((r) => r.id));
  const courses = new Set(dataset.courses.map((c) => c.id));
  const groups = new Set(dataset.student_groups.map((g) => g.id));
  const sessions = new Map(dataset.sessions.map((s) => [s.id, s]));
  const addedSessions = new Set<string>();
  const removed = new Set<string>();

  if (changes.length === 0 && placements.length === 0) {
    warning(
      "changes",
      "There are no changes or placements, so nothing changes.",
    );
  }

  /** One warning per change: no days or periods at all, or the ones that never match. */
  const checkWindow = (
    at: string,
    days: readonly string[],
    periods: readonly number[],
  ) => {
    if (days.length === 0 || periods.length === 0) {
      warning(
        at,
        "This change lists no days or no periods, so it has no effect.",
      );
      return;
    }
    const badDays = unique(days.filter((day) => !calendar.includes(day)));
    const badPeriods = unique(
      periods.filter((p) => !(p >= 1 && p <= LAST_TEACHING_PERIOD)),
    );
    if (badDays.length === 0 && badPeriods.length === 0) return;
    const parts: string[] = [];
    if (badDays.length > 0) {
      const named = badDays.slice(0, NAMED_DAYS).map((d) => clip(d, 12));
      const rest = badDays.length - named.length;
      const list =
        rest > 0 ? `${named.join(", ")} and ${rest} more` : listJoin(named);
      parts.push(
        `${list} ${badDays.length === 1 ? "is not a teaching day" : "are not teaching days"}`,
      );
    }
    if (badPeriods.length > 0) {
      parts.push(
        `${formatPeriods(badPeriods)} ${badPeriods.length === 1 ? "is" : "are"} outside the teaching periods P1–P${LAST_TEACHING_PERIOD}`,
      );
    }
    const path =
      badPeriods.length === 0
        ? `${at}.days`
        : badDays.length === 0
          ? `${at}.periods`
          : at;
    const one = badDays.length + badPeriods.length === 1;
    warning(
      path,
      `${parts.join(" and ")}, so ${one ? "it never affects" : "they never affect"} the timetable.`,
    );
  };

  changes.forEach((ch, i) => {
    const at = `changes[${i}]`;
    switch (ch.type) {
      case "faculty_unavailable":
        if (!faculty.has(ch.faculty_id)) {
          error(`${at}.faculty_id`, `Unknown faculty ${ch.faculty_id}.`);
        }
        checkWindow(at, ch.days, ch.periods);
        break;
      case "room_unavailable":
        if (!rooms.has(ch.room_id))
          error(`${at}.room_id`, `Unknown room ${ch.room_id}.`);
        checkWindow(at, ch.days, ch.periods);
        break;
      case "add_faculty": {
        const id = ch.faculty.id;
        if (faculty.has(id)) {
          error(
            `${at}.faculty.id`,
            addedFaculty.has(id)
              ? `Faculty ${id} is added twice.`
              : `Faculty ${id} already exists.`,
          );
        }
        faculty.add(id);
        addedFaculty.add(id);
        break;
      }
      case "add_session": {
        const s = ch.session;
        if (sessions.has(s.id)) {
          error(
            `${at}.session.id`,
            addedSessions.has(s.id)
              ? `Session ${s.id} is added twice.`
              : `Session ${s.id} already exists.`,
          );
        }
        if (!courses.has(s.course_id)) {
          error(`${at}.session.course_id`, `Unknown course ${s.course_id}.`);
        }
        s.groups.forEach((g, j) => {
          if (!groups.has(g))
            error(`${at}.session.groups[${j}]`, `Unknown group ${g}.`);
        });
        if (!faculty.has(s.faculty_id)) {
          error(
            `${at}.session.faculty_id`,
            `Unknown faculty ${s.faculty_id} (add it with an earlier add_faculty change).`,
          );
        }
        if (s.fixed_slot && !calendar.includes(s.fixed_slot.day)) {
          warning(
            `${at}.session.fixed_slot`,
            `${s.id} is fixed on ${s.fixed_slot.day}, which is not a teaching day, so it can never be placed.`,
          );
        }
        sessions.set(s.id, s);
        addedSessions.add(s.id);
        removed.delete(s.id);
        break;
      }
      case "remove_session":
        if (!sessions.has(ch.session_id)) {
          error(
            `${at}.session_id`,
            removed.has(ch.session_id)
              ? `Session ${ch.session_id} is already removed by an earlier change.`
              : `Unknown session ${ch.session_id}.`,
          );
        }
        sessions.delete(ch.session_id);
        addedSessions.delete(ch.session_id);
        removed.add(ch.session_id);
        break;
    }
  });

  const placedOnce = new Set<string>();
  placements.forEach((p, i) => {
    const at = `placements[${i}]`;
    const s = sessions.get(p.session_id);
    if (!s) {
      error(
        `${at}.session_id`,
        removed.has(p.session_id)
          ? `Session ${p.session_id} is removed by the changes, so it can't be placed.`
          : `Unknown session ${p.session_id}.`,
      );
    }
    if (placedOnce.has(p.session_id)) {
      error(
        `${at}.session_id`,
        `Session ${p.session_id} is placed more than once.`,
      );
    }
    placedOnce.add(p.session_id);
    if (!rooms.has(p.room_id))
      error(`${at}.room_id`, `Unknown room ${p.room_id}.`);
    if (!calendar.includes(p.day))
      error(`${at}.day`, `${p.day} is not a teaching day.`);
    const duration = s?.duration ?? 1;
    if (
      !isPyInt(p.start_period) ||
      p.start_period < 1 ||
      p.start_period + duration - 1 > LAST_TEACHING_PERIOD
    ) {
      error(
        `${at}.start_period`,
        `A ${duration}-period session starting at P${p.start_period} runs outside P1–P${LAST_TEACHING_PERIOD}.`,
      );
    }
  });
  for (const severity of ["error", "warning"] as const) {
    const { count, path } = cut[severity];
    if (count > 0)
      issues.push({
        path,
        message: `… and ${count} more ${severity === "error" ? (count === 1 ? "problem" : "problems") : count === 1 ? "warning" : "warnings"} like these.`,
        severity,
      });
  }
  return issues;
}

/** "MON–FRI" or "MON P1–P3": periods are left out when they cover every teaching period. */
function windowText(
  days: readonly string[],
  periods: readonly number[],
  calendar: readonly string[],
): string {
  const d = formatDays(days, calendar);
  let all = true;
  for (let p = 1; p <= LAST_TEACHING_PERIOD; p++)
    if (!periods.includes(p)) all = false;
  return all ? d : `${d} ${formatPeriods(periods)}`.trim();
}

/** Parts listed in a title before "+N more". */
const TITLE_PARTS = 6;

/** One-line title, e.g. "F07 unavailable MON · CR-102 closed MON–FRI · add CS202-T2". */
export function describeChanges(
  dataset: Dataset,
  changes: readonly DisruptionChange[],
  placements: readonly Assignment[] = [],
): string {
  const calendar = dataset.calendar.days;
  const parts = changes.map((ch) => {
    switch (ch.type) {
      case "faculty_unavailable":
        return `${ch.faculty_id} unavailable ${windowText(ch.days, ch.periods, calendar)}`.trim();
      case "room_unavailable":
        return `${ch.room_id} closed ${windowText(ch.days, ch.periods, calendar)}`.trim();
      case "add_faculty":
        return `add faculty ${ch.faculty.id}`;
      case "add_session":
        return `add ${ch.session.id}`;
      case "remove_session":
        return `remove ${ch.session_id}`;
      default:
        return "unknown change";
    }
  });
  for (const p of placements) {
    parts.push(`move ${p.session_id} to ${slotLabel(p.day, p.start_period)}`);
  }
  if (parts.length === 0) return "No changes";
  if (parts.length <= TITLE_PARTS) return parts.join(" · ");
  const shown = parts.slice(0, TITLE_PARTS - 1);
  return `${shown.join(" · ")} · +${parts.length - shown.length} more`;
}

// ---------------------------------------------------------------------------- suggestions

/** Where the user wants the session. Empty or missing lists mean "any". */
export type MoveTarget = {
  days?: readonly Day[];
  /** The whole block must lie inside these periods. */
  periods?: readonly number[];
  /** Only this room (when given). */
  room_id?: string | null;
};

export type MoveOption = {
  placement: Assignment;
  moved_count: number;
  time_changed: number;
  room_only_changed: number;
  soft_delta: number;
  diff: MoveDiff[];
};

export type SuggestMovesResult = {
  /**
   * Best first: fewest moves, then fewest time changes, then lowest soft delta, then day/period
   * order (equal options that keep a Spectra booking's room or groups free come first).
   */
  options: MoveOption[];
  /** Why the target window has no option (empty when some option exists). */
  conflicts: ConflictEntry[];
  /** Candidate placements evaluated. */
  considered: number;
};

/** Default and largest number of options returned. */
export const DEFAULT_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 5;
/** Node budget of each candidate's repair, and the default wall-clock cap of a whole search. */
const SUGGEST_NODES = 40_000;
const SUGGEST_TIME_MS = 1_500;
/** Direct fits verified with a full repair beyond `limit` (spares in case some fail). */
const SPARE_RUNS = 2;
/** Feasible options gathered per requested one when placements need evictions. */
const EJECT_RUNS = 3;

/**
 * Engine-verified move options for one session (assistant, faculty requests): each option is a
 * feasible `reschedule` with that session pinned at a slot inside `target`, never its current
 * slot. `session_id` may be a session added by `changes` (an extra session).
 *
 * The changed dataset's model is built once. Candidate starts are screened against the repaired
 * timetable with the session lifted out: starts it fits without moving anything are verified
 * first (cheapest first); starts that need evictions are tried only when fewer than `limit`
 * direct options hold. Each verified option is the full repair with the session pinned there.
 */
export function suggestMoves(input: {
  dataset: Dataset;
  baseline: readonly Assignment[];
  session_id: string;
  changes?: readonly DisruptionChange[];
  target?: MoveTarget;
  /** Default 3, at most 5. */
  limit?: number;
  options?: RescheduleOptions;
}): SuggestMovesResult {
  const opts = input.options ?? {};
  const now = opts.now ?? clockNow;
  const started = now();
  const limit = Math.min(
    MAX_SUGGESTIONS,
    Math.max(
      1,
      Math.floor(input.limit ?? DEFAULT_SUGGESTIONS) || DEFAULT_SUGGESTIONS,
    ),
  );
  const changes = input.changes ?? [];
  const changed = applyDisruption(input.dataset, { changes });
  const ctx = new RepairContext(changed, input.baseline);
  const { model, state, instance } = ctx;
  const sid = input.session_id;
  const m = ctx.memberIndex.get(sid);
  if (m === undefined) {
    return {
      options: [],
      conflicts: [
        {
          session_id: sid,
          blocking: [],
          contradictions: [`${sid} isn't in the timetable after the changes`],
          summary: `${sid} can't be moved: it isn't in the timetable after the changes.`,
        },
      ],
      considered: 0,
    };
  }
  const budgetMs = opts.timeBudgetMs ?? SUGGEST_TIME_MS;
  const deadline =
    started +
    (Number.isNaN(budgetMs) ? SUGGEST_TIME_MS : Math.max(0, budgetMs));
  const runLimits = (): SearchLimits => ({
    ...searchLimits(
      {
        maxDepth: opts.maxDepth,
        maxNodes: opts.maxNodes ?? SUGGEST_NODES,
        timeBudgetMs: 0,
      },
      DEFAULTS,
      now,
    ),
    deadline,
  });
  const softBefore = summary(buildInstance(input.dataset), input.baseline);
  const member = model.members[m];
  const u = member.unit;
  const unit = model.units[u];
  const pos = unit.members.indexOf(member);
  const view = ctx.unitView(u);

  const base = ctx.run([], runLimits());
  const baseAssignments = state.toAssignments();

  // The requested window, without the session's current start (unless a new room is asked for).
  const target = input.target ?? {};
  const days = target.days?.length ? new Set<string>(target.days) : null;
  const periods = target.periods?.length ? new Set(target.periods) : null;
  const roomTarget = target.room_id ?? null;
  const roomIdx =
    roomTarget === null ? undefined : model.roomIndex.get(roomTarget);
  const hasBase = ctx.hasBase[m] === 1;
  const curSlot = ctx.baseSlot[m];
  const curRoom = ctx.baseRoom[m];
  const inWindow = (st: Start) =>
    (!days || days.has(st.day)) &&
    (!periods ||
      view.sessions.every((s) =>
        block(st.start_period, s.duration).every((p) => periods.has(p)),
      ));
  const isCurrent = (slot: number) =>
    hasBase && slot === curSlot && (roomTarget === null || roomIdx === curRoom);
  const windowStarts = structuralStarts(instance, view).filter(
    (st) =>
      inWindow(st) &&
      !isCurrent(slotOf(model.days.indexOf(st.day), st.start_period)),
  );
  const considered = windowStarts.length;
  const startSet = new Set(
    windowStarts.map((st) =>
      slotOf(model.days.indexOf(st.day), st.start_period),
    ),
  );
  const roomOk =
    roomTarget === null ||
    (roomIdx !== undefined &&
      !roomRuleBroken(model.rooms[roomIdx], member.session));

  // Screen candidate starts in the repaired timetable with the unit lifted out.
  type Candidate = {
    slot: number;
    room: number;
    moves: number;
    time: number;
    obj: number;
    lb: number;
  };
  const direct: Candidate[] = [];
  const eject: Candidate[] = [];
  if (roomOk) {
    const wasPlaced = state.isPlaced(u);
    const baseRooms = new Int32Array(unit.members.length);
    if (wasPlaced) state.roomsOf(u, baseRooms);
    const [unitMoves] = wasPlaced
      ? ctx.movesAt(u, state.unitSlot[u], baseRooms)
      : [0];
    const otherMoves =
      base.unplaced.length === 0 ? countMoves(ctx) - unitMoves : 0;
    if (wasPlaced) state.remove(u);
    const rooms = new Int32Array(unit.members.length);
    const blockers: number[] = [];
    for (const slot of unit.starts) {
      if (!startSet.has(slot)) continue;
      rooms.fill(-1);
      if (roomIdx !== undefined) rooms[pos] = roomIdx;
      const filled = chooseRooms(ctx, u, slot, rooms);
      if (filled && state.canPlace(u, slot, rooms)) {
        const [moves, time] = ctx.movesAt(u, slot, rooms);
        state.place(u, slot, rooms);
        const obj = state.objective;
        state.remove(u);
        direct.push({
          slot,
          room: rooms[pos],
          moves: otherMoves + moves,
          time,
          obj,
          lb: 0,
        });
        continue;
      }
      if (!filled) openRooms(ctx, u, slot, rooms);
      if (rooms.some((r) => r < 0)) continue;
      if (!state.conflicts(u, slot, rooms, blockers)) continue;
      if (blockers.some((v) => model.units[v].fixed)) continue;
      eject.push({
        slot,
        room: rooms[pos],
        moves: 0,
        time: 0,
        obj: 0,
        lb: blockers.length,
      });
    }
  }

  const options: MoveOption[] = [];
  /** Fest cost of each option: a tie-break that keeps Spectra bookings' rooms and groups free. */
  const festOf = new Map<MoveOption, number>();
  const tryPin = (c: Candidate) => {
    const pin: Assignment = {
      session_id: sid,
      day: model.days[dayOfSlot(c.slot)] as Day,
      start_period: periodOfSlot(c.slot),
      room_id: model.rooms[c.room].id,
    };
    const limits = runLimits();
    const outcome = ctx.run([pin], limits);
    const result = assemble({
      ctx,
      outcome,
      original: input.dataset,
      changed,
      changes,
      baseline: input.baseline,
      pins: [pin],
      limits,
      softBefore,
      started,
      now,
    });
    if (!result.feasible) return;
    const option: MoveOption = {
      placement: pin,
      moved_count: result.moved_count,
      time_changed: result.time_changed,
      room_only_changed: result.room_only_changed,
      soft_delta: result.soft_delta,
      diff: result.diff,
    };
    options.push(option);
    festOf.set(option, ctx.state.festCost);
  };
  direct.sort(
    (a, b) =>
      a.moves - b.moves || a.time - b.time || a.obj - b.obj || a.slot - b.slot,
  );
  for (const c of direct.slice(0, limit + SPARE_RUNS)) {
    if (options.length >= limit + SPARE_RUNS || now() > deadline) break;
    tryPin(c);
  }
  if (options.length < limit) {
    // Placements that evict: the fewest blockers first, a few more runs than needed so the
    // choice isn't just the earliest days.
    eject.sort((a, b) => a.lb - b.lb || a.slot - b.slot);
    const want = options.length + EJECT_RUNS * limit;
    let runs = 0;
    for (const c of [...direct.slice(limit + SPARE_RUNS), ...eject]) {
      if (options.length >= want || runs >= want * 2 || now() > deadline) break;
      runs++;
      tryPin(c);
    }
  }

  const dayIndex = (d: string) => model.days.indexOf(d);
  options.sort(
    (a, b) =>
      a.moved_count - b.moved_count ||
      a.time_changed - b.time_changed ||
      a.soft_delta - b.soft_delta ||
      (festOf.get(a) ?? 0) - (festOf.get(b) ?? 0) ||
      dayIndex(a.placement.day) - dayIndex(b.placement.day) ||
      a.placement.start_period - b.placement.start_period ||
      (model.roomIndex.get(a.placement.room_id) ?? 0) -
        (model.roomIndex.get(b.placement.room_id) ?? 0),
  );
  const chosen = options.slice(0, limit);

  let conflicts: ConflictEntry[] = [];
  if (chosen.length === 0) {
    const others = new Set(view.sessions.map((s) => s.id));
    const occ = new Occupancy(
      instance,
      baseAssignments.filter((a) => !others.has(a.session_id)),
    );
    conflicts = conflictEntries(occ, view, {
      starts: windowStarts,
      window: Boolean(days || periods || roomTarget),
      issues: model.issues,
      room: roomTarget === null ? null : { member: pos, room_id: roomTarget },
    }).filter((e) => e.session_id === sid);
  }
  return { options: chosen, conflicts, considered };
}

/** Moved sessions of the state the context holds (validator semantics, placed sessions only). */
function countMoves(ctx: RepairContext): number {
  const { model, state } = ctx;
  let moved = 0;
  for (const mem of model.members) {
    const r = state.memberRoom[mem.index];
    if (r === -1 || !ctx.hasBase[mem.index]) continue;
    if (
      state.unitSlot[mem.unit] !== ctx.baseSlot[mem.index] ||
      r !== ctx.baseRoom[mem.index]
    ) {
      moved++;
    }
  }
  return moved;
}

function roomOpenFree(
  ctx: RepairContext,
  r: number,
  slot: number,
  duration: number,
  freeOnly: boolean,
): boolean {
  const base = r * ctx.model.slotCount + slot;
  for (let k = 0; k < duration; k++) {
    const cell = ctx.state.roomOcc[base + k];
    if (freeOnly ? cell !== FREE : cell < FREE) return false;
  }
  return true;
}

/**
 * Free rooms for the members of `rooms` still at -1, all distinct: every member's baseline room
 * first when it suits and is free, then preference order. False when some member has none.
 */
function chooseRooms(
  ctx: RepairContext,
  u: number,
  slot: number,
  rooms: Int32Array,
): boolean {
  const unit = ctx.model.units[u];
  const free = (r: number, duration: number) =>
    !rooms.includes(r) && roomOpenFree(ctx, r, slot, duration, true);
  unit.members.forEach((mem, i) => {
    const br = ctx.baseRoom[mem.index];
    if (
      rooms[i] === -1 &&
      br !== -1 &&
      ctx.baseRoomSuits[mem.index] &&
      free(br, mem.duration)
    ) {
      rooms[i] = br;
    }
  });
  for (let oi = 0; oi < unit.roomOrder.length; oi++) {
    const i = unit.roomOrder[oi];
    if (rooms[i] !== -1) continue;
    const mem = unit.members[i];
    const pick = Array.from(mem.rooms).find((r) => free(r, mem.duration));
    if (pick === undefined) return false;
    rooms[i] = pick;
  }
  return true;
}

/** Open (possibly occupied) rooms for the members still at -1, for a placement that evicts. */
function openRooms(
  ctx: RepairContext,
  u: number,
  slot: number,
  rooms: Int32Array,
): void {
  const unit = ctx.model.units[u];
  for (let oi = 0; oi < unit.roomOrder.length; oi++) {
    const i = unit.roomOrder[oi];
    if (rooms[i] !== -1) continue;
    const mem = unit.members[i];
    const pick = Array.from(mem.rooms).find(
      (r) =>
        !rooms.includes(r) && roomOpenFree(ctx, r, slot, mem.duration, false),
    );
    rooms[i] = pick ?? -1;
  }
}
