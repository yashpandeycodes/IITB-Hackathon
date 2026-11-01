/**
 * Scoring for `scripts/ai-eval.ts` (backend.md §5.6). Pure (no AI layer, no database), so
 * `ai-eval-scoring.test.ts` can pin the rules the reported accuracy depends on.
 *
 * Per field, against the dataset's structured request:
 * - attendance, duration_periods: exact;
 * - windows: set equality, the expected `to_period` clamped to the last period (P13);
 * - needs, mandatory_for_groups: set equality;
 * - room_types: at least one shared type (the gated metric). The exact set is reported too
 *   (`roomTypesExact`, `exactAccuracyOf`), never gated.
 *
 * A series (requests sharing a `series_id` and the same text, e.g. SER-DANCE) is one text: the
 * parsed windows plus the same periods on every `repeat_days` day must equal the union of all
 * members' windows.
 */

export const EVAL_FIELDS = [
  "attendance",
  "duration_periods",
  "windows",
  "needs",
  "room_types",
  "mandatory_for_groups",
] as const;
export type EvalField = (typeof EVAL_FIELDS)[number];

/** The calendar's last period (P13, 21:00–22:00). */
export const LAST_PERIOD = 13;

export type EvalWindow = {
  day: string;
  from_period: number;
  to_period: number;
};

/** The scored fields, as the dataset states them or as the parser drafted them. */
export type FieldValues = {
  attendance: number | null;
  duration_periods: number | null;
  windows: readonly EvalWindow[];
  needs: readonly string[];
  room_types: readonly string[];
  mandatory_for_groups: readonly string[];
};

/** A parsed draft's scored fields plus its repeat days (a series). */
export type ParsedValues = FieldValues & { repeat_days: readonly string[] };

export type FieldScores = Record<EvalField, boolean>;

export function clampWindow(window: EvalWindow): EvalWindow {
  return {
    day: window.day,
    from_period: Math.min(window.from_period, LAST_PERIOD),
    to_period: Math.min(window.to_period, LAST_PERIOD),
  };
}

export function windowKey(window: EvalWindow): string {
  return `${window.day}:${window.from_period}-${window.to_period}`;
}

/** "MON P4–P5", or "MON P11" for a one-period window. */
export function windowLabel(window: EvalWindow): string {
  const { day, from_period: from, to_period: to } = window;
  return from === to ? `${day} P${from}` : `${day} P${from}–P${to}`;
}

/** `windows` plus the same periods on every repeat day, without duplicates. */
export function expandRepeatDays(
  windows: readonly EvalWindow[],
  repeatDays: readonly string[],
): EvalWindow[] {
  const out = new Map<string, EvalWindow>();
  const add = (window: EvalWindow) => out.set(windowKey(window), window);
  for (const window of windows) {
    add(window);
    for (const day of repeatDays) add({ ...window, day });
  }
  return [...out.values()];
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}

export function sharesAny(a: readonly string[], b: readonly string[]): boolean {
  const right = new Set(b);
  return a.some((x) => right.has(x));
}

/** Windows match when the clamped sets are equal (repeat days expanded on the parsed side). */
export function sameWindows(
  expected: readonly EvalWindow[],
  got: readonly EvalWindow[],
  repeatDays: readonly string[] = [],
): boolean {
  return sameSet(
    expected.map((w) => windowKey(clampWindow(w))),
    expandRepeatDays(got, repeatDays).map((w) => windowKey(clampWindow(w))),
  );
}

export function scoreFields(
  expected: FieldValues,
  got: ParsedValues,
): FieldScores {
  return {
    attendance: got.attendance === expected.attendance,
    duration_periods: got.duration_periods === expected.duration_periods,
    windows: sameWindows(expected.windows, got.windows, got.repeat_days),
    needs: sameSet(expected.needs, got.needs),
    room_types: sharesAny(expected.room_types, got.room_types),
    mandatory_for_groups: sameSet(
      expected.mandatory_for_groups,
      got.mandatory_for_groups,
    ),
  };
}

/** Room types as an exact set (reported next to the gated any-overlap score). */
export function roomTypesExact(
  expected: Pick<FieldValues, "room_types">,
  got: Pick<FieldValues, "room_types">,
): boolean {
  return sameSet(expected.room_types, got.room_types);
}

/** A field's value as text for the misses table. */
export function fieldLabel(values: FieldValues, field: EvalField): string {
  if (field === "windows") {
    const windows = values.windows.map(clampWindow);
    return windows.length ? windows.map(windowLabel).join(", ") : "(none)";
  }
  const value = values[field];
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(none)";
  return value === null ? "null" : String(value);
}

// --------------------------------------------------------------------------- dataset units

/** The fields of a dataset booking request the eval reads. */
export type DatasetRequestLike = {
  id: string;
  series_id: string | null;
  raw_text?: string;
  attendance: number;
  duration_periods: number;
  windows: readonly EvalWindow[];
  needs: readonly string[];
  room_types: readonly string[];
  mandatory_for_groups: readonly string[];
};

/** One text to parse and the fields it should produce. */
export type EvalUnit = {
  /** The request id, or the series id for a series. */
  id: string;
  request_ids: string[];
  text: string;
  expected: FieldValues;
};

/**
 * The dataset's requests as texts to parse, in dataset order. Requests sharing a `series_id` and
 * a text become one unit whose expected windows are the union of the members' windows (the other
 * fields are the first member's). Requests without `raw_text` are skipped.
 */
export function datasetUnits(
  requests: readonly DatasetRequestLike[],
): EvalUnit[] {
  const units = new Map<string, EvalUnit>();
  for (const request of requests) {
    const text = request.raw_text?.trim();
    if (!text) continue;
    const key = request.series_id
      ? `series:${request.series_id}\u0000${text}`
      : `request:${request.id}`;
    const unit = units.get(key);
    if (unit) {
      unit.request_ids.push(request.id);
      unit.expected = {
        ...unit.expected,
        windows: [...unit.expected.windows, ...request.windows],
      };
      continue;
    }
    units.set(key, {
      id: request.series_id ?? request.id,
      request_ids: [request.id],
      text,
      expected: {
        attendance: request.attendance,
        duration_periods: request.duration_periods,
        windows: [...request.windows],
        needs: [...request.needs],
        room_types: [...request.room_types],
        mandatory_for_groups: [...request.mandatory_for_groups],
      },
    });
  }
  return [...units.values()];
}

// ------------------------------------------------------------------------------- accuracy

export type FieldTally = { correct: number; total: number; accuracy: number };

export type Accuracy = {
  fields: Record<EvalField, FieldTally>;
  /**
   * Correct field checks over all field checks. Every text scores all six fields, so this is
   * also the mean of the per-field accuracies. This is what `--min` gates.
   */
  overall: FieldTally;
  /** The weakest field's accuracy (reported alongside). */
  min_field: number;
};

function tally(correct: number, total: number): FieldTally {
  return { correct, total, accuracy: total === 0 ? 0 : correct / total };
}

export function accuracyOf(scores: readonly FieldScores[]): Accuracy {
  const fields = Object.fromEntries(
    EVAL_FIELDS.map((field) => [
      field,
      tally(scores.filter((s) => s[field]).length, scores.length),
    ]),
  ) as Record<EvalField, FieldTally>;
  const correct = EVAL_FIELDS.reduce((n, f) => n + fields[f].correct, 0);
  return {
    fields,
    overall: tally(correct, scores.length * EVAL_FIELDS.length),
    min_field: Math.min(...EVAL_FIELDS.map((f) => fields[f].accuracy)),
  };
}

/** Room types scored as exact sets, and the overall accuracy with that rule instead. */
export type ExactAccuracy = { room_types: FieldTally; overall: FieldTally };

/**
 * The same tally as `accuracyOf`, but with `room_types` counted only when the set is exact
 * (`exact[i]` for `scores[i]`). Reported alongside; the gate stays on `accuracyOf`.
 */
export function exactAccuracyOf(
  scores: readonly FieldScores[],
  exact: readonly boolean[],
): ExactAccuracy {
  const base = accuracyOf(scores);
  const correct = exact.filter(Boolean).length;
  return {
    room_types: tally(correct, scores.length),
    overall: tally(
      base.overall.correct - base.fields.room_types.correct + correct,
      base.overall.total,
    ),
  };
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

// ------------------------------------------------------------------- assistant intents

/** What an assistant intent extraction produced, as the eval reads it. */
export type IntentLike = {
  intent: string;
  session: {
    course_id: string | null;
    kind: string | null;
    day: string | null;
    start_period: number | null;
    session_id: string | null;
  };
  target: {
    days: readonly string[];
    periods: readonly number[];
    room_id: string | null;
  };
  new_session: { course_id: string | null; kind: string | null };
  faculty_hint: string | null;
};

/** The code-read signals the eval scores (rule-bypass asks, a time outside teaching hours). */
export type SignalsLike = { bypass: boolean; outsideHours: string | null };

/**
 * What an assistant case expects. `intent` is always scored; every other field only when given
 * (days and periods as sets, `outside_hours` as "some outside-hours reading").
 */
export type IntentExpectation = {
  intent: string;
  course_id?: string | null;
  kind?: string | null;
  day?: string | null;
  start_period?: number | null;
  session_id?: string | null;
  days?: readonly string[];
  periods?: readonly number[];
  room_id?: string | null;
  new_course?: string | null;
  new_kind?: string | null;
  faculty_hint?: string | null;
  bypass?: boolean;
  outside_hours?: boolean;
};

export type IntentCheck = {
  field: string;
  pass: boolean;
  expected: string;
  got: string;
};

const show = (value: unknown) =>
  Array.isArray(value)
    ? value.length > 0
      ? value.join(", ")
      : "(none)"
    : value === null || value === undefined
      ? "null"
      : String(value);

/** One check per expected field: intent kind first, then the fields the case names. */
export function scoreIntent(
  expected: IntentExpectation,
  got: { intent: IntentLike; signals: SignalsLike },
): IntentCheck[] {
  const { intent, signals } = got;
  const checks: IntentCheck[] = [];
  const exact = (field: string, want: unknown, have: unknown) =>
    checks.push({
      field,
      pass: want === have,
      expected: show(want),
      got: show(have),
    });
  const set = (
    field: string,
    want: readonly (string | number)[],
    have: readonly (string | number)[],
  ) =>
    checks.push({
      field,
      pass: sameSet(want.map(String), have.map(String)),
      expected: show(want),
      got: show(have),
    });

  exact("intent", expected.intent, intent.intent);
  if (expected.course_id !== undefined)
    exact("course_id", expected.course_id, intent.session.course_id);
  if (expected.kind !== undefined)
    exact("kind", expected.kind, intent.session.kind);
  if (expected.day !== undefined)
    exact("day", expected.day, intent.session.day);
  if (expected.start_period !== undefined)
    exact("start_period", expected.start_period, intent.session.start_period);
  if (expected.session_id !== undefined)
    exact("session_id", expected.session_id, intent.session.session_id);
  if (expected.days !== undefined)
    set("target.days", expected.days, intent.target.days);
  if (expected.periods !== undefined)
    set("target.periods", expected.periods, intent.target.periods);
  if (expected.room_id !== undefined)
    exact("target.room_id", expected.room_id, intent.target.room_id);
  if (expected.new_course !== undefined)
    exact(
      "new_session.course_id",
      expected.new_course,
      intent.new_session.course_id,
    );
  if (expected.new_kind !== undefined)
    exact("new_session.kind", expected.new_kind, intent.new_session.kind);
  if (expected.faculty_hint !== undefined)
    exact("faculty_hint", expected.faculty_hint, intent.faculty_hint);
  if (expected.bypass !== undefined)
    exact("bypass", expected.bypass, signals.bypass);
  if (expected.outside_hours !== undefined)
    exact(
      "outside_hours",
      expected.outside_hours,
      signals.outsideHours !== null,
    );
  return checks;
}

export type IntentAccuracy = {
  /** Correct field checks over all field checks (what the gate reads). */
  checks: FieldTally;
  /** Cases whose intent kind is right. */
  intent: FieldTally;
  /** Cases whose every check passes. */
  cases: FieldTally;
};

export function intentAccuracyOf(
  results: readonly (readonly IntentCheck[])[],
): IntentAccuracy {
  const all = results.flat();
  return {
    checks: tally(all.filter((c) => c.pass).length, all.length),
    intent: tally(
      results.filter((r) => r.find((c) => c.field === "intent")?.pass).length,
      results.length,
    ),
    cases: tally(
      results.filter((r) => r.length > 0 && r.every((c) => c.pass)).length,
      results.length,
    ),
  };
}
