/**
 * The assistant's offline rule parser (regex + lexicon; English, Hinglish and basic Devanagari):
 * a message → the same `AssistantIntentLLM` the model returns, plus the readings to show the
 * user. It only extracts. Course codes, session ids and faculty names are hints the service
 * resolves against the user's own sessions; "approve it", "ignore the rules" and any other
 * instruction inside the message is data and changes nothing. Pure.
 *
 * The message is split into where the session is now (the source: "my Friday 3 pm lecture")
 * and where it should go (the target: "to Thursday morning"); each part's days and times are
 * read with the booking parser's calendar-aware time reader (`parseSchedule`), so "8 baje",
 * "after lunch", "kal" and "10 to 12" mean the same everywhere.
 */
import type {
  AssistantIntentKind,
  AssistantIntentLLM,
  Day,
  SessionKind,
} from "@/lib/contracts";

import { parseSchedule, weekdayFromDate } from "./time";
import {
  cleanText,
  clip,
  clockToMinutes,
  compact,
  escapeRegex,
  uniq,
} from "./text";
import type {
  AssistantContext,
  FallbackWindow,
  IntentSignals,
  ParseContext,
} from "./types";

// ---------------------------------------------------------------------------- normalising

/**
 * Devanagari words the assistant needs on top of the booking lexicon (`cleanText` romanises the
 * days, times and "kal"/"aaj"), written as the Hinglish the patterns below read.
 */
const DEVANAGARI_ASSISTANT: Record<string, string> = {
  क्यों: "kyun",
  क्यूं: "kyun",
  क्यूँ: "kyun",
  बदल: "badal",
  बदलो: "badlo",
  बदलें: "badlein",
  शिफ्ट: "shift",
  कर: "kar",
  करो: "karo",
  करें: "karein",
  करना: "karna",
  दो: "do",
  दें: "dein",
  क्लास: "class",
  कक्षा: "class",
  लेक्चर: "lecture",
  व्याख्यान: "lecture",
  ट्यूटोरियल: "tutorial",
  लैब: "lab",
  प्रयोगशाला: "lab",
  छुट्टी: "chutti",
  अवकाश: "leave",
  नहीं: "nahi",
  आ: "aa",
  सकता: "sakta",
  सकती: "sakti",
  पाऊंगा: "paunga",
  पाऊँगा: "paunga",
  पाऊंगी: "paungi",
  व्यस्त: "busy",
  हूं: "hoon",
  हूँ: "hoon",
  एक: "ek",
  और: "aur",
  अतिरिक्त: "extra",
  मेरा: "mera",
  मेरी: "meri",
  मेरे: "mere",
  वाली: "wali",
  वाला: "wala",
  को: "ko",
  में: "mein",
  आगे: "aage",
  पीछे: "peeche",
  समझाओ: "samjhao",
  बताओ: "batao",
  वजह: "wajah",
  किस: "kis",
  जगह: "jagah",
  की: "ki",
  के: "ke",
  का: "ka",
  है: "hai",
  मैं: "main",
  मुझे: "mujhe",
  // Short day names ("मंगल को"); the full "मंगलवार" is in the booking lexicon.
  सोम: "som",
  मंगल: "mangal",
  बुध: "budh",
  गुरु: "guru",
  शुक्र: "shukra",
  // Before / after a time, moving, and someone else's absence.
  बाद: "baad",
  पहले: "pehle",
  फ्री: "free",
  खाली: "khali",
  उपलब्ध: "available",
  ले: "le",
  जाओ: "jao",
  चलो: "chalo",
  आएंगे: "aayenge",
  आएँगे: "aayenge",
  आयेंगे: "aayenge",
  आएंगी: "aayengi",
  आएँगी: "aayengi",
  आयेंगी: "aayengi",
  आएगा: "aayega",
  आएगी: "aayegi",
  पाएंगे: "payenge",
  पाएँगे: "payenge",
  पायेंगे: "payenge",
  पाएंगी: "payengi",
  पाएँगी: "payengi",
  सकेंगे: "sakenge",
  सकेंगी: "sakengi",
  सकते: "sakte",
};
const DEVANAGARI_RE = new RegExp(
  String.raw`(?<![ऀ-ॿ])(?:${Object.keys(DEVANAGARI_ASSISTANT)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![ऀ-ॿ])`,
  "gu",
);

/** Hindi day names with a long "aa" or "w" ("mangalvaar", "budhwaar") in the form `time.ts` reads. */
const LONG_DAY_RE =
  /\b(som|mangal|budh|guru|shukra|shukar|sukra|shani|ravi|brihaspati|vrihaspati)[vw]a+r\b/gi;
const LONG_DAY: Record<string, string> = {
  som: "somvar",
  mangal: "mangalvar",
  budh: "budhvar",
  guru: "guruvar",
  brihaspati: "guruvar",
  vrihaspati: "guruvar",
  shukra: "shukravar",
  shukar: "shukravar",
  sukra: "shukravar",
  shani: "shanivar",
  ravi: "ravivar",
};

/**
 * Short day names ("mangal ko", "guru subah"). Only whole words with a day-like neighbour count,
 * so a name ("Dr. Mangal", "Guru Prasad") or the word "guru" on its own is left alone.
 */
const SHORT_DAY_RE = /\b(som|mangal|budh|guru|shukra)\b/gi;
const SHORT_DAY_BEFORE =
  /(?:^|\s)(?:agle|agla|agli|aane\s+wale|is|iss|next|this|coming|har|every|on|aur|ya|or|and|se|to|till|until|from)\s+$/;
const SHORT_DAY_AFTER =
  /^\s*(?:ko|ke|ki|ka|se|tak|wala|wali|wale|waala|waali|waale|vaala|vaali|subah|dopahar|dupahar|shaam|sham|raat|morning|afternoon|evening|aur|or|and|ya|par|pe|din|\d|[,.;!?]|$)/;
const TITLE_BEFORE =
  /\b(?:dr|prof|professor|mr|mrs|ms|shri|sri|smt|sir)\.?\s+$/;

const SHORT_DAY_MEANING: Record<string, string> = {
  som: "Monday (MON)",
  mangal: "Tuesday (TUE)",
  budh: "Wednesday (WED)",
  guru: "Thursday (THU)",
  shukra: "Friday (FRI)",
};

/** Day names in the form the time reader knows, with a reading for each short one expanded. */
function normaliseDays(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const long = text.replace(
    LONG_DAY_RE,
    (all, base: string) => LONG_DAY[base.toLowerCase()] ?? all,
  );
  const lower = long.toLowerCase();
  const out = long.replace(
    SHORT_DAY_RE,
    (all, base: string, offset: number) => {
      const key = base.toLowerCase();
      const before = lower.slice(0, offset);
      const after = lower.slice(offset + all.length);
      if (TITLE_BEFORE.test(before)) return all;
      if (!SHORT_DAY_BEFORE.test(before) && !SHORT_DAY_AFTER.test(after))
        return all;
      notes.push(`'${key}' read as ${SHORT_DAY_MEANING[key]}`);
      return LONG_DAY[key] ?? all;
    },
  );
  return { text: out, notes: uniq(notes) };
}

/** `assistantClean`, plus the readings of the short day names it expanded. */
function assistantCleanWithNotes(message: string): {
  clean: string;
  notes: string[];
} {
  const romanised = /[ऀ-ॿ]/.test(message)
    ? message.replace(DEVANAGARI_RE, (w) => DEVANAGARI_ASSISTANT[w] ?? w)
    : message;
  const days = normaliseDays(cleanText(romanised));
  return { clean: days.text, notes: days.notes };
}

/** The message romanised (assistant words, then the booking lexicon) and cleaned. */
export function assistantClean(message: string): string {
  return assistantCleanWithNotes(message).clean;
}

// ------------------------------------------------------------------------------- lexicons

const WHY_RE =
  /\b(?:why|kyun|kyon|kyu|kyo|kiyon|kis\s+(?:wajah|wajeh|karan|kaaran|liye|lie)|how\s+come|explain|samjha\w*|reason\s+(?:for|why|behind)|what(?:'s|\s+is)\s+the\s+reason)\b/;

const MOVE_RE =
  /\b(?:move|moving|shift|shifting|reschedul\w*|re-schedul\w*|prepone|postpone|swap|relocate|transfer|push\s+(?:it|my|the)|bring\s+(?:it\s+)?forward|change\s+(?:the\s+)?(?:time|timing|day|slot|room|period)|badal\w*|badl\w*|hata\w*|aage\s+(?:kar|karo|kr)|peeche\s+(?:kar|karo|kr)|pichhe\s+(?:kar|karo)|le\s+(?:jao|jaao|jaiye|jaaiye|ja|chalo|chaliye|aao|aaiye)|instead)\b/;

/** Softer asks that are moves when a session is named ("I want my CS202 lecture on Thursday"). */
const SOFT_MOVE_RE =
  /\b(?:kar\s*do|kardo|karo|karna|kijiye|rakh\s*do|rakho|rakhna|want|prefer|would\s+like|can\s+(?:i|we)\s+(?:have|get)|put|keep)\b/;

/** "nahi aa sakta", "nahi aa payenge" (I / they can't come): first, second and third person. */
const CANT_COME = String.raw`(?:sakta|sakti|sakte|sakunga|sakungi|sakenge|sakengi|sakega|sakegi|paunga|paungi|paaunga|paaungi|payega|payegi|paayega|paayegi|payenge|payengi|paayenge|paayengi|paenge|paengi)`;

/** Away, busy, on leave, not free: for me ("nahi aa sakta") or someone else ("F07 kal nahi aayenge"). */
const UNAVAILABLE_RE = new RegExp(
  String.raw`\b(?:${[
    String.raw`leave|unavailable|not\s+available|available\s+nahi[n]?`,
    String.raw`(?:won'?t|wont|will\s+not|shan'?t)\s+be\s+(?:available|there|around|on\s+campus|in|able|free)`,
    String.raw`(?:can'?t|cannot|can\s+not|unable\s+to|won'?t|wont|will\s+not)\s+(?:teach|come|make\s+it|take|attend|be\s+there|be\s+available)`,
    String.raw`(?:not|isn'?t|aren'?t)\s+coming`,
    String.raw`(?:not|isn'?t|aren'?t|wasn'?t)\s+(?:be\s+)?free|free\s+nahi[n]?|nahi[n]?\s+free|khali\s+nahi[n]?`,
    String.raw`away|out\s+of\s+(?:station|town|office)|travell?ing|sick|absent|chh?utt?i|busy|vyast`,
    String.raw`nahi[n]?\s+(?:aa|aaa|a)\s+${CANT_COME}`,
    String.raw`nahi[n]?\s+aa?(?:unga|ungi|oonga|oongi|yenge|yengi|enge|engi|yega|yegi|ega|egi|ye|yi|ya)`,
    String.raw`nahi[n]?\s+padha\s+${CANT_COME}`,
    String.raw`(?:have|got|attending|attend|going\s+to|at)\s+(?:a|an|the|my)?\s*(?:conference|seminar|workshop|wedding|shaadi|medical\s+appointment|doctor'?s?\s+appointment|meeting|trip|training|viva|interview|exam\s+duty|invigilation)`,
    String.raw`block\s+(?:my|me|off)`,
    String.raw`mark\s+(?:me|myself|him|her|f\d+)\s+(?:as\s+)?(?:unavailable|away|absent|busy|on\s+leave)`,
  ].join("|")})\b`,
);

const KIND_NOUN = String.raw`(?:lectures?|tutorials?|tut|tute|labs?|practicals?|class(?:es)?|sessions?)`;
const ADD_RE = new RegExp(
  String.raw`\b(?:extra|additional|one\s+more|ek\s+aur|aur\s+ek|ek\s+extra|another\s+${KIND_NOUN}|add\s+(?:a|an|one|another|ek)?\s*(?:extra\s+)?${KIND_NOUN}|new\s+${KIND_NOUN}|(?:schedule|arrange|organi[sz]e)\s+(?:a|an|one)\s+(?:extra\s+|more\s+)?${KIND_NOUN}|${KIND_NOUN}\s+(?:add|badhao|badha\s+do|jodo|jod\s+do))\b`,
);

/** Asks to approve, apply, override or ignore the rules (or to treat the asker as someone else). */
const BYPASS_RE =
  /\b(?:approve|approved|approval|auto-?approve|apply\s+(?:it|this|the\s+change|directly|now|immediately)|directly\s+apply|without\s+(?:approval|admin|checking|checks|the\s+engine)|skip\s+(?:the\s+)?(?:approval|checks?|rules?|validation|engine)|ignor\w*\s+(?:(?:the|all|any|your|previous|prior|above|these|those|every)\s+)*(?:rules?|constraints?|instructions?|checks?|clash(?:es)?|conflicts?|validation|engine|system\s+prompt|limits?)|override|overrule|bypass|force\s+(?:it|this|the|my)|forcefully|even\s+if\s+(?:it\s+)?(?:clash|conflict|break|violat)\w*|i\s*(?:am|'m)\s+(?:the\s+)?(?:dean|admin|administrator|director|hod|principal|boss|registrar)|as\s+(?:the\s+)?(?:dean|admin|hod)|you\s+are\s+now|act\s+as|developer\s+mode|jailbreak|seedha\s+(?:approve|apply)|approve\s+kar\w*)\b/;

const BOOKING_RE =
  /\b(?:book|booking|reserve|reservation|venue|event|fest|hall\s+for|room\s+for|auditorium\s+for|oat\s+for|seminar\s+hall)\b/;

const ALL_RE =
  /\b(?:all|every|each|saari|sari|saare|sare|sabhi|sab)\s+(?:of\s+)?(?:my\s+|meri\s+|mere\s+|the\s+)?(?:classes|lectures|sessions|tutorials|labs|class|lecture|session)\b/;

const SAME_DAY_RE =
  /\b(?:same\s+day|usi\s+din|isi\s+din|that\s+day\s+itself)\b/;
const OTHER_DAY_RE =
  /\b(?:another|different|other|some\s+other|any\s+other|next\s+available)\s+day\b|\bkoi\s+(?:aur|dusra|doosra)\s+din\b|\bdusre\s+din\b/;

/** "…, otherwise any afternoon": what follows is a second window to try. */
const FALLBACK_RE =
  /\b(?:otherwise|or\s+else|else|failing\s+that|if\s+not(?:\s+possible)?|if\s+(?:that|this|it)\s+(?:is\s*n[o']t\s+possible|isn'?t\s+possible|is\s+not\s+possible|doesn'?t\s+work|can'?t\s+be\s+done|fails|is\s+full|is\s+taken)|warna|varna|nahi\s+to|nahin\s+to)\b/;

// ------------------------------------------------------------------------------- sessions

const KIND_WORDS: readonly [RegExp, SessionKind][] = [
  [/\b(?:tutorials?|tut|tute|tutes)\b/, "tutorial"],
  [/\b(?:labs?|practicals?|prac|lab\s+sessions?)\b/, "lab"],
  [/\b(?:lectures?|lec|lect|theory\s+class(?:es)?)\b/, "lecture"],
];

const SUFFIX_KIND: Record<string, SessionKind> = {
  L: "lecture",
  T: "tutorial",
  P: "lab",
};

/** "CS202-L2", "MA101-AB-L1", "cs202 t2" (a space only before L or T: "P2" is a period). */
const SESSION_ID_RE =
  /\b([a-z]{2,4})[\s-]?(\d{3})((?:-[a-z0-9]{1,4})*?)(?:-([ltp])|\s([lt]))(\d{1,2})\b/g;
const COURSE_CODE_RE = /\b([a-z]{2,4})[\s-]?(\d{3})\b/g;

type Mention = { index: number; end: number };

type SessionHints = {
  session_id: string | null;
  course_id: string | null;
  kind: SessionKind | null;
  /** Where the hint sits in the text (for telling source from target). */
  at: Mention | null;
};

function coursePrefixes(ctx: AssistantContext): Set<string> {
  return new Set(
    ctx.courses
      .map((c) => /^[A-Za-z]+/.exec(c.id)?.[0].toUpperCase())
      .filter((p): p is string => Boolean(p)),
  );
}

/** "discrete mathematics" also as "discrete maths" / "discrete math". */
function titleVariants(title: string): string[] {
  const base = title.toLowerCase().replace(/\s+/g, " ").trim();
  const variants = [base];
  if (/\bmathematics\b/.test(base))
    variants.push(
      base.replace(/\bmathematics\b/, "maths"),
      base.replace(/\bmathematics\b/, "math"),
    );
  return variants;
}

function findSessionHints(t: string, ctx: AssistantContext): SessionHints {
  const prefixes = coursePrefixes(ctx);
  const known = new Set(ctx.courses.map((c) => c.id.toUpperCase()));
  for (const m of t.matchAll(SESSION_ID_RE)) {
    const [all, letters, digits, middle, hyphenKind, spaceKind, n] = m;
    const prefix = letters.toUpperCase();
    if (!prefixes.has(prefix) && !known.has(`${prefix}${digits}`)) continue;
    const suffix = (hyphenKind ?? spaceKind).toUpperCase();
    return {
      session_id: `${prefix}${digits}${middle.toUpperCase()}-${suffix}${n}`,
      course_id: `${prefix}${digits}`,
      kind: SUFFIX_KIND[suffix] ?? null,
      at: { index: m.index, end: m.index + all.length },
    };
  }
  let course: { id: string; at: Mention } | null = null;
  for (const m of t.matchAll(COURSE_CODE_RE)) {
    const id = `${m[1].toUpperCase()}${m[2]}`;
    if (known.has(id) || prefixes.has(m[1].toUpperCase())) {
      course = { id, at: { index: m.index, end: m.index + m[0].length } };
      break;
    }
  }
  if (!course) {
    const titles = ctx.courses
      .flatMap((c) => titleVariants(c.title).map((v) => ({ id: c.id, v })))
      .sort((a, b) => b.v.length - a.v.length);
    for (const { id, v } of titles) {
      const m = new RegExp(String.raw`\b${escapeRegex(v)}\b`).exec(t);
      if (m) {
        course = { id, at: { index: m.index, end: m.index + m[0].length } };
        break;
      }
    }
  }
  return {
    session_id: null,
    course_id: course?.id ?? null,
    kind: kindIn(t),
    at: course?.at ?? null,
  };
}

function kindIn(t: string): SessionKind | null {
  let best: { index: number; kind: SessionKind } | null = null;
  for (const [re, kind] of KIND_WORDS) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.index)) best = { index: m.index, kind };
  }
  return best?.kind ?? null;
}

// ---------------------------------------------------------------------------------- rooms

type RoomHit = { id: string; index: number; end: number };

/** Rooms named in `t`, by id ("LH-3", "lh3", "cs lab 1") or name ("lecture hall 3"). */
export function findRooms(t: string, ctx: AssistantContext): RoomHit[] {
  const hits: RoomHit[] = [];
  for (const room of ctx.rooms) {
    const idPattern = room.id
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(escapeRegex)
      .join(String.raw`[\s-]?`);
    const patterns = [idPattern];
    if (room.name.trim()) patterns.push(escapeRegex(room.name.toLowerCase()));
    const re = new RegExp(String.raw`\b(?:${patterns.join("|")})\b`, "g");
    for (const m of t.matchAll(re))
      hits.push({ id: room.id, index: m.index, end: m.index + m[0].length });
  }
  return hits.sort((a, b) => a.index - b.index || b.end - a.end);
}

/** The room id `text` names exactly (compact match on id or name), else null. */
export function matchRoomId(
  text: string,
  ctx: AssistantContext,
): string | null {
  const key = compact(text);
  if (!key) return null;
  const room = ctx.rooms.find(
    (r) => compact(r.id) === key || compact(r.name) === key,
  );
  return room?.id ?? null;
}

// -------------------------------------------------------------------------------- faculty

const TITLES = String.raw`(?:dr\.?|prof\.?|professor|mr\.?|mrs\.?|ms\.?)`;
const HONORIFIC_AFTER = String.raw`(?:sir|ma'?am|madam|ji|saab|sahab)`;

function plainName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:dr|prof|professor|mr|mrs|ms)\.?\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type FacultyMention = { hint: string; index: number; end: number };

/**
 * Every faculty member named in `t`, in order ("F07", "f7", "Dr. Pooja Das", "Das sir", "Prof.
 * Rao"): their id, or the id as written when it matches no one (the service then says so). Each
 * person appears once; overlapping matches keep the longer one.
 */
export function findFacultyMentions(
  t: string,
  ctx: AssistantContext,
): FacultyMention[] {
  const hits: FacultyMention[] = [];
  for (const m of t.matchAll(/\bf-?(\d{1,3})\b/g)) {
    const n = Number(m[1]);
    const known = ctx.faculty.find(
      (f) => /^F\d+$/i.test(f.id) && Number(f.id.slice(1)) === n,
    );
    hits.push({
      hint: known?.id ?? `F${m[1].padStart(2, "0")}`,
      index: m.index,
      end: m.index + m[0].length,
    });
  }
  const people = ctx.faculty.map((f) => {
    const words = plainName(f.name).split(" ").filter(Boolean);
    return { id: f.id, full: words.join(" "), words };
  });
  const surnameCount = new Map<string, number>();
  const firstCount = new Map<string, number>();
  for (const p of people) {
    const last = p.words.at(-1);
    const first = p.words[0];
    if (last) surnameCount.set(last, (surnameCount.get(last) ?? 0) + 1);
    if (first) firstCount.set(first, (firstCount.get(first) ?? 0) + 1);
  }
  for (const p of people) {
    if (p.words.length === 0) continue;
    const patterns = [String.raw`\b${escapeRegex(p.full)}\b`];
    const last = p.words.at(-1) as string;
    const first = p.words[0];
    if (last.length >= 3 && surnameCount.get(last) === 1)
      patterns.push(
        String.raw`\b${TITLES}\s*${escapeRegex(last)}\b|\b${escapeRegex(last)}(?:'s)?\s+${HONORIFIC_AFTER}\b`,
      );
    if (first.length >= 3 && firstCount.get(first) === 1 && p.words.length > 1)
      patterns.push(
        String.raw`\b${TITLES}\s*${escapeRegex(first)}\b|\b${escapeRegex(first)}\s+${HONORIFIC_AFTER}\b`,
      );
    let best: FacultyMention | null = null;
    for (const pattern of patterns) {
      const m = new RegExp(pattern).exec(t);
      if (m && (!best || m[0].length > best.end - best.index))
        best = { hint: p.id, index: m.index, end: m.index + m[0].length };
    }
    if (best) hits.push(best);
  }
  hits.sort((a, b) => a.index - b.index || b.end - a.end);
  const kept: FacultyMention[] = [];
  for (const hit of hits) {
    const prev = kept.at(-1);
    if (prev && hit.index < prev.end) continue;
    if (kept.some((k) => k.hint === hit.hint)) continue;
    kept.push(hit);
  }
  return kept;
}

/** "F07 (Dr. Pooja Das)", or the id alone when it matches no one. */
function facultyLabel(id: string, ctx: AssistantContext): string {
  const person = ctx.faculty.find((f) => f.id === id);
  return person ? `${id} (${person.name})` : id;
}

/**
 * A request names more than one faculty member: only one is handled per request, so the chip
 * says which one was read and who needs a separate request.
 */
function oneFacultyChip(
  mentions: readonly FacultyMention[],
  chosen: string | null,
  ctx: AssistantContext,
): string | null {
  if (mentions.length < 2) return null;
  const self = ctx.selfFacultyId;
  const readAs = chosen ?? self;
  if (!readAs) return null;
  const rest = mentions
    .map((m) => m.hint)
    .filter((h) => h !== readAs)
    .map((h) => (h === self ? `${h} (you)` : facultyLabel(h, ctx)));
  if (rest.length === 0) return null;
  const who = readAs === self ? `you (${self})` : facultyLabel(readAs, ctx);
  return `Only one faculty member is handled per request: read as ${who}; send a separate request for ${rest.join(", ")}`;
}

// ---------------------------------------------------------------------------------- times

const MERIDIEM = String.raw`(?:am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)`;
/** A day word an hour can follow ("next Monday 9", "kal 11"). */
const DAY_NAME = String.raw`(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri)(?:day)?|(?:somv|somw|mangalv|mangalw|budhv|budhw|guruv|guruw|shukrav|shukraw)[ae]r|kal|tomorrow|tmrw|today|aaj|parso)`;
/**
 * A number that is something other than an hour: a clock time or range already ("10:30", "10 to
 * 12", "2 pm"), a count ("2 hours", "3 lectures"), an ordinal or a date ("9th", "12 Feb"), or the
 * start of a before / after phrase (read separately).
 */
const NOT_AN_HOUR = String.raw`(?!\d|[:.]\d)(?!\s*(?:${MERIDIEM}|st\b|nd\b|rd\b|th\b|hours?\b|hrs?\b|ghante|ghanta|ghanton|minutes?\b|mins?\b|periods\b|slots\b|sessions\b|classes\b|lectures\b|tutorials\b|labs\b|people\b|persons?\b|students?\b|log\b|days?\b|din\b|weeks?\b|baar\b|times\b|meetings\b|-|–|to\b|till\b|until\b|upto\b|and\b|or\b|se\b|tak\b|ke\b|baad\b|pehle\b|onwards?\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|%))`;
/** "around 3", "lagbhag 11": an hour with no am/pm. */
const ROUGHLY = String.raw`(?:around|approx\.?|approximately|lagbhag|karib|kareeb|takriban)`;
/** Words after a clock time or a period that make it a bound: "2 baje ke baad", "11 se pehle". */
const BOUND_SUFFIX = String.raw`ke\s+baad(?:\s+se)?|ke\s+bad|baad(?:\s+(?:se|mein|me))?|onwards?|se\s+aage|and\s+later|or\s+later|and\s+after|se\s+pehle|se\s+pahle|se\s+phle|ke\s+pehle|ke\s+pahle|pehle|tak`;
const CLOCK_TOKEN = String.raw`\d{1,2}(?:[:.]\d{2})?\s*${MERIDIEM}?`;
/** "after 2 hours" is a shift, not a time of day. */
const NOT_A_COUNT = String.raw`(?!\s*(?:hours?|hrs?|hr\b|ghante|ghanta|ghanton|minutes?|mins?|days?|din\b|weeks?|periods|slots|classes|lectures|sessions|people|students))`;

const TIME_TOKEN_RE = new RegExp(
  String.raw`\b(?:${[
    String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|satur|sun)(?:day)?s?`,
    String.raw`(?:somv|somw|mangalv|mangalw|budhv|budhw|guruv|guruw|shukrav|shukraw|shaniv|raviv)[ae]r`,
    String.raw`kal|tomorrow|tmrw|today|tonight|aaj|parso|day\s+after\s+tomorrow`,
    String.raw`morning|afternoon|evening|night|noon|midday|subah|dopahar|dupahar|shaam|sham|raat|forenoon`,
    String.raw`after\s+lunch|post[\s-]?lunch|before\s+lunch|lunch\s+ke\s+baad|lunch\s+se\s+pehle`,
    String.raw`(?:before|after|till|until|later\s+than|earlier\s+than)\s+(?:the\s+)?(?:(?:p\s?|periods?\s+)\d{1,2}|\d{1,2}(?:st|nd|rd|th)\s+period|\d{1,2}(?!\d)(?:[:.]\d{2})?${NOT_A_COUNT}\s*${MERIDIEM}?)`,
    // Clock ranges and bounds before plain times, so "10 se 12 baje" and "2 baje ke baad" stay whole.
    String.raw`(?<![\w:.\/-])\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje)?\s*(?:-|–|to|till|until|se)\s*\d{1,2}(?:[:.]\d{2})?(?:\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje))?(?:\s*baje)?(?:\s*tak)?`,
    String.raw`(?<![\w:.\/-])(?:${CLOCK_TOKEN}|p\s?\d{1,2})\s*(?:${BOUND_SUFFIX})`,
    String.raw`\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)`,
    String.raw`\d{1,2}:\d{2}`,
    String.raw`(?:at|@)\s*\d{1,2}(?![\d:])`,
    String.raw`(?<=\b${DAY_NAME}\s)\d{1,2}${NOT_AN_HOUR}`,
    String.raw`${ROUGHLY}\s+\d{1,2}${NOT_AN_HOUR}`,
    String.raw`(?<![\w-])(?:p\s?|periods?\s+)\d{1,2}(?:\s*(?:,|and|&|aur|\/|or|ya|-|–|to|till|until)\s*(?:p\s?)?\d{1,2}(?![\d:]))+`,
    String.raw`(?<![\w-])p\s?\d{1,2}`,
    String.raw`periods?\s+\d{1,2}`,
    String.raw`\d{1,2}(?:st|nd|rd|th)\s+period`,
    String.raw`(?:first|last|pehla|pehle|pahla|aakhri|akhri|aakhiri)\s+(?:period|slot|hour)`,
  ].join("|")})\b`,
  "g",
);

type Phrase = { index: number; end: number; text: string };

/** Day and time words in `t`, adjacent ones merged ("friday 3 pm", "thursday morning"). */
function timePhrases(t: string): Phrase[] {
  const tokens = [...t.matchAll(TIME_TOKEN_RE)].map((m) => ({
    index: m.index,
    end: m.index + m[0].length,
  }));
  const phrases: Phrase[] = [];
  for (const tok of tokens) {
    const last = phrases.at(-1);
    const gap = last ? t.slice(last.end, tok.index) : "";
    if (
      last &&
      /^[\s,]*(?:at|on|the|from|between|and|-|se|ko|ki|ke|in\s+the)?[\s,]*$/.test(
        gap,
      )
    ) {
      last.end = tok.end;
      last.text = t.slice(last.index, last.end);
    } else phrases.push({ ...tok, text: t.slice(tok.index, tok.end) });
  }
  return phrases;
}

function teachingPeriods(ctx: AssistantContext): number[] {
  return ctx.calendar.periods
    .filter((p) => p.teaching)
    .map((p) => p.id)
    .sort((a, b) => a - b);
}

function periodClock(ctx: AssistantContext, id: number) {
  return ctx.calendar.periods.find((p) => p.id === id) ?? null;
}

/**
 * Minutes after midnight as clock text with am/pm ("9:00 am", "2:00 pm"), so the time reader
 * takes it exactly as written whatever part-of-day word is nearby.
 */
function meridiemClock(minutes: number): string {
  const total = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const h = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, "0");
  if (h === 0) return `12:${mm} am`;
  if (h < 12) return `${h}:${mm} am`;
  if (h === 12) return `12:${mm} pm`;
  return `${h - 12}:${mm} pm`;
}

/** "14:00" style clock text, for chips. */
function clock24(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

type Meridiem = "am" | "pm";

/** The part of the day the segment names ("subah" → am, "shaam" → pm), if only one. */
function meridiemHint(t: string): Meridiem | null {
  const am = /\b(?:morning|subah|forenoon)\b/.test(t);
  const pm =
    /\b(?:afternoon|dopahar|dupahar|evening|shaam|sham|raat|night|tonight)\b/.test(
      t,
    );
  if (am === pm) return null;
  return am ? "am" : "pm";
}

/**
 * A clock time in minutes after midnight. Without am/pm: the part of the day named nearby,
 * else 8–12 as morning / noon and 1–7 as afternoon / evening (as the booking parser reads it).
 * Null for a time that doesn't exist ("25:00").
 */
function clockMinutes(
  h: number,
  mm: number,
  marker: string | undefined,
  hint: Meridiem | null,
): number | null {
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
  const mer = marker?.startsWith("a")
    ? "am"
    : marker?.startsWith("p")
      ? "pm"
      : null;
  let hour = h;
  if (h <= 12) {
    if (mer === "am") hour = h === 12 ? 0 : h;
    else if (mer === "pm") hour = h === 12 ? 12 : h + 12;
    else if (h === 0) hour = 0;
    else if (hint === "am") hour = h;
    else if (hint === "pm") hour = h === 12 ? 12 : h + 12;
    else hour = h >= 8 ? h : h + 12;
  }
  return hour * 60 + mm;
}

/** Calls `fn` on each match; a string replaces the match, null leaves it as it is. */
function replaceMatches(
  text: string,
  re: RegExp,
  fn: (m: RegExpMatchArray, before: string, after: string) => string | null,
): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    const r = fn(m, text.slice(0, m.index), text.slice(m.index + m[0].length));
    if (r === null) continue;
    out += text.slice(last, m.index) + r;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

/**
 * A rewritten segment: `text` for the time reader, `plain` (the same with every rewritten phrase
 * blanked) for quoting the clock times that are left, the readings to show, and the phrase to
 * quote when a bound leaves no teaching period ("after 6 pm").
 */
type Rewrite = {
  text: string;
  plain: string;
  chips: string[];
  spans: { quote: string; periods: number[] }[];
  outside: string | null;
};

type Bound = "after" | "from" | "before" | "until";

const PERIOD_REF = String.raw`(?:(?:p\s?|periods?\s+)(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+period)(?!\d)`;
const CLOCK_REF = String.raw`(\d{1,2})(?!\d)(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)?`;
const BOUND_PREFIX = String.raw`after|later\s+than|not\s+before|no\s+earlier\s+than|before|earlier\s+than|till|until|upto|up\s+to|no\s+later\s+than|from|since`;
const BOUND_PERIOD_PREFIX_RE = new RegExp(
  String.raw`\b(${BOUND_PREFIX})\s+(?:the\s+)?${PERIOD_REF}(?!\s*(?:-|–|to|till|until|se)\s*(?:p\s?)?\d)`,
  "g",
);
const BOUND_PERIOD_SUFFIX_RE = new RegExp(
  String.raw`(?<![\w-])${PERIOD_REF}\s*(${BOUND_SUFFIX}|se)\b`,
  "g",
);
const BOUND_CLOCK_PREFIX_RE = new RegExp(
  String.raw`\b(${BOUND_PREFIX})\s+(?:${ROUGHLY}\s+|about\s+)?${CLOCK_REF}${NOT_A_COUNT}`,
  "g",
);
const BOUND_CLOCK_SUFFIX_RE = new RegExp(
  String.raw`(?<![\w:.\/-])${CLOCK_REF}\s*(${BOUND_SUFFIX}|se)\b`,
  "g",
);
/** "till lunch", "shaam tak": the morning, or the whole teaching day. */
const UNTIL_LUNCH_RE =
  /\b(?:(?:till|until|upto|up\s+to)\s+(?:lunch|afternoon)|(?:lunch|dopahar|dupahar)\s+tak)\b/g;
const UNTIL_EVENING_RE =
  /\b(?:(?:till|until|upto|up\s+to)\s+(?:the\s+)?(?:evening|night)|(?:shaam|sham|raat)\s+tak)\b/g;
/** A clock range ends here ("10 se 12 baje tak", "10 till 12"): not an open bound. */
const RANGE_BEFORE_RE =
  /(?:\d|\d\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje))\s*(?:se|to|-|–|till|until|upto|and|from|between)?\s*$/;
/** "from 10 to 12", "10 se 12": a range follows, so "from" / "se" doesn't open one. */
const RANGE_AFTER_RE =
  /^\s*(?:(?:-|–|to|till|until|upto|and|se)\s*)?(?:p\s?)?\d/;

function boundOf(word: string): Bound {
  const w = word.replace(/\s+/g, " ");
  if (w === "from" || w === "since" || w === "se") return "from";
  if (/^(?:till|until|upto|up to|no later than|tak)$/.test(w)) return "until";
  if (/^(?:before|earlier than|se p|ke p|pehle)/.test(w)) return "before";
  return "after";
}

/**
 * Open-ended times as clock ranges over the teaching periods, each with a reading: "after 2" /
 * "2 baje ke baad" → P6–P9, "before 11" / "11 se pehle" → P1–P3, "till P4" → P1–P4, "after P5" →
 * P6–P9, "shaam tak" → the whole teaching day. `openEnded` (unavailability) also reads "from 2
 * pm" / "2 baje se" as the rest of the day.
 */
function readBounds(
  segment: string,
  ctx: AssistantContext,
  openEnded: boolean,
): Rewrite {
  const teaching = teachingPeriods(ctx);
  const startOf = (id: number) => {
    const p = periodClock(ctx, id);
    return p ? clockToMinutes(p.start) : 0;
  };
  const endOf = (id: number) => {
    const p = periodClock(ctx, id);
    return p ? clockToMinutes(p.end) : 0;
  };
  const empty: Rewrite = {
    text: segment,
    plain: segment,
    chips: [],
    spans: [],
    outside: null,
  };
  if (teaching.length === 0) return empty;
  const first = teaching[0];
  const last = teaching[teaching.length - 1];
  const early = meridiemClock(Math.max(6 * 60, startOf(first) - 60));
  const hint = meridiemHint(segment);

  // Placeholders (private-use characters no pattern matches) keep later passes off rewritten text.
  const outs: string[] = [];
  const result: Rewrite = { ...empty, text: "", plain: "" };
  const hold = (replacement: string) => {
    outs.push(replacement);
    return `${String.fromCharCode(0xe100 + outs.length - 1)}`;
  };
  const emit = (quote: string, periods: number[], fallback: string) => {
    const text = quote.trim();
    if (periods.length === 0) {
      result.outside ??= text;
      return hold(` ${fallback} `);
    }
    const from = startOf(periods[0]);
    const to = endOf(periods[periods.length - 1]);
    result.chips.push(
      `'${text}' read as ${rangeLabel(periods)} (${clock24(from)}–${clock24(to)})`,
    );
    result.spans.push({ quote: text, periods });
    return hold(` ${meridiemClock(from)} to ${meridiemClock(to)} `);
  };
  const byPeriod = (bound: Bound, n: number) =>
    teaching.filter((p) =>
      bound === "after"
        ? p > n
        : bound === "from"
          ? p >= n
          : bound === "before"
            ? p < n
            : p <= n,
    );
  const byClock = (bound: Bound, minutes: number) =>
    teaching.filter((p) =>
      bound === "after" || bound === "from"
        ? endOf(p) > minutes
        : startOf(p) < minutes,
    );
  /** Whether a bound applies here: "from" only for unavailability, and never inside a range. */
  const applies = (bound: Bound, before: string, after: string) => {
    if (bound === "from" && (!openEnded || RANGE_AFTER_RE.test(after)))
      return false;
    if (bound === "until" && RANGE_BEFORE_RE.test(before)) return false;
    return true;
  };

  let work = segment.replace(/\b(?:12\s*)?noon\b|\bmidday\b/g, "12 pm");
  work = replaceMatches(work, BOUND_PERIOD_PREFIX_RE, (m, before, after) => {
    const bound = boundOf(m[1]);
    const n = Number(m[2] ?? m[3]);
    if (!periodClock(ctx, n) || !applies(bound, before, after)) return null;
    const fallback =
      bound === "after" || bound === "from"
        ? meridiemClock(endOf(last))
        : early;
    return emit(m[0], byPeriod(bound, n), fallback);
  });
  work = replaceMatches(work, BOUND_PERIOD_SUFFIX_RE, (m, before, after) => {
    const bound = boundOf(m[3]);
    const n = Number(m[1] ?? m[2]);
    if (!periodClock(ctx, n) || !applies(bound, before, after)) return null;
    const fallback =
      bound === "after" || bound === "from"
        ? meridiemClock(endOf(last))
        : early;
    return emit(m[0], byPeriod(bound, n), fallback);
  });
  const clockBound = (
    m: RegExpMatchArray,
    word: string,
    hIdx: number,
    before: string,
    after: string,
  ) => {
    const bound = boundOf(word);
    if (!applies(bound, before, after)) return null;
    const minutes = clockMinutes(
      Number(m[hIdx]),
      Number(m[hIdx + 1] ?? 0),
      m[hIdx + 2],
      hint,
    );
    if (minutes === null) return null;
    const fallback =
      bound === "after" || bound === "from" ? meridiemClock(minutes) : early;
    return emit(m[0], byClock(bound, minutes), fallback);
  };
  work = replaceMatches(work, BOUND_CLOCK_PREFIX_RE, (m, before, after) =>
    clockBound(m, m[1], 2, before, after),
  );
  work = replaceMatches(work, BOUND_CLOCK_SUFFIX_RE, (m, before, after) =>
    clockBound(m, m[4], 1, before, after),
  );
  const lunchAfter = ctx.calendar.lunch.after_period;
  work = replaceMatches(work, UNTIL_LUNCH_RE, (m) =>
    emit(
      m[0],
      teaching.filter((p) => p <= lunchAfter),
      early,
    ),
  );
  work = replaceMatches(work, UNTIL_EVENING_RE, (m) =>
    emit(m[0], teaching, early),
  );

  const fill = (blank: boolean) =>
    work.replace(/(.)/g, (_all, c: string) =>
      blank ? " " : (outs[c.charCodeAt(0) - 0xe100] ?? " "),
    );
  result.text = fill(false);
  result.plain = fill(true);
  return result;
}

const BARE_HOUR_RE = new RegExp(
  String.raw`(\b(?:${DAY_NAME}|${ROUGHLY})\s+)(\d{1,2})${NOT_AN_HOUR}`,
  "g",
);

/**
 * An hour with no am/pm after a day ("next Monday 9", "kal 11") or "around 3": 8–12 as morning,
 * 1–5 as afternoon (unless the segment names the part of the day), with a reading. One that
 * can't be told apart (6 or 7: before or after classes; 13–23: an hour or a date) is dropped,
 * and the reading says so.
 */
function readBareHours(
  text: string,
  plain: string,
  ctx: AssistantContext,
): { text: string; plain: string; chips: string[] } {
  const hint = meridiemHint(text);
  const chips: string[] = [];
  const rewrite = (source: string, record: boolean) =>
    replaceMatches(source, BARE_HOUR_RE, (m) => {
      const lead = m[1];
      const h = Number(m[2]);
      const quote = m[0].trim();
      const clear = h >= 8 && h <= 12 ? true : h >= 1 && h <= 5;
      const minutes =
        clear || (hint !== null && h >= 1 && h <= 12)
          ? clockMinutes(h, 0, undefined, hint)
          : null;
      if (minutes === null) {
        if (record)
          chips.push(
            `'${quote}' wasn't read as a time; add am/pm or name the period (e.g. P2)`,
          );
        return `${lead} `;
      }
      if (record) {
        const period = ctx.calendar.periods.find(
          (p) =>
            p.teaching &&
            clockToMinutes(p.start) <= minutes &&
            minutes < clockToMinutes(p.end),
        );
        chips.push(
          `'${quote}' read as ${clock24(minutes)}${period ? ` (P${period.id})` : ""}`,
        );
      }
      return `${lead}${meridiemClock(minutes)}`;
    });
  const rewritten = rewrite(text, true);
  // The plain copy drops the hour so the leftover-number check doesn't quote it again.
  const blanked = replaceMatches(plain, BARE_HOUR_RE, (m) => `${m[1]} `);
  return { text: rewritten, plain: blanked, chips };
}

/** A number left in an unavailability message that no reading used ("busy 9"). */
const LEFTOVER_NUMBER_RE = new RegExp(
  String.raw`(?<![\w:.\/\-])(\d{1,2})${NOT_AN_HOUR}`,
  "g",
);

function leftoverChips(plain: string, ctx: AssistantContext): string[] {
  let text = plain;
  for (const room of findRooms(text, ctx))
    text =
      text.slice(0, room.index) +
      " ".repeat(room.end - room.index) +
      text.slice(room.end);
  return [...text.matchAll(LEFTOVER_NUMBER_RE)].map(
    (m) =>
      `'${m[1]}' wasn't read as a time; add am/pm or name the period (e.g. P2)`,
  );
}

const PERIOD_LIST_RE =
  /(?<![\w-])(?:p\s?|periods?\s+)(\d{1,2})((?:\s*(?:,|and|&|aur|\/|or|ya|\+)\s*(?:p\s?)?\d{1,2}(?![\d:]))+)(?!\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje|hours?|hrs?))/g;

/**
 * Period words as clock text the time reader understands: "P3" → "10:00 am", "P2 to P4" →
 * "9:00 am to 12:00 pm", "P5 and P6" / "P3, P4" → each period kept, "last period" → the last
 * teaching period, "before lunch" → "morning".
 */
function rewritePeriods(t: string, ctx: AssistantContext): string {
  const teaching = teachingPeriods(ctx);
  const firstTeaching = teaching[0];
  const lastTeaching = teaching.at(-1);
  const start = (id: number) => {
    const p = periodClock(ctx, id);
    return p ? meridiemClock(clockToMinutes(p.start)) : null;
  };
  const end = (id: number) => {
    const p = periodClock(ctx, id);
    return p ? meridiemClock(clockToMinutes(p.end)) : null;
  };
  const range = (a: number, b: number, all: string) => {
    const from = start(Math.min(a, b));
    const to = end(Math.max(a, b));
    return from && to ? ` ${from} to ${to} ` : all;
  };
  return t
    .replace(PERIOD_LIST_RE, (all, a: string, rest: string) => {
      const ids = uniq([a, ...(rest.match(/\d{1,2}/g) ?? [])].map(Number)).sort(
        (x, y) => x - y,
      );
      if (ids.some((id) => !periodClock(ctx, id))) return all;
      // Consecutive periods as one range, the rest as separate ranges.
      const runs: [number, number][] = [];
      for (const id of ids) {
        const run = runs.at(-1);
        if (run && id === run[1] + 1) run[1] = id;
        else runs.push([id, id]);
      }
      return ` ${runs.map(([x, y]) => range(x, y, all).trim()).join(" , ")} `;
    })
    .replace(
      /(?<![\w-])(?:p\s?|periods?\s+)(\d{1,2})\s*(?:-|to|–|till|until)\s*(?:p\s?)?(\d{1,2})\b(?!\s*(?:am|pm|baje))/g,
      (all, a: string, b: string) => range(Number(a), Number(b), all),
    )
    .replace(
      /(?<![\w-])(?:p\s?(\d{1,2})|periods?\s+(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+period)\b/g,
      (all, a?: string, b?: string, c?: string) => {
        const clock = start(Number(a ?? b ?? c));
        return clock ? ` ${clock} ` : all;
      },
    )
    .replace(
      /\b(?:first|pehla|pehle|pahla)\s+(?:period|slot|hour)\b/g,
      firstTeaching !== undefined ? ` ${start(firstTeaching)} ` : "$&",
    )
    .replace(
      /\b(?:last|aakhri|akhri|aakhiri)\s+(?:period|slot|hour)\b/g,
      lastTeaching !== undefined ? ` ${start(lastTeaching)} ` : "$&",
    )
    .replace(
      /\b(?:before\s+lunch|pre[\s-]?lunch|lunch\s+se\s+pehle)\b/g,
      " morning ",
    );
}

const CLOCK_CHIP_RE =
  /(?<![\w:.\/-])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)(?![\w])/g;

/** One end of a clock range ("10 se 12 baje", "3 pm to 4 pm"): not a single period. */
const RANGE_END_BEFORE_RE =
  /\d(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje)?\s*(?:-|–|to|till|until|upto|se)\s*$/;
const RANGE_START_AFTER_RE = /^\s*(?:-|–|to|till|until|upto|se)\s*\d/;

/** "'8 baje' read as P1 (08:00–09:00)" for each single clock time in the segment. */
function clockChips(segment: string, ctx: AssistantContext): string[] {
  const chips: string[] = [];
  for (const m of segment.matchAll(CLOCK_CHIP_RE)) {
    if (
      RANGE_END_BEFORE_RE.test(segment.slice(0, m.index)) ||
      RANGE_START_AFTER_RE.test(segment.slice(m.index + m[0].length))
    )
      continue;
    const h = Number(m[1]);
    const mm = Number(m[2] ?? 0);
    const mer = m[3].startsWith("a")
      ? "am"
      : m[3].startsWith("p")
        ? "pm"
        : null;
    if (h > 23 || mm > 59) continue;
    let hour = h;
    if (mer === "am") hour = h === 12 ? 0 : h;
    else if (mer === "pm") hour = h === 12 ? 12 : h + 12;
    else if (h >= 1 && h <= 7) hour = h + 12;
    const minutes = hour * 60 + mm;
    const period = ctx.calendar.periods.find((p) => {
      const [sh, sm] = p.start.split(":").map(Number);
      const [eh, em] = p.end.split(":").map(Number);
      return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
    });
    if (period?.teaching)
      chips.push(
        `'${m[0].trim()}' read as P${period.id} (${period.start}–${period.end})`,
      );
  }
  return chips;
}

const CLOCK_RANGE_RE = new RegExp(
  String.raw`(?<![\w:.\/-])\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje)?\s*(?:-|–|to|till|until|upto|se)\s*\d{1,2}(?:[:.]\d{2})?(?:\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje))?(?:\s*baje)?(?:\s*tak)?(?![\w:])${NOT_A_COUNT}`,
  "g",
);

/** "'10 se 12 baje' read as P3–P4 (10:00–12:00)" for each clock range in the segment. */
function rangeReadings(
  segment: string,
  ctx: AssistantContext,
): { quote: string; periods: number[] }[] {
  const probeDay = ctx.calendar.days[0];
  if (!probeDay) return [];
  const teaching = new Set(teachingPeriods(ctx));
  const out: { quote: string; periods: number[] }[] = [];
  for (const m of segment.matchAll(CLOCK_RANGE_RE)) {
    const sched = parseSchedule(
      `${probeDay.toLowerCase()} ${m[0]}`,
      scheduleContext(ctx),
    );
    if (sched.problems.length > 0) continue;
    const covered = new Set<number>();
    for (const w of sched.windows)
      for (let p = w.from_period; p <= w.to_period; p++)
        if (teaching.has(p)) covered.add(p);
    if (covered.size > 0)
      out.push({
        quote: m[0].trim(),
        periods: [...covered].sort((a, b) => a - b),
      });
  }
  return out;
}

function spanChip(
  ctx: AssistantContext,
  quote: string,
  periods: number[],
): string {
  const a = periodClock(ctx, periods[0]);
  const b = periodClock(ctx, periods[periods.length - 1]);
  return `'${quote}' read as ${rangeLabel(periods)}${a && b ? ` (${a.start}–${b.end})` : ""}`;
}

const OUTSIDE_WORD_RE =
  /\b(?:late\s+night|evening|night|shaam|sham|raat|tonight)\b|(?<![\w:.\/-])\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje)(?![\w])|(?<![\w:.\/-])\d{1,2}:\d{2}/;

export type SegmentTime = {
  /** Days named (weekdays in calendar order). */
  days: Day[];
  /** Teaching periods the times cover (sorted); empty when no usable time was given. */
  periods: number[];
  /** One start period ("3 pm", "P4"), for "my 3 pm lecture"; else null. */
  start: number | null;
  /** The words, when every time given falls outside teaching hours. */
  outside: string | null;
  weekend: boolean;
  /** A day or time word was found at all. */
  any: boolean;
  chips: string[];
};

const EMPTY_TIME: SegmentTime = {
  days: [],
  periods: [],
  start: null,
  outside: null,
  weekend: false,
  any: false,
  chips: [],
};

function scheduleContext(ctx: AssistantContext): ParseContext {
  return {
    datasetId: ctx.datasetId,
    calendar: ctx.calendar,
    rooms: [],
    groups: [],
    referenceDate: ctx.referenceDate,
  };
}

/** Booking-worded chips the time reader adds, made neutral (or dropped). */
function neutralChip(chip: string): string | null {
  if (/^No time given/i.test(chip)) return null;
  if (/^Widened to|rounded up to/i.test(chip)) return null;
  return chip.replace(/\s*\(one booking per day\)/, "");
}

/**
 * How a part of the message is read: `source` (where a session is now: one start time),
 * `target` (where it may go: every time named counts) or `absence` (when someone is unavailable:
 * every time counts, "from 2 pm" / "2 baje se" runs to the end of the day, and any number that
 * couldn't be read as a time is quoted, so an absence is never marked short without saying so).
 */
export type SegmentMode = "source" | "target" | "absence";

const SINGLE_TIME_RE =
  /(?<![\w:.\/-])\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)(?![\w])|(?<![\w:.\/-])\d{1,2}:\d{2}(?![\w:])|\b(?:at|@)\s*\d{1,2}(?![\w:.])/g;

/** Clock times in `t` that stand alone (not one end of a range). */
function singleTimes(t: string): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(SINGLE_TIME_RE)) {
    if (
      RANGE_END_BEFORE_RE.test(t.slice(0, m.index)) ||
      RANGE_START_AFTER_RE.test(t.slice(m.index + m[0].length))
    )
      continue;
    out.push(m[0]);
  }
  return out;
}

/** Days and teaching periods in one part of the message, read as `mode` says. */
export function readSegmentTime(
  segment: string,
  ctx: AssistantContext,
  mode: SegmentMode = "source",
): SegmentTime {
  const text = segment.trim();
  if (!text) return EMPTY_TIME;
  const openEnded = mode === "absence";
  const bounds = readBounds(text, ctx, openEnded);
  const bare = readBareHours(bounds.text, bounds.plain, ctx);
  const rewritten = rewritePeriods(bare.text, ctx);
  const pctx = scheduleContext(ctx);
  const sched = parseSchedule(rewritten, pctx);
  // Windows need a day: read a time given without one against a placeholder day.
  const probeDay = ctx.calendar.days[0];
  const timed =
    !sched.hasDay && sched.hasTime && probeDay
      ? parseSchedule(`${probeDay.toLowerCase()} ${rewritten}`, pctx)
      : sched;

  const order = (d: Day) => ctx.calendar.days.indexOf(d);
  // An unusable time ("kal 25:00") leaves no window; the days named still count.
  const dayRead =
    sched.hasDay && sched.windows.length === 0
      ? parseSchedule(rewritten.replace(/\d+(?:[:.]\d+)?/g, " "), pctx)
      : sched;
  const days = dayRead.hasDay
    ? uniq([...dayRead.windows.map((w) => w.day), ...dayRead.repeat_days]).sort(
        (a, b) => order(a) - order(b),
      )
    : [];

  const teaching = new Set(teachingPeriods(ctx));
  const covered = new Set<number>();
  const spans = new Set<string>();
  if (timed.hasTime) {
    for (const w of timed.windows) {
      spans.add(`${w.from_period}-${w.to_period}`);
      for (let p = w.from_period; p <= w.to_period; p++) covered.add(p);
    }
    // The time reader keeps one single time; a target or an absence keeps every one named
    // ("kal 9 aur 11 baje" → P2 and P4).
    if (mode !== "source" && probeDay)
      for (const single of singleTimes(rewritten)) {
        const one = parseSchedule(`${probeDay.toLowerCase()} ${single}`, pctx);
        for (const w of one.windows) {
          spans.add(`${w.from_period}-${w.to_period}`);
          for (let p = w.from_period; p <= w.to_period; p++) covered.add(p);
        }
      }
  }
  const periods = [...covered]
    .filter((p) => teaching.has(p))
    .sort((a, b) => a - b);
  const flags = new Set(timed.flags);
  // "3 am" is outside teaching hours; "25:00" is no time at all (said in a chip, not "outside").
  const problem = timed.problems.some((p) => p.kind !== "invalid");

  const outsideWord = () =>
    bounds.outside ?? OUTSIDE_WORD_RE.exec(text)?.[0].trim() ?? null;
  let outside: string | null = null;
  if (
    timed.hasTime &&
    periods.length === 0 &&
    (covered.size > 0 || problem || flags.has("before_start"))
  )
    outside = outsideWord() ?? "that time";
  if (flags.has("before_start") && periods.length <= 1 && !outside)
    outside = outsideWord() ?? "before classes start";

  let start: number | null = null;
  if (spans.size === 1 && periods.length === 1 && !outside) {
    const [only] = [...spans];
    const [a, b] = only.split("-").map(Number);
    if (a === b) start = a;
  }

  const chips = [
    ...bounds.chips,
    ...bare.chips,
    ...sched.assumptions
      .map(neutralChip)
      // An evening reading is replaced by the reply's "no classes then".
      .filter(
        (c): c is string => c !== null && !(outside && /P1[0-3]\b/.test(c)),
      ),
    ...clockChips(bare.plain, ctx),
    ...(outside
      ? []
      : rangeReadings(bare.plain, ctx).map((r) =>
          spanChip(ctx, r.quote, r.periods),
        )),
  ];
  if (flags.has("lunch") && periods.length > 0)
    chips.push(
      `Lunch (${ctx.calendar.lunch.start}–${ctx.calendar.lunch.end}) has no classes; read as P${periods[0]}`,
    );
  if (periods.length > 0 && covered.size > periods.length)
    chips.push(
      `Only ${rangeLabel(periods)} ${periods.length === 1 ? "is a teaching period" : "are teaching periods"} in that time`,
    );
  for (const p of timed.problems) {
    if (p.kind === "invalid")
      chips.push(`'${p.text}' isn't a valid time, so it was left out`);
    else if (p.kind === "reversed" && periods.length > 0)
      chips.push(
        `'${p.text}' ends before it starts; read from its start (P${periods[0]})`,
      );
  }
  if (openEnded && !timed.hasTime)
    chips.push(...leftoverChips(bare.plain, ctx));

  return {
    days,
    periods: outside ? [] : periods,
    start,
    outside,
    weekend: flags.has("weekend"),
    any: sched.hasDay || sched.hasTime || timed.hasTime,
    chips: uniq(chips),
  };
}

/** "P1–P5", "P3", "P1, P4". */
export function rangeLabel(periods: readonly number[]): string {
  if (periods.length === 0) return "";
  const sorted = [...periods].sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  if (sorted.length === 1) return `P${sorted[0]}`;
  return contiguous
    ? `P${sorted[0]}–P${sorted.at(-1)}`
    : sorted.map((p) => `P${p}`).join(", ");
}

// --------------------------------------------------------------------------- segmentation

/** "to Thursday", "into LH-3", "→ P2": where the target starts (not "want to", "10 to 12"). */
function targetMarker(t: string, ctx: AssistantContext): number | null {
  const roomStarts = new Set(findRooms(t, ctx).map((r) => r.index));
  const LEAD =
    /^\s*(?:(?:the|a|an|some|any|another|next|same|other|different|free|my|its|it's|available|empty|open|better|earlier|later|new)\s+)*/;
  const SLOT_WORD =
    /^(?:slot|day|time|period|room|hall|week|later|earlier|any|free|another|other|same|next|different)\b/;
  for (const m of t.matchAll(/\b(?:to|into|onto|towards?)\b|->|→|=>/g)) {
    const before = t.slice(0, m.index);
    const afterRaw = t.slice(m.index + m[0].length);
    // A clock range ("10 to 12", "3 pm to 4 pm") is a time, not a target.
    if (
      /\d\s*(?:am|pm|a\.m\.|p\.m\.|baje)?\s*$/.test(before) &&
      /^\s*\d/.test(afterRaw)
    )
      continue;
    const lead = LEAD.exec(afterRaw)?.[0] ?? "";
    const rest = afterRaw.slice(lead.length);
    const restAt = m.index + m[0].length + lead.length;
    const tok = new RegExp(`^(?:${TIME_TOKEN_RE.source})`).exec(rest);
    if (
      tok ||
      roomStarts.has(restAt) ||
      SLOT_WORD.test(rest) ||
      (lead.trim().length > 0 &&
        /\b(?:any|another|other|free|next|same|different|earlier|later)\b/.test(
          lead,
        ))
    )
      return m.index;
  }
  return null;
}

const SOURCE_MARK_RE =
  /\b(?:wali|wala|waali|waala|vali|vala|wale|waale|vaali)\b/;
const INSTEAD_OF_RE = /\b(?:instead\s+of|rather\s+than)\b/;
const DAY_WORD = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri)(?:day)?|(?:somv|somw|mangalv|mangalw|budhv|budhw|guruv|guruw|shukrav|shukraw)[ae]r|kal|aaj|parso`;
const HINGLISH_FROM_TO_RE = new RegExp(
  String.raw`(.*?\b(?:${DAY_WORD})\b(?:\s+\S+){0,2}?)(\s+se\s+)(?=(?:${DAY_WORD})\b)`,
);
const HINGLISH_INSTEAD_RE =
  /\b(?:ki\s+jagah|ki\s+jaga|ke\s+bajaye|ke\s+bajay|ke\s+badle)\b/;
const SESSION_NOUN = String.raw`(?:lectures?|class(?:es)?|tutorials?|tut|labs?|sessions?|practicals?|[a-z]{2,4}[\s-]?\d{3}(?:-[a-z0-9]{1,4})*)`;

type Split = { source: string; target: string };

/** Where the session is now vs where it should go, for a move. */
function splitMove(main: string, ctx: AssistantContext, soft: boolean): Split {
  const instead = INSTEAD_OF_RE.exec(main);
  if (instead) {
    const after = main.slice(instead.index + instead[0].length);
    const cut = /[.;!?]|\b(?:to|and|but|please)\b/.exec(after);
    return {
      source: cut ? after.slice(0, cut.index) : after,
      target:
        main.slice(0, instead.index) +
        " " +
        (cut ? after.slice(cut.index) : ""),
    };
  }
  const hinglishInstead = HINGLISH_INSTEAD_RE.exec(main);
  if (hinglishInstead)
    return {
      source: main.slice(0, hinglishInstead.index),
      target: main.slice(hinglishInstead.index + hinglishInstead[0].length),
    };
  const marker = targetMarker(main, ctx);
  if (marker !== null)
    return { source: main.slice(0, marker), target: main.slice(marker) };
  // "Tuesday se Wednesday": in a move, from one day to the other (not a range of days).
  const fromTo = HINGLISH_FROM_TO_RE.exec(main);
  if (fromTo) {
    const cut = fromTo.index + fromTo[1].length;
    return {
      source: main.slice(0, cut),
      target: main.slice(cut + fromTo[2].length),
    };
  }

  const phrases = timePhrases(main);
  const sourceMark = SOURCE_MARK_RE.exec(main);
  if (sourceMark) {
    const cut = sourceMark.index + sourceMark[0].length;
    return { source: main.slice(0, cut), target: main.slice(cut) };
  }
  if (phrases.length === 0) return { source: "", target: "" };

  // A bare "instead": the time right before it is the target.
  const bareInstead = /\binstead\b/.exec(main);
  if (bareInstead) {
    const before = phrases.filter((p) => p.end <= bareInstead.index);
    const target = before.at(-1);
    if (target)
      return {
        source: phrases
          .filter((p) => p !== target)
          .map((p) => p.text)
          .join(" "),
        target: target.text,
      };
  }

  if (soft) return { source: "", target: phrases.map((p) => p.text).join(" ") };

  // Group phrases joined by "and" / "or" / "," (alternatives or a list of the same part).
  const groups: Phrase[][] = [];
  for (const p of phrases) {
    const last = groups.at(-1);
    const prev = last?.at(-1);
    if (
      last &&
      prev &&
      /^\s*(?:,|and|or|aur|ya|&|\/)\s*(?:on\s+|at\s+)?$/.test(
        main.slice(prev.end, p.index),
      )
    )
      last.push(p);
    else groups.push([p]);
  }
  const text = (g: Phrase[]) => g.map((p) => p.text).join(" ");
  if (groups.length >= 2)
    return {
      source: text(groups[0]),
      target: groups.slice(1).map(text).join(" "),
    };

  // One group: a descriptor of the session ("my Friday lecture", "lecture on Friday") is the
  // source; anything else is where it should go.
  const group = groups[0];
  const first = group[0];
  const last = group[group.length - 1];
  const before = new RegExp(
    String.raw`^\s*(?:'s\s+)?(?:wali\s+|wala\s+|ki\s+|ka\s+|ke\s+)?(?:(?:[a-z]{2,4}[\s-]?\d{3}\s+)?${SESSION_NOUN})\b`,
  ).test(main.slice(last.end));
  const after = new RegExp(
    String.raw`${SESSION_NOUN}\s+(?:on|at|of|scheduled\s+(?:on|at|for)|which\s+is\s+(?:on|at)|that'?s\s+(?:on|at)|that\s+is\s+(?:on|at))\s*$`,
  ).test(main.slice(0, first.index));
  return before || after
    ? { source: text(group), target: "" }
    : { source: "", target: text(group) };
}

// --------------------------------------------------------------------------------- reason

const REASON_RE =
  /\b(?:because(?:\s+of)?|since(?!\s+\d)|due\s+to|owing\s+to|reason\s*[:-]?|kyunki|kyuki|kyonki|ki\s+wajah\s+se|ke\s+karan|for\s+(?:a|an|the|my|some))\s+([^.;!?]{3,200})/i;
const REASON_WORDS_RE =
  /\b(?:conference|seminar|workshop|wedding|shaadi|medical|doctor|hospital|surgery|sick|fever|illness|exam\s+duty|invigilation|meeting|travel|trip|family\s+emergency|personal\s+work|viva|interview|committee|training)\b/i;

/** The user's reason, verbatim and short, or null. */
export function findReason(clean: string): string | null {
  const m = REASON_RE.exec(clean);
  if (m) return clip(m[1].trim().replace(/\s+/g, " "), 200);
  const w = REASON_WORDS_RE.exec(clean);
  return w ? clip(w[0], 200) : null;
}

// -------------------------------------------------------------------------------- intents

function classify(t: string): AssistantIntentKind | "soft_move" {
  const why = WHY_RE.test(t);
  const move = MOVE_RE.test(t);
  const unavailable = UNAVAILABLE_RE.test(t);
  const add = ADD_RE.test(t);
  if (add) return "add_session";
  if (why && !move) return "explain_session";
  if (move && unavailable) {
    // "I'm away Monday, move my CS202 lecture to Tuesday" moves one session; "I'm away Monday,
    // please move my classes" marks the time unavailable (the rescheduler moves them).
    return /\b(?:to|into|onto|instead)\b|->|→/.test(t)
      ? "move_session"
      : "mark_unavailable";
  }
  if (why) return "explain_session";
  if (move) return "move_session";
  if (unavailable) return "mark_unavailable";
  return "soft_move";
}

function emptyIntent(kind: AssistantIntentKind): AssistantIntentLLM {
  return {
    intent: kind,
    session: {
      course_id: null,
      kind: null,
      day: null,
      start_period: null,
      session_id: null,
    },
    target: { days: [], periods: [], room_id: null },
    new_session: { course_id: null, kind: null },
    faculty_hint: null,
    reason: null,
  };
}

/** Where the session is now (`source`) and where it should go or when (`target`). */
function segmentsFor(
  kind: AssistantIntentKind,
  main: string,
  ctx: AssistantContext,
  soft: boolean,
): Split {
  switch (kind) {
    case "move_session":
      return splitMove(main, ctx, soft);
    case "explain_session":
      return { source: main, target: "" };
    default:
      return { source: "", target: main };
  }
}

/** The message cleaned, lower-cased and cut at "otherwise" (the fallback part kept apart). */
function prepared(message: string) {
  const { clean, notes } = assistantCleanWithNotes(message);
  const t = clean.toLowerCase();
  const fb = FALLBACK_RE.exec(t);
  return {
    clean,
    t,
    main: fb ? t.slice(0, fb.index) : t,
    fallbackText: fb ? t.slice(fb.index + fb[0].length) : null,
    soft: !MOVE_RE.test(t),
    notes,
  };
}

function signalsFrom(
  p: ReturnType<typeof prepared>,
  target: SegmentTime,
  ctx: AssistantContext,
): IntentSignals {
  let fallback: FallbackWindow | null = null;
  if (p.fallbackText !== null) {
    const time = readSegmentTime(p.fallbackText, ctx, "target");
    if (time.days.length > 0 || time.periods.length > 0)
      fallback = { days: time.days, periods: time.periods };
  }
  return {
    bypass: BYPASS_RE.test(p.t),
    booking: BOOKING_RE.test(p.t),
    allSessions: ALL_RE.test(p.t),
    outsideHours: target.outside,
    weekend: target.weekend,
    sameDay: SAME_DAY_RE.test(p.t),
    otherDay: OTHER_DAY_RE.test(p.t),
    fallback,
    shift: findShift(p.t),
  };
}

const SHIFT_AMOUNT = String.raw`(\d|one|two|three|four|an?|ek|do|teen|char|chaar)`;
const SHIFT_UNIT = String.raw`(?:hours?|hrs?|periods?|slots?|ghante|ghanta)`;
const SHIFT_RE = new RegExp(
  String.raw`\b${SHIFT_AMOUNT}\s+${SHIFT_UNIT}\s+(later|after|baad(?:\s+mein)?|aage|earlier|before|pehle|peeche)\b`,
);
const SHIFT_BY_RE = new RegExp(
  String.raw`\b(postpone|push|delay|move\s+back|prepone|advance|bring\s+(?:it\s+)?forward)\w*\b.*?\bby\s+${SHIFT_AMOUNT}\s+${SHIFT_UNIT}`,
);
const SHIFT_NUMBERS: Record<string, number> = {
  one: 1,
  a: 1,
  an: 1,
  ek: 1,
  two: 2,
  do: 2,
  three: 3,
  teen: 3,
  four: 4,
  char: 4,
  chaar: 4,
};

/** "two hours later" → 2, "an hour earlier" → -1, "postpone by 1 hour" → 1; else null. */
export function findShift(t: string): number | null {
  const amount = (word: string) => SHIFT_NUMBERS[word] ?? Number(word);
  const m = SHIFT_RE.exec(t);
  if (m) {
    const n = amount(m[1]);
    if (!(n > 0)) return null;
    return /^(?:later|after|baad|aage)/.test(m[2]) ? n : -n;
  }
  const by = SHIFT_BY_RE.exec(t);
  if (by) {
    const n = amount(by[2]);
    if (!(n > 0)) return null;
    return /^(?:prepone|advance|bring)/.test(by[1]) ? -n : n;
  }
  return null;
}

/** "any slot except Friday", "not on Monday", "Friday chhod kar": what follows is left out. */
const EXCEPT_RE =
  /\b(?:except(?:\s+for)?|but\s+not|not\s+on|other\s+than|apart\s+from|anything\s+but|excluding)\b/;
/** "Friday chhod kar", "Friday ke alawa": the time before it is left out. */
const HINGLISH_EXCEPT_RE =
  /\b(?:ko\s+)?(?:chhod\s*kar|chhodke|chhod\s+ke|ke\s+alawa|ke\s+alaava|ke\s+siwa|ke\s+siwaay|ke\s+sivaay)\b/;

/**
 * The target's days and periods with an exclusion applied: days named after "except" are left
 * out of the named (or all) days; without excluded days, excluded periods are left out instead.
 */
function withExclusion(
  main: string,
  target: string,
  read: SegmentTime,
  ctx: AssistantContext,
  mode: SegmentMode,
): SegmentTime {
  const hinglish = HINGLISH_EXCEPT_RE.exec(main);
  if (hinglish) {
    const before = timePhrases(main.slice(0, hinglish.index)).at(-1);
    if (!before) return read;
    const dropped = readSegmentTime(before.text, ctx, mode);
    const keptDays = read.days.filter((d) => !dropped.days.includes(d));
    const kept: SegmentTime = {
      ...read,
      days: keptDays.length > 0 ? keptDays : [],
    };
    return applyExclusion(
      kept,
      dropped,
      `${before.text} ${hinglish[0].trim()}`,
      ctx,
    );
  }
  const ex = EXCEPT_RE.exec(target);
  if (!ex) return read;
  const kept = readSegmentTime(target.slice(0, ex.index), ctx, mode);
  const dropped = readSegmentTime(
    target.slice(ex.index + ex[0].length),
    ctx,
    mode,
  );
  const quoted = target
    .slice(ex.index)
    .split(/[,.;!?]/)[0]
    .trim();
  return applyExclusion(kept, dropped, quoted, ctx);
}

function applyExclusion(
  kept: SegmentTime,
  dropped: SegmentTime,
  quoted: string,
  ctx: AssistantContext,
): SegmentTime {
  if (dropped.days.length === 0 && dropped.periods.length === 0) return kept;
  if (dropped.days.length > 0) {
    const from = kept.days.length > 0 ? kept.days : [...ctx.calendar.days];
    const days = from.filter((d) => !dropped.days.includes(d));
    return {
      ...kept,
      days,
      chips: [
        ...kept.chips,
        `'${quoted}' read as ${days.join(", ") || "no day"}`,
      ],
    };
  }
  const from = kept.periods.length > 0 ? kept.periods : teachingPeriods(ctx);
  const periods = from.filter((p) => !dropped.periods.includes(p));
  return {
    ...kept,
    periods,
    chips: [
      ...kept.chips,
      `'${quoted}' read as ${rangeLabel(periods) || "no period"}`,
    ],
  };
}

/**
 * What code reads from the message for an intent of `kind` (the model's or the rule parser's):
 * rule-bypass asks, bookings, "all my classes", a target outside teaching hours, weekends,
 * "same day" / "another day", and the fallback window after "otherwise".
 */
export function readSignals(
  message: string,
  ctx: AssistantContext,
  kind: AssistantIntentKind,
): IntentSignals {
  const p = prepared(message);
  const { target } = segmentsFor(kind, p.main, ctx, p.soft);
  return signalsFrom(
    p,
    readSegmentTime(
      target,
      ctx,
      kind === "mark_unavailable" ? "absence" : "target",
    ),
    ctx,
  );
}

export type RulesIntent = {
  intent: AssistantIntentLLM;
  /** Readings to show ("'kal' read as tomorrow (TUE)"). */
  assumptions: string[];
  signals: IntentSignals;
};

/** The rule parser: `message` → intent, readings and signals. Pure; never throws on odd input. */
export function extractIntentWithRules(
  message: string,
  ctx: AssistantContext,
): RulesIntent {
  const p = prepared(message);
  const { main } = p;

  const hints = findSessionHints(main, ctx);
  const mentions = findFacultyMentions(main, ctx);
  const faculty =
    mentions.find((m) => m.hint !== ctx.selfFacultyId)?.hint ?? null;
  let kind = classify(p.t);

  // A soft ask ("I want my CS202 lecture on Thursday", "CS202 Thursday ko kar do") is a move
  // only when it names a session and a time; anything else is not something the assistant does.
  const sessionNamed =
    hints.course_id !== null ||
    hints.session_id !== null ||
    new RegExp(String.raw`\b${SESSION_NOUN}\b`).test(main);
  if (kind === "soft_move")
    kind =
      SOFT_MOVE_RE.test(p.t) &&
      sessionNamed &&
      (timePhrases(main).length > 0 || findShift(p.t) !== null)
        ? "move_session"
        : "unsupported";

  const { source, target } = segmentsFor(kind, main, ctx, p.soft);
  // An absence reads "from 2 pm" as the rest of the day and flags any time it couldn't read.
  const mode: SegmentMode = kind === "mark_unavailable" ? "absence" : "target";
  const src = readSegmentTime(source, ctx, "source");
  const dst = withExclusion(
    main,
    target,
    readSegmentTime(target, ctx, mode),
    ctx,
    mode,
  );
  const intent = emptyIntent(kind);

  if (kind === "move_session" || kind === "explain_session")
    intent.session = {
      course_id: hints.course_id,
      kind: hints.kind,
      day: src.days[0] ?? null,
      start_period: src.start,
      session_id: hints.session_id,
    };
  if (kind === "add_session")
    intent.new_session = { course_id: hints.course_id, kind: hints.kind };
  if (
    kind === "move_session" ||
    kind === "add_session" ||
    kind === "mark_unavailable"
  )
    intent.target = {
      days: dst.days.slice(0, 5),
      periods: dst.periods.slice(0, 9),
      room_id:
        kind === "mark_unavailable" ? null : targetRoom(main, target, ctx),
    };
  if (kind !== "unsupported" && faculty) intent.faculty_hint = faculty;
  if (kind === "mark_unavailable" || kind === "move_session")
    intent.reason = findReason(p.clean);

  const oneFaculty = oneFacultyChip(mentions, intent.faculty_hint, ctx);
  const assumptions =
    kind === "unsupported"
      ? []
      : uniq([
          ...p.notes,
          ...src.chips,
          ...dst.chips,
          ...(oneFaculty ? [oneFaculty] : []),
        ]);
  return { intent, assumptions, signals: signalsFrom(p, dst, ctx) };
}

/**
 * The room the session should go to: one named in the target part, or a room followed by
 * "mein" ("LH-3 mein shift kar do").
 */
function targetRoom(
  main: string,
  target: string,
  ctx: AssistantContext,
): string | null {
  const inTarget = target ? findRooms(target, ctx)[0] : undefined;
  if (inTarget) return inTarget.id;
  const hinglish = findRooms(main, ctx).find((r) =>
    /^\s*(?:mein|me|main|mai)\b/.test(main.slice(r.end)),
  );
  return hinglish?.id ?? null;
}

/**
 * Readings for an intent the model produced, from the message itself: vague words and relative
 * days the intent's windows match ("'morning' read as P1–P5 (08:00–13:00)").
 */
export function readingsFor(
  message: string,
  intent: AssistantIntentLLM,
  ctx: AssistantContext,
): string[] {
  const t = assistantClean(message).toLowerCase();
  const chips: string[] = [];
  const periods = new Set(intent.target.periods);
  const sameSpan = (span: number[]) =>
    span.length > 0 &&
    span.length === periods.size &&
    span.every((p) => periods.has(p));
  const teaching = teachingPeriods(ctx);
  const lunchAfter = ctx.calendar.lunch.after_period;
  const morning = teaching.filter((p) => p <= lunchAfter);
  const afternoon = teaching.filter((p) => p > lunchAfter);
  const clock = (span: number[]) => {
    const a = periodClock(ctx, span[0]);
    const b = periodClock(ctx, span[span.length - 1]);
    return a && b ? ` (${a.start}–${b.end})` : "";
  };
  // "after 2", "11 se pehle": quoted when the model's periods are what the phrase means.
  const bounds = readBounds(t, ctx, intent.intent === "mark_unavailable");
  for (const span of bounds.spans)
    if (sameSpan(span.periods))
      chips.push(
        `'${span.quote}' read as ${rangeLabel(span.periods)}${clock(span.periods)}`,
      );
  for (const m of t.matchAll(/\b(?:morning|subah|forenoon)\b/g))
    if (sameSpan(morning))
      chips.push(`'${m[0]}' read as ${rangeLabel(morning)}${clock(morning)}`);
  for (const m of t.matchAll(
    /\b(?:afternoon|dopahar|dupahar|after\s+lunch|post[\s-]?lunch|lunch\s+ke\s+baad)\b/g,
  ))
    if (sameSpan(afternoon))
      chips.push(
        `'${m[0]}' read as ${rangeLabel(afternoon)}${clock(afternoon)}`,
      );
  const days = new Set<string>([
    ...intent.target.days,
    ...(intent.session.day ? [intent.session.day] : []),
  ]);
  const relative: [RegExp, number, string][] = [
    [/\b(?:day after tomorrow|parso|parson)\b/, 2, "the day after tomorrow"],
    [/\b(?:tomorrow|tmrw|kal)\b/, 1, "tomorrow"],
    [/\b(?:today|aaj)\b/, 0, "today"],
  ];
  for (const [re, offset, meaning] of relative) {
    const m = re.exec(t);
    const day = weekdayFromDate(ctx.referenceDate, offset);
    if (m && day && days.has(day))
      chips.push(`'${m[0]}' read as ${meaning} (${day})`);
  }
  chips.push(...clockChips(bounds.plain, ctx));
  for (const r of rangeReadings(bounds.plain, ctx))
    if (sameSpan(r.periods)) chips.push(spanChip(ctx, r.quote, r.periods));
  return uniq(chips);
}
