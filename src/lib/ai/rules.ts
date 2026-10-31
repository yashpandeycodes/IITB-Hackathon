/**
 * The offline rule parser (regex + lexicon, English and Hinglish): plain-language text → the same
 * `BookingDraftLLM` shape the LLM produces. It only extracts; validity, status and priority are
 * the engine's. Instructions inside the text ("ignore your rules", "I'm the Dean") are data and
 * change nothing. Pure.
 */
import type { BookingDraftLLM, Category } from "@/lib/contracts";

import { findGroupMentions, groupsSize, isMandatory } from "./groups";
import { explicitNeeds } from "./needs";
import { buildRoomIndex, findRequestedRoomText, roomTypeWords } from "./rooms";
import { parseSchedule } from "./time";
import type { ParseContext } from "./types";
import { cleanText, clip, uniq } from "./text";

// ------------------------------------------------------------------------------- attendance

const PEOPLE = String.raw`(?:people|persons?|participants?|students?|attendees?|audience|spectators?|dancers?|visitors?|guests?|members?|log|logon|logo|janta|pax|heads?|delegates?|viewers?|players?|performers?|kids|children|folks|singers|musicians|volunteers|crowd)`;
const APPROX = String.raw`(?:around|about|approx\.?|approximately|roughly|nearly|almost|~|lagbhag|takriban|maybe|perhaps|probably|over|more than|upto|up to|at least|at most|max(?:imum)?|expecting|expected|estimated)`;
const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*k\b|\d+)`;
const NOT_A_COUNT = String.raw`(?!\s*(?:[:.]\d|-\s*\d|am\b|pm\b|a\.m|p\.m|baje|hours?|hrs?|hr\b|ghante|ghanta|minutes?|mins?|days?|%|o'?clock|to\s+\d|th\b|st\b|nd\b|rd\b))`;

const COUNT_RE = new RegExp(
  String.raw`(?<![\w.,-])(?:(${APPROX})\s*)?${NUMBER}\s*(\+)?\s*(?:or so\s+)?${PEOPLE}\b`,
  "gi",
);
const BARE_APPROX_RE = new RegExp(
  String.raw`(?<![\w.,-])(${APPROX})\s*(\d{1,3}(?:,\d{3})+|\d{2,5})\b${NOT_A_COUNT}`,
  "gi",
);
const FOR_RE = new RegExp(
  String.raw`(?<![\w.,-])(?:for|of)\s+(?!20\d\d\b)(\d{2,4})\b${NOT_A_COUNT}`,
  "gi",
);
/** "100-150 people", "between 100 and 150 log": a range, read as its upper bound. */
const COUNT_RANGE_RE = new RegExp(
  String.raw`(?<![\w.,-])(?:between\s+)?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:-|to|or|and)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(\+)?\s*${PEOPLE}\b`,
  "gi",
);
const LABELLED_RE =
  /\b(?:headcount|head count|strength|capacity|attendance|crowd|audience|gathering)\s*(?:of|:|=|is|will be)?\s*(?:around|about|approx\.?|~)?\s*(\d{1,3}(?:,\d{3})+|\d{2,5})\b/gi;

function toCount(raw: string): number {
  const s = raw.replace(/,/g, "").trim();
  const n = /k$/i.test(s) ? Number.parseFloat(s) * 1000 : Number(s);
  return Math.round(n);
}

function approxChip(
  word: string | undefined,
  plus: boolean,
  n: number,
): string | null {
  const w = word?.toLowerCase();
  if (plus || w === "over" || w === "more than" || w === "at least")
    return `Attendance at least ${n}`;
  if (w === "upto" || w === "up to" || w === "at most" || w?.startsWith("max"))
    return `Attendance up to ${n}`;
  if (w) return `Attendance about ${n} (approximate)`;
  return null;
}

/** The head count ("around 450 people", "100 log", "maybe 150"); the largest if several. */
export function findAttendance(
  lower: string,
): { value: number; assumption: string | null } | null {
  const hits: { value: number; assumption: string | null }[] = [];
  for (const m of lower.matchAll(COUNT_RANGE_RE)) {
    const low = toCount(m[1]);
    const high = toCount(m[2]);
    if (!(high > low)) continue;
    hits.push({
      value: high,
      assumption: `Attendance ${low}–${high} read as the upper bound, ${high}`,
    });
  }
  for (const m of lower.matchAll(COUNT_RE)) {
    const value = toCount(m[2]);
    hits.push({ value, assumption: approxChip(m[1], Boolean(m[3]), value) });
  }
  if (hits.length === 0)
    for (const m of lower.matchAll(LABELLED_RE))
      hits.push({ value: toCount(m[1]), assumption: null });
  if (hits.length === 0)
    for (const m of lower.matchAll(BARE_APPROX_RE)) {
      const value = toCount(m[2]);
      hits.push({ value, assumption: approxChip(m[1], false, value) });
    }
  if (hits.length === 0)
    for (const m of lower.matchAll(FOR_RE))
      hits.push({ value: toCount(m[1]), assumption: null });
  const valid = hits.filter(
    (h) => Number.isInteger(h.value) && h.value > 0 && h.value < 100_000,
  );
  if (valid.length === 0) return null;
  return valid.reduce((best, h) => (h.value > best.value ? h : best));
}

// ------------------------------------------------------------------------------------ title

const EVENT_NOUNS = new Set(
  (
    "inauguration hackathon ideathon lecture lectures workshop rehearsal rehearsals prelims finals " +
    "play talk talks screening exhibition expo contest competition concert ceremony session " +
    "meeting meetup farewell quiz seminar webinar party show night watch wars sprint festival " +
    "orientation presentation interview interviews celebration gathering tournament match drive " +
    "camp bootcamp symposium conference summit gala launch debate recital performance jam standup " +
    "fair event function programme program practice audition auditions trials assembly briefing " +
    "training demo showcase round keynote panel discussion speaker meet hunt marathon " +
    "olympiad convocation"
  ).split(" "),
);

const TITLE_STOP = new Set(
  (
    "a an the our my we i us me you your they their it it's its this that these those is are am be " +
    "was were will would could can should shall may might do does need needs needed want wants " +
    "wanted like book booking booked please pls plz for of on in at to from with and or by during " +
    "get have has having hosting host hosts give priority so some any all every each also there " +
    "which who whom what when where room rooms hall halls venue place space somewhere lab labs " +
    "auditorium audi oat classroom classrooms theatre theater mark official level about around " +
    "approx approximately maybe expecting expected people persons participants students audience " +
    "spectators dancers visitors guests log members hours hour hrs hr straight minutes mins time " +
    "times between till until pm baje ghante ghanta chahiye kal aaj parso subah shaam sham raat " +
    "dopahar har se tak ko ke ki ka hai hain mein liye karna karni today tomorrow tonight morning " +
    "afternoon evening lunch after before week weeks preferably ideally ideal if free otherwise else " +
    "possible compulsory mandatory zaroori attendance required must wheelchair accessible projector " +
    "projectors mic mics microphone sound screen ac power points computers computer pc pcs " +
    "small big large main open air fine okay ok just only really very much many more most " +
    "daily also again one two three four five six seven eight nine ten half full whole entire day " +
    "days ignore rules approve approved request dean urgent bump not no yes thanks thank hi hello"
  ).split(" "),
);

const DAY_TOKEN =
  /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)$|^(?:mon|tues|wednes|thurs|fri|satur|sun)days?$|^(?:somv|mangalv|budhv|guruv|shukrav|shaniv|raviv)[ae]r$/;

const VAGUE_TITLE = new Set(["night", "evening", "morning", "afternoon"]);

function isBreak(token: string): boolean {
  const lower = token.toLowerCase().replace(/'s$/, "");
  if (/\d/.test(lower)) return true;
  if (TITLE_STOP.has(lower) || DAY_TOKEN.test(lower)) return true;
  return (
    lower.includes("-") &&
    lower
      .split("-")
      .every((p) => p === "" || TITLE_STOP.has(p) || DAY_TOKEN.test(p))
  );
}

function isEventNoun(tokens: string[], i: number): boolean {
  const lower = tokens[i].toLowerCase().replace(/'s$/, "");
  const last = lower.split("-").pop() ?? lower;
  if (last === "mic") return i > 0 && tokens[i - 1].toLowerCase() === "open";
  if (!EVENT_NOUNS.has(last)) return false;
  return !/^(?:halls?|rooms?|labs?)$/i.test(tokens[i + 1] ?? "");
}

function lastNoun(tokens: string[], from: number, to: number): number {
  for (let k = to - 1; k >= from; k--) if (isEventNoun(tokens, k)) return k;
  return -1;
}

/** A short event name ("Spectra inauguration", "Quiz prelims"), or null. */
export function findTitle(original: string): string | null {
  for (const segment of original.split(/[,.;:!?()"[\]{}]+|\s-\s/)) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length) {
      const open =
        tokens[i].toLowerCase() === "open" &&
        tokens[i + 1]?.toLowerCase() === "mic";
      if (isBreak(tokens[i]) && !open) {
        i++;
        continue;
      }
      let j = i;
      // "open" and "mic" are stop words on their own; together they name the event.
      while (j < tokens.length && (!isBreak(tokens[j]) || (open && j <= i + 1)))
        j++;
      const k = lastNoun(tokens, i, j);
      if (k >= 0 && !(k === i && VAGUE_TITLE.has(tokens[k].toLowerCase()))) {
        let end = k + 1;
        // "Screening of the LAN finals", "Session with an industry speaker".
        let idx = j;
        if (end === j && /^(?:of|with)$/i.test(tokens[idx] ?? "")) {
          idx++;
          if (/^(?:the|a|an)$/i.test(tokens[idx] ?? "")) idx++;
          let e = idx;
          while (e < tokens.length && !isBreak(tokens[e])) e++;
          const k2 = lastNoun(tokens, idx, e);
          if (k2 >= 0) end = k2 + 1;
        }
        const words = tokens.slice(i, end).slice(0, 8).join(" ");
        return clip(words.charAt(0).toUpperCase() + words.slice(1), 200);
      }
      i = j;
    }
  }
  if (/\bclub\b/i.test(original) && /\bmeets?\b|\bmeeting\b/i.test(original))
    return "Club meeting";
  return null;
}

// --------------------------------------------------------------------------- claims, extras

/** Claimed categories, highest priority first (informational only; the service caps them). */
const CLAIMS: readonly [RegExp, Category][] = [
  [
    /\b(?:for|is|it's|its|an|our|this)\s+(?:an?\s+|the\s+)?(?:exam|examination|mid[\s-]?sem|end[\s-]?sem)\b/,
    "exam",
  ],
  [
    /\b(?:regular (?:class|session|lecture)|extra class|make[\s-]?up class)\b/,
    "regular_session",
  ],
  [
    /\binstitute[\s-]?(?:level|event|wide)\b|\bofficial (?:spectra|fest)\b|\bmark it (?:as )?institute\b|\bspectra official\b/,
    "institute_event",
  ],
  [
    /\bguest[\s-]?(?:lecture|talk|speaker)\b|\bindustry (?:speaker|talk)\b|\binvited (?:talk|speaker|lecture)\b|\bdistinguished lecture\b/,
    "guest_lecture",
  ],
  [
    /\bdepartment(?:al)? (?:event|function|programme|program)\b|\bdept\.? event\b/,
    "department_event",
  ],
  [/\bclub event\b/, "club_event"],
];

export function findClaim(lower: string): Category | null {
  return CLAIMS.find(([re]) => re.test(lower))?.[1] ?? null;
}

const CONDITION_RE =
  /\bif\b[^,.;]*\b(?:free|available|busy|taken|booked|not|possible|full)\b|\botherwise\b|\bor else\b|\belse\b|\bwarna\b|\bnahin? to\b|\bpreferabl[ey]\b|\bideally\b|\bwould be ideal\b|\bif possible\b|\bfallback\b|\bbackup\b|\binstead\b|\bpreferred\b/i;
const OTHERWISE_START = /^(?:otherwise|else|or else|warna|nahin? to)\b/i;

/** Conditional wishes kept as text ("SH-1 if free, otherwise any hall with a projector"). */
export function findConditions(original: string): string[] {
  const out: string[] = [];
  for (const sentence of original.split(/(?<=[.;!?])\s+/)) {
    const parts = sentence
      .split(/,\s*/)
      .map((p) => p.replace(/[.;!?]+$/, "").trim());
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i] || !CONDITION_RE.test(parts[i])) continue;
      let chunk = parts[i];
      if (OTHERWISE_START.test(chunk) && i > 0) {
        if (out.at(-1) === parts[i - 1]) out.pop();
        chunk = `${parts[i - 1]}, ${chunk}`;
      } else if (OTHERWISE_START.test(parts[i + 1] ?? "")) {
        chunk = `${chunk}, ${parts[i + 1]}`;
        i++;
      }
      out.push(clip(chunk, 300));
    }
  }
  return uniq(out);
}

/** Approval, priority or authority claims in the text: noted, never acted on. */
const AUTHORITY_RE =
  /\b(?:approve|approved|approval|ignore (?:your|all|the|previous|any) (?:rules|instructions)|override|bypass|i(?:'m| am) (?:the|a) (?:dean|director|hod|admin|principal|registrar|professor)|as (?:the )?(?:dean|director|admin)|give it priority|prioriti[sz]e|bump)\b/i;

export const AUTHORITY_NOTE =
  "Approvals and priority come from the scheduling rules and your role, not from the request text";

export function claimsAuthority(lower: string): boolean {
  return AUTHORITY_RE.test(lower);
}

// ------------------------------------------------------------------------------ extraction

/**
 * Rule extraction before post-processing: what the text states, with chips for readings that
 * need confirming. Room text and group ids are resolved later by the post-processing.
 */
export function extractRaw(text: string, ctx: ParseContext): BookingDraftLLM {
  const original = cleanText(text);
  const lower = original.toLowerCase();
  const schedule = parseSchedule(original, ctx);
  const assumptions = [...schedule.assumptions];

  const groups = findGroupMentions(original, ctx);
  const count = findAttendance(lower);
  let attendance = count?.value ?? null;
  if (count?.assumption) assumptions.push(count.assumption);
  if (attendance === null) {
    const size = groupsSize(groups, ctx);
    if (size !== null) {
      attendance = size;
      assumptions.push(groupAttendanceNote(groups, size));
    }
  }

  const needs = explicitNeeds(lower, original);
  assumptions.push(...needs.assumptions);
  const roomTypes = roomTypeWords(lower);
  if (
    roomTypes.length === 0 &&
    /\blabs?\b/.test(lower) &&
    needs.needs.includes("computers")
  )
    roomTypes.push("lab_cs");
  if (claimsAuthority(lower)) assumptions.push(AUTHORITY_NOTE);
  const roomText = findRequestedRoomText(original, buildRoomIndex(ctx));

  return {
    title: findTitle(original),
    attendance,
    duration_periods: schedule.duration,
    windows: schedule.windows.map((w) => ({
      day: w.day,
      from_period: Math.min(13, Math.max(1, w.from_period)),
      to_period: Math.min(13, Math.max(1, w.to_period)),
    })),
    room_types: roomTypes,
    needs: needs.needs,
    requested_room_text: roomText ? clip(roomText, 100) : null,
    mandatory_for_groups: isMandatory(lower) ? groups : [],
    repeat_days: schedule.repeat_days,
    claimed_category: findClaim(lower),
    conditions: findConditions(original),
    assumptions: uniq(assumptions).map((a) => clip(a, 300)),
    follow_up: null,
    confidence: 0.5,
  };
}

export function groupAttendanceNote(
  ids: readonly string[],
  size: number,
): string {
  return `Attendance taken from ${ids.join(" + ")} (${size} students)`;
}
