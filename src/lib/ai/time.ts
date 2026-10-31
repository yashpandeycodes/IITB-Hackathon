/**
 * Days, clock times and durations → windows over the calendar's periods (backend.md §5.3).
 * Periods come from the calendar's clock table (`ctx.calendar.periods`), never from a fixed
 * formula: with the dataset's calendar, 08:00 opens P1, lunch (13:00–14:00) is not a period, and
 * 21:00–22:00 is P13. Pure.
 */
import type { Day, ExtractedWindow } from "@/lib/contracts";

import type { ParseContext } from "./types";
import { ENGLISH_NUMBERS, HINDI_NUMBERS, clockToMinutes, uniq } from "./text";

type DayName = Day | "SAT" | "SUN";
type Meridiem = "am" | "pm";

/**
 * Conditions the post-processing turns into assumption chips and follow-up questions:
 * `lunch` a start inside the lunch break, `lunch_end` a range that ends inside it.
 */
export type TimeFlag =
  "lunch" | "lunch_end" | "past_end" | "before_start" | "weekend";

/**
 * A clock time the text gives that can't be used as written: `invalid` ("25:00": no such time),
 * `night` ("12 am", "3 am": the middle of the night, outside the bookable day) or `reversed`
 * ("9am to 8am": ends before it starts).
 */
export type TimeProblem = {
  kind: "invalid" | "night" | "reversed";
  text: string;
};

export type Schedule = {
  windows: ExtractedWindow[];
  repeat_days: Day[];
  /** Explicit ("2 hours") or from a clock range ("6 to 9 pm" = 3); null when not stated. */
  duration: number | null;
  assumptions: string[];
  flags: TimeFlag[];
  problems: TimeProblem[];
  /** A weekday was named or implied ("kal", "daily"). */
  hasDay: boolean;
  /** A clock time, a range or a vague part of the day was given. */
  hasTime: boolean;
};

export type Slot = {
  id: number;
  start: number;
  end: number;
  startClock: string;
  endClock: string;
};

const JS_WEEK: readonly DayName[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

const DAY_LABELS: Record<DayName, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

/** Weekday of `date` (`YYYY-MM-DD`) plus `offset` days; null for a malformed date. */
export function weekdayFromDate(date: string, offset = 0): DayName | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + offset),
  );
  return Number.isNaN(d.getTime()) ? null : JS_WEEK[d.getUTCDay()];
}

export function dayLabel(day: string): string {
  return DAY_LABELS[day as DayName] ?? day;
}

/** The calendar's periods in order, with clock times in minutes. */
export function calendarSlots(ctx: ParseContext): Slot[] {
  return [...ctx.calendar.periods]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: p.id,
      start: clockToMinutes(p.start),
      end: clockToMinutes(p.end),
      startClock: p.start,
      endClock: p.end,
    }));
}

/** `"14:00–18:00 (P6–P9)"`. */
export function windowLabel(slots: Slot[], from: number, to: number): string {
  const a = slots.find((s) => s.id === from);
  const b = slots.find((s) => s.id === to);
  const ids = from === to ? `P${from}` : `P${from}–P${to}`;
  return a && b ? `${a.startClock}–${b.endClock} (${ids})` : ids;
}

// ------------------------------------------------------------------------------------- days

const DAY_WORDS: readonly [RegExp, DayName][] = [
  [/\b(?:mondays?|mon|somv[ae]r|somw[ae]r)\b/g, "MON"],
  [/\b(?:tuesdays?|tues|tue|mangalv[ae]r|mangalw[ae]r)\b/g, "TUE"],
  [/\b(?:wednesdays?|wed|budhv[ae]r|budhw[ae]r)\b/g, "WED"],
  [/\b(?:thursdays?|thurs|thur|thu|guruv[ae]r|guruw[ae]r)\b/g, "THU"],
  [/\b(?:fridays?|fri|shukrav[ae]r|shukraw[ae]r)\b/g, "FRI"],
  [/\b(?:saturdays?|shaniv[ae]r|shaniw[ae]r)\b/g, "SAT"],
  [/\b(?:sundays?|raviv[ae]r|itv[a]+r|itw[a]+r)\b/g, "SUN"],
];

const RELATIVE_WORDS: readonly {
  re: RegExp;
  offset: number;
  meaning: string;
}[] = [
  {
    re: /\b(?:day after tomorrow|parso|parson|parsoon)\b/g,
    offset: 2,
    meaning: "the day after tomorrow",
  },
  { re: /\b(?:tomorrow|tmrw|tmr|kal)\b/g, offset: 1, meaning: "tomorrow" },
  { re: /\b(?:today|tonight|aaj)\b/g, offset: 0, meaning: "today" },
];

const DAILY_RE =
  /\b(?:daily|every\s?day|each day|all (?:of )?(?:the )?(?:fest )?week|(?:the )?whole (?:fest )?week|entire (?:fest )?week|all (?:five|5) days|rozana|roz|har din|poore? (?:hafte|week))\b/;
const SERIES_RE =
  /\b(?:both days|on both|each of|daily|all (?:these|those|three|two|four|the|of these) days)\b|\b(?:every|har)\s+(?:other\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)\w*|somv\w*|mangalv\w*|budhv\w*|guruv\w*|shukrav\w*|din|day|week)\b/;
const ALTERNATIVE_RE = /\bor\b|\/|\beither\b|\bya\b|\bany (?:one )?of\b/;

type DayMention = {
  day: DayName;
  index: number;
  end: number;
  relative?: string;
};

/** A day range ("Mon-Fri", "Monday to Friday", "somvar se budhvar tak"): every day in it. */
type DayRange = { text: string; index: number; days: DayName[] };

/** What joins the two ends of a day range. */
const DAY_RANGE_SEP = /^\s*(?:-|to|through|thru|till|until|upto|up to|se)\s*$/;
const WEEK_ORDER: readonly DayName[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

function mask(text: string, index: number, length: number): string {
  return text.slice(0, index) + " ".repeat(length) + text.slice(index + length);
}

/** Pairs of adjacent day names joined by "-", "to", "through", "till", "se" … as ranges. */
function findDayRanges(t: string, mentions: readonly DayMention[]) {
  const ranges: DayRange[] = [];
  const used = new Set<number>();
  for (let i = 0; i + 1 < mentions.length; i++) {
    const a = mentions[i];
    const b = mentions[i + 1];
    if (a.relative || b.relative || used.has(i)) continue;
    if (!DAY_RANGE_SEP.test(t.slice(a.end, b.index))) continue;
    const from = WEEK_ORDER.indexOf(a.day);
    const to = WEEK_ORDER.indexOf(b.day);
    if (from < 0 || to <= from) continue;
    ranges.push({
      text: t.slice(a.index, b.end),
      index: a.index,
      days: WEEK_ORDER.slice(from, to + 1),
    });
    used.add(i).add(i + 1);
  }
  return { ranges, used };
}

function findDays(t: string, referenceDate: string) {
  let work = t;
  const mentions: DayMention[] = [];
  const assumptions: string[] = [];
  for (const { re, offset, meaning } of RELATIVE_WORDS) {
    for (const m of t.matchAll(re)) {
      if (work.slice(m.index, m.index + m[0].length) !== m[0]) continue;
      const day = weekdayFromDate(referenceDate, offset);
      work = mask(work, m.index, m[0].length);
      if (!day) continue;
      mentions.push({
        day,
        index: m.index,
        end: m.index + m[0].length,
        relative: m[0],
      });
      assumptions.push(
        m[0] === meaning || m[0] === "tonight"
          ? `${m[0].charAt(0).toUpperCase()}${m[0].slice(1)} is ${dayLabel(day)} (${day})`
          : `'${m[0]}' read as ${meaning} (${day})`,
      );
    }
  }
  for (const [re, day] of DAY_WORDS) {
    for (const m of work.matchAll(re))
      mentions.push({ day, index: m.index, end: m.index + m[0].length });
  }
  mentions.sort((a, b) => a.index - b.index);
  return { mentions, assumptions: uniq(assumptions) };
}

// ------------------------------------------------------------------------------------ times

const MER = String.raw`(a\.?m\.?|p\.?m\.?|baje|bje)`;
const RANGE_RE = new RegExp(
  String.raw`(?<![\w:.\/-])(between\s+|from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*${MER}?\s*(to|till|until|upto|up to|-|and|se)\s*(\d{1,2})(?:[:.](\d{2}))?\s*${MER}?(?:\s*baje)?(?:\s*tak)?(?![\w])`,
  "g",
);
const SINGLE_RE = new RegExp(
  String.raw`(?<![\w:.\/-])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|baje|bje|o'?clock)(?![\w])`,
  "g",
);
const COLON_RE = /(?<![\w:.\/-])(\d{1,2}):(\d{2})(?![\w:])/g;
const AT_RE = /\b(?:at|@)\s*(\d{1,2})(?![\w:.])/g;
/** A number followed by one of these is a count or a duration, not a clock time. */
const UNIT_AFTER =
  /^\s*(?:hours?|hrs?|hr|ghante|ghanta|ghanton|minutes?|mins?|people|persons?|participants?|students?|log|days?|weeks?|years?|yrs?|%|members?|attendees?|guests?|spectators?|visitors?|dancers?|audience|seats?|x\b)/;

type Pref = Meridiem | null;

type Vague = {
  re: RegExp;
  /** Clock span the word covers; periods inside it form the window. */
  span: [string, string];
  pref: Meridiem;
};

const VAGUE: readonly Vague[] = [
  {
    re: /\b(?:after lunch|post[\s-]?lunch|lunch ke baad|afternoon|dopahar|dopeher|dupahar)\b/g,
    span: ["14:00", "18:00"],
    pref: "pm",
  },
  {
    re: /\b(?:morning|subah|forenoon)\b/g,
    span: ["08:00", "13:00"],
    pref: "am",
  },
  {
    re: /\b(?:evening|shaam|sham|evng)\b/g,
    span: ["18:00", "21:00"],
    pref: "pm",
  },
  {
    re: /\b(?:late night|night|raat|tonight)\b/g,
    span: ["18:00", "22:00"],
    pref: "pm",
  },
];

const LUNCH_ONLY_RE =
  /\b(?<!after |post |post-)(?:lunch(?:\s*time|\s*break)?)\b(?! ke baad)/;
const ALL_DAY_RE =
  /\b(?:all|full|whole|entire)[\s-]day\b|\bpo+ra din\b|\bpura din\b/;

function toHour(h: number, mer: Meridiem): number {
  if (mer === "am") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

/** An hour with no am/pm: context first, else 8–12 → morning/noon, 1–7 → afternoon/evening. */
function guessHour(h: number, pref: Pref): number {
  if (h > 12 || h === 0) return h;
  if (pref === "pm") return h === 12 ? 12 : h + 12;
  if (pref === "am") return h;
  return h >= 8 ? h : h + 12;
}

function meridiem(token: string | undefined): Meridiem | null {
  if (!token) return null;
  if (token.startsWith("a")) return "am";
  if (token.startsWith("p")) return "pm";
  return null;
}

function vagueHits(t: string) {
  const hits: { vague: Vague; index: number; word: string }[] = [];
  for (const vague of VAGUE) {
    for (const m of t.matchAll(vague.re))
      hits.push({ vague, index: m.index, word: m[0] });
  }
  return hits.sort((a, b) => a.index - b.index);
}

function prefNear(hits: ReturnType<typeof vagueHits>, index: number): Pref {
  let best: { d: number; pref: Meridiem } | null = null;
  for (const h of hits) {
    const d = Math.abs(h.index - index);
    if (!best || d < best.d) best = { d, pref: h.vague.pref };
  }
  return best?.pref ?? null;
}

/**
 * A clock range in minutes after midnight. The end may come out before the start ("9am to 8am");
 * an end in the small hours after an evening start runs past midnight ("9 pm to 1 am" = 21:00 to
 * 25:00) so the requested length survives.
 */
function resolveRange(
  h1: number,
  m1: number,
  mer1: Meridiem | null,
  h2: number,
  m2: number,
  mer2: Meridiem | null,
  pref: Pref,
): [number, number] {
  let a = h1 > 12 ? h1 : mer1 ? toHour(h1, mer1) : null;
  let b = h2 > 12 ? h2 : mer2 ? toHour(h2, mer2) : null;
  if (a === null && b !== null) {
    const mer = mer2 ?? (b >= 12 ? "pm" : "am");
    a = toHour(h1, mer);
    if (a * 60 + m1 >= b * 60 + m2) a = toHour(h1, mer === "pm" ? "am" : "pm");
  } else if (a !== null && b === null) {
    const mer = mer1 ?? (a >= 12 ? "pm" : "am");
    b = toHour(h2, mer);
    if (b * 60 + m2 <= a * 60 + m1) b = toHour(h2, mer === "pm" ? "am" : "pm");
    if (b * 60 + m2 <= a * 60 + m1) b += 24;
  } else if (a === null || b === null) {
    a = guessHour(h1, pref);
    b = guessHour(h2, pref);
    if (b <= a && b + 12 <= 24) b += 12;
  } else if (b * 60 + m2 <= a * 60 + m1 && mer2 === "am" && a >= 12) {
    b += 24;
  }
  let end = b * 60 + m2;
  const start = a * 60 + m1;
  if (end <= start && end === 0) end = 24 * 60;
  return [start, end];
}

type TimeHit =
  | { kind: "range"; index: number; start: number; end: number }
  | { kind: "single"; index: number; start: number };

/** Starts before this (00:00–05:59) are the middle of the night, not a bookable time. */
const NIGHT_END = 6 * 60;

/** A date ("12-13 Feb") after a number pair: not a clock range. */
const MONTH_AFTER =
  /^\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/;

const validClock = (h: number, m: number) =>
  h >= 0 && m >= 0 && m <= 59 && (h < 24 || (h === 24 && m === 0));

function findClockTimes(t: string): {
  hits: TimeHit[];
  problems: TimeProblem[];
} {
  let work = t;
  const vague = vagueHits(t);
  const hits: TimeHit[] = [];
  const problems: TimeProblem[] = [];

  for (const m of t.matchAll(RANGE_RE)) {
    const [all, prefix, h1s, m1s, mer1s, sep, h2s, m2s, mer2s] = m;
    const after = t.slice(m.index + all.length);
    if (UNIT_AFTER.test(after) || MONTH_AFTER.test(after)) continue;
    if (sep === "and" && !prefix?.startsWith("between")) continue;
    const h1 = Number(h1s);
    const h2 = Number(h2s);
    const mm1 = Number(m1s ?? 0);
    const mm2 = Number(m2s ?? 0);
    const text = all.trim();
    // Minutes or am/pm make it a clock time even when it is not a valid one ("25:00 to 26:00").
    const clockLike = Boolean(m1s || m2s || mer1s || mer2s);
    if (!validClock(h1, mm1) || !validClock(h2, mm2)) {
      if (clockLike) {
        problems.push({ kind: "invalid", text });
        work = mask(work, m.index, all.length);
      }
      continue;
    }
    const [start, end] = resolveRange(
      h1,
      mm1,
      meridiem(mer1s),
      h2,
      mm2,
      meridiem(mer2s),
      prefNear(vague, m.index),
    );
    work = mask(work, m.index, all.length);
    if (start < NIGHT_END) {
      problems.push({ kind: "night", text });
      continue;
    }
    if (end <= start) {
      // The start stands; the end is asked for.
      problems.push({ kind: "reversed", text });
      hits.push({ kind: "single", index: m.index, start });
      continue;
    }
    hits.push({ kind: "range", index: m.index, start, end });
  }

  const singles: [RegExp, boolean][] = [
    [SINGLE_RE, true],
    [COLON_RE, false],
    [AT_RE, false],
  ];
  for (const [re, marked] of singles) {
    for (const m of work.matchAll(re)) {
      const all = m[0];
      if (!marked && UNIT_AFTER.test(work.slice(m.index + all.length)))
        continue;
      const h = Number(m[1]);
      const mm = re === AT_RE ? 0 : Number(m[2] ?? 0);
      if (!validClock(h, mm)) {
        if (re !== AT_RE) {
          problems.push({ kind: "invalid", text: all.trim() });
          work = mask(work, m.index, all.length);
        }
        continue;
      }
      const mer = marked ? meridiem(m[3]) : null;
      const hour =
        h > 12
          ? h
          : mer
            ? toHour(h, mer)
            : guessHour(h, prefNear(vague, m.index));
      work = mask(work, m.index, all.length);
      if (hour * 60 + mm < NIGHT_END) {
        problems.push({ kind: "night", text: all.trim() });
        continue;
      }
      hits.push({ kind: "single", index: m.index, start: hour * 60 + mm });
    }
  }
  return { hits: hits.sort((a, b) => a.index - b.index), problems };
}

// -------------------------------------------------------------------------------- durations

const DURATION_RE =
  /(?<![\w.-])(\d+(?:\.\d+)?|half an?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ek|do|teen|chaar|char|paanch|panch|chhe|che|saat|aath|nau|das|dedh|dhaai|dhai)\s*-?\s*(?:(?:straight|full|whole|continuous|consecutive|solid)\s+)?(hours?|hrs?|hr|ghante|ghanta|ghanton|minutes?|mins?)\b/g;
const DURATION_RANGE_RE =
  /(?<![\w.-])(\d+)\s*(?:-|to|or)\s*(\d+)\s*(?:hours?|hrs?|ghante)\b/;

/** An explicit duration in periods (hours, rounded up), with a chip when it was rounded. */
export function findDuration(
  t: string,
): { periods: number; assumption: string | null } | null {
  const range = DURATION_RANGE_RE.exec(t);
  if (range) {
    const longest = Math.max(Number(range[1]), Number(range[2]));
    if (longest >= 1 && longest <= 13)
      return {
        periods: longest,
        assumption: `'${range[0]}' read as the longer ${longest} hours`,
      };
  }
  for (const m of t.matchAll(DURATION_RE)) {
    const [all, word, unit] = m;
    const hindiUnit = unit.startsWith("ghant");
    let amount: number | undefined;
    if (/^\d/.test(word)) amount = Number(word);
    else if (word.startsWith("half")) amount = 0.5;
    else if (word in HINDI_NUMBERS) {
      if (!hindiUnit) continue;
      amount = HINDI_NUMBERS[word];
    } else amount = ENGLISH_NUMBERS[word];
    if (amount === undefined || !(amount > 0)) continue;
    const hours = unit.startsWith("min") ? amount / 60 : amount;
    const periods = Math.min(13, Math.max(1, Math.ceil(hours - 1e-9)));
    return {
      periods,
      assumption:
        Math.abs(hours - periods) > 1e-9
          ? `'${all.trim()}' rounded up to ${periods} period${periods > 1 ? "s" : ""}`
          : null,
    };
  }
  return null;
}

// --------------------------------------------------------------------------------- schedule

const SPOKEN_HOUR = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

function spokenHour(token: string): number | null {
  const h = /^\d/.test(token) ? Number(token) : ENGLISH_NUMBERS[token];
  return h !== undefined && h >= 1 && h <= 12 ? h : null;
}

/**
 * Lower-cased text with "noon"/"midnight" and spoken times as clock times: "half past six" →
 * "6:30", "quarter past 5" → "5:15", "quarter to 6" → "5:45".
 */
function prepare(t: string): string {
  const spoken = (
    text: string,
    phrase: string,
    toClock: (h: number) => string,
  ) =>
    text.replace(
      new RegExp(String.raw`\b(?:a\s+)?${phrase}\s+${SPOKEN_HOUR}\b`, "g"),
      (all: string, token: string) => {
        const h = spokenHour(token);
        return h === null ? all : toClock(h);
      },
    );
  let out = t
    .replace(/\b(?:12\s*)?noon\b|\bmidday\b/g, "12 pm")
    .replace(/\b(?:12\s*)?midnight\b/g, "24:00");
  out = spoken(out, "half\\s+past", (h) => `${h}:30`);
  out = spoken(out, "quarter\\s+past", (h) => `${h}:15`);
  out = spoken(out, "quarter\\s+to", (h) => `${h === 1 ? 12 : h - 1}:45`);
  return out;
}

function startSlot(
  slots: Slot[],
  min: number,
): { id: number; flag?: TimeFlag } {
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (min < first.start) return { id: first.id, flag: "before_start" };
  if (min >= last.end) return { id: last.id, flag: "past_end" };
  const slot = slots.find((s) => s.start <= min && min < s.end);
  if (slot) return { id: slot.id };
  const next = slots.find((s) => s.start > min) ?? last;
  return { id: next.id, flag: "lunch" };
}

function endSlot(slots: Slot[], min: number): { id: number; flag?: TimeFlag } {
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (min > last.end) return { id: last.id, flag: "past_end" };
  if (min <= first.start) return { id: first.id, flag: "before_start" };
  const before = slots.filter((s) => s.start < min);
  return { id: before[before.length - 1].id };
}

/**
 * Periods a clock range asks for: the calendar periods it overlaps plus whole hours outside the
 * calendar ("10 pm to midnight" = 2), so the requested length survives clamping to P13.
 */
function rangePeriods(slots: Slot[], start: number, end: number): number {
  const first = slots[0];
  const last = slots[slots.length - 1];
  const inside = slots.filter((s) => s.start < end && s.end > start).length;
  const after = Math.max(0, Math.ceil((end - Math.max(start, last.end)) / 60));
  const before = Math.max(
    0,
    Math.ceil((Math.min(end, first.start) - start) / 60),
  );
  return inside + after + before;
}

function spanToPeriods(
  slots: Slot[],
  [from, to]: [string, string],
): [number, number] | null {
  const a = clockToMinutes(from);
  const b = clockToMinutes(to);
  const inside = slots.filter((s) => s.start >= a && s.end <= b);
  if (inside.length === 0) return null;
  return [inside[0].id, inside[inside.length - 1].id];
}

/** The bookable periods a clock range covers, with the calendar problems it runs into. */
function rangeSpan(
  slots: Slot[],
  ctx: ParseContext,
  start: number,
  end: number,
): { from: number; to: number; periods: number; flags: TimeFlag[] } {
  const s = startSlot(slots, start);
  const e = endSlot(slots, end);
  const flags: TimeFlag[] = [];
  for (const f of [s.flag, e.flag]) if (f) flags.push(f);
  // "12 to 2": the range ends inside the lunch break, which is not a period.
  const lunchStart = clockToMinutes(ctx.calendar.lunch.start);
  const lunchEnd = clockToMinutes(ctx.calendar.lunch.end);
  if (start < lunchStart && end > lunchStart && end <= lunchEnd)
    flags.push("lunch_end");
  return {
    from: s.id,
    to: Math.max(s.id, e.id),
    periods: rangePeriods(slots, start, end),
    flags,
  };
}

/** Days, times and duration in `text` → windows (+ repeat days for a series). */
export function parseSchedule(text: string, ctx: ParseContext): Schedule {
  const base = text.replace(/\s+/g, " ");
  const lowerBase = base.toLowerCase();
  // Chips quote the text as written when lower-casing kept the indices.
  const display = lowerBase.length === base.length ? base : lowerBase;
  const t = prepare(lowerBase);
  const slots = calendarSlots(ctx);
  const assumptions: string[] = [];
  const flags = new Set<TimeFlag>();
  const calendarDays = ctx.calendar.days;
  const isCalendarDay = (d: DayName): d is Day =>
    (calendarDays as readonly string[]).includes(d);

  // Days.
  const { mentions, assumptions: dayChips } = findDays(
    lowerBase,
    ctx.referenceDate,
  );
  assumptions.push(...dayChips);
  if (/\bweekends?\b/.test(t)) flags.add("weekend");
  if (mentions.some((m) => m.day === "SAT" || m.day === "SUN"))
    flags.add("weekend");
  const order = (d: Day) => calendarDays.indexOf(d);
  const { ranges, used } = findDayRanges(lowerBase, mentions);
  let days = uniq(mentions.map((m) => m.day).filter(isCalendarDay));
  const daily = DAILY_RE.test(t);
  let series = false;
  if (ranges.length > 0) {
    // "Mon-Fri": every day of the range, one booking per day (a series).
    days = uniq([
      ...ranges.flatMap((r) => r.days),
      ...mentions.filter((_, i) => !used.has(i)).map((m) => m.day),
    ]).filter(isCalendarDay);
    series = days.length > 1;
    for (const range of ranges) {
      const inCalendar = range.days.filter(isCalendarDay);
      const quoted = display.slice(
        range.index,
        range.index + range.text.length,
      );
      if (inCalendar.length > 0)
        assumptions.push(
          `Read '${quoted}' as every day ${inCalendar[0]}–${inCalendar[inCalendar.length - 1]} (one booking per day)`,
        );
    }
  } else if (days.length === 0 && daily) {
    days = [...calendarDays];
    series = true;
  } else if (days.length >= 2) {
    const firstIdx = mentions[0].index;
    const lastIdx = mentions[mentions.length - 1].index;
    const between = lowerBase.slice(Math.max(0, firstIdx - 12), lastIdx);
    if (SERIES_RE.test(t) || daily) series = true;
    else if (ALTERNATIVE_RE.test(between)) series = false;
    else series = /\band\b|&|\bplus\b|\baur\b/.test(between);
  }
  days.sort((a, b) => order(a) - order(b));

  // Times.
  if (slots.length === 0) {
    return {
      windows: [],
      repeat_days: [],
      duration: null,
      assumptions,
      flags: [...flags],
      problems: [],
      hasDay: days.length > 0,
      hasTime: false,
    };
  }
  const first = slots[0];
  const last = slots[slots.length - 1];
  const explicit = findDuration(t);
  if (explicit?.assumption) assumptions.push(explicit.assumption);
  let duration: number | null = explicit?.periods ?? null;

  const { hits: clock, problems } = findClockTimes(t);
  const rangeHits = clock.filter(
    (h): h is Extract<TimeHit, { kind: "range" }> => h.kind === "range",
  );
  const single = clock.find((h) => h.kind === "single") ?? null;
  const vague = vagueHits(t)[0] ?? null;
  /** Period spans on each day: one per clock range ("9 to 10 and 4 to 5" gives two). */
  const spans: { from: number; to: number }[] = [];

  if (rangeHits.length > 0) {
    const lengths: number[] = [];
    for (const hit of rangeHits) {
      const span = rangeSpan(slots, ctx, hit.start, hit.end);
      for (const f of span.flags) flags.add(f);
      if (!spans.some((x) => x.from === span.from && x.to === span.to)) {
        spans.push({ from: span.from, to: span.to });
        lengths.push(span.periods);
      }
    }
    // Ranges of different lengths leave the length open (asked as a follow-up).
    if (duration === null && lengths.length > 0 && lengths[0] > 0)
      duration = lengths.every((n) => n === lengths[0])
        ? Math.min(13, lengths[0])
        : null;
  } else if (single) {
    const s = startSlot(slots, single.start);
    if (s.flag) flags.add(s.flag);
    let to = s.id;
    if (duration !== null) {
      to = s.id + duration - 1;
      if (to > last.id) {
        to = last.id;
        flags.add("past_end");
      }
    }
    spans.push({ from: s.id, to });
  } else if (vague) {
    const span = spanToPeriods(slots, vague.vague.span);
    if (span) {
      let [from, to] = span;
      assumptions.push(
        `'${vague.word}' read as ${windowLabel(slots, from, to)}`,
      );
      if (duration !== null && to - from + 1 < duration) {
        to = Math.min(last.id, from + duration - 1);
        from = Math.max(first.id, to - duration + 1);
        assumptions.push(
          `Widened to ${windowLabel(slots, from, to)} to fit ${duration} hours`,
        );
      }
      spans.push({ from, to });
    }
  } else if (ALL_DAY_RE.test(t)) {
    const span = spanToPeriods(slots, [first.startClock, "18:00"]);
    if (span) {
      const [from, to] = span;
      duration ??= to - from + 1;
      assumptions.push(`'all day' read as ${windowLabel(slots, from, to)}`);
      spans.push({ from, to });
    }
  } else if (LUNCH_ONLY_RE.test(t)) {
    const lunchEnd = clockToMinutes(ctx.calendar.lunch.end);
    const s = startSlot(slots, lunchEnd);
    flags.add("lunch");
    spans.push({ from: s.id, to: s.id });
  }
  const hasTime = spans.length > 0 || problems.length > 0;

  // No usable time: the whole day, unless the time given was unusable (then it is asked for).
  if (spans.length === 0 && problems.length === 0 && days.length > 0) {
    spans.push({ from: first.id, to: last.id });
    assumptions.push(
      `No time given: any time on ${days.join("/")}, ${windowLabel(slots, first.id, last.id)}`,
    );
  }

  const windows: ExtractedWindow[] = [];
  let repeat: Day[] = [];
  if (days.length > 0) {
    const used = series ? days.slice(0, 1) : days;
    for (const day of used)
      for (const span of spans)
        windows.push({ day, from_period: span.from, to_period: span.to });
    repeat = series && spans.length > 0 ? days.slice(1) : [];
  }

  return {
    windows,
    repeat_days: repeat,
    duration,
    assumptions: uniq(assumptions),
    flags: [...flags],
    problems,
    hasDay: days.length > 0,
    hasTime,
  };
}
