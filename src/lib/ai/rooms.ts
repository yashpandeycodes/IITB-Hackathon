/**
 * Rooms: finding the room a request names ("SH-1", "LH 5", "main auditorium", "OAT", "room 204"),
 * resolving it against the campus (never inventing an id), suggesting the closest id for unknown
 * text ("LHC-5" or "lhc-5" → LH-5), and the room types a request implies. Alternatives and
 * derived types only count rooms whose `allowed_uses` include events. Pure.
 */
import { RoomType, type Need } from "@/lib/contracts";

import { needList } from "./needs";
import type { ParseContext } from "./types";
import { compact, editDistance, uniq } from "./text";

export type Room = ParseContext["rooms"][number];

export type RoomIndex = {
  rooms: readonly Room[];
  /** Compact alias ("SH1", "MAINAUDITORIUM", "OAT") → room id. */
  aliases: Map<string, string>;
  /** Compact aliases that look like codes (letters + digits, or ids): suggestion targets. */
  codes: { alias: string; id: string }[];
  /** Compact group ids and department codes: never rooms. */
  notRooms: Set<string>;
};

export type RoomResolution = {
  text: string | null;
  room: Room | null;
  suggestion: Room | null;
  /** "room 204": the number and the rooms whose id or name ends in it. */
  numbered?: { number: number; candidates: Room[] };
};

/** Whether `room` may host an event (Spectra bookings are events). */
export function hostsEvents(room: Room): boolean {
  return (
    Array.isArray(room.allowed_uses) && room.allowed_uses.includes("event")
  );
}

/** Words that make a lone type word a specific room when only one room has that type. */
const TYPE_PHRASES: readonly { re: RegExp; type: string }[] = [
  { re: /auditorium|audi/, type: "auditorium" },
  {
    re: /open[\s-]?air(?:\s+theat(?:re|er))?|amphitheat(?:re|er)/,
    type: "outdoor",
  },
  { re: /physics\s+lab/, type: "lab_phy" },
  { re: /civil(?:\s+engineering)?\s+lab/, type: "lab_civil" },
];

export function buildRoomIndex(ctx: ParseContext): RoomIndex {
  const aliases = new Map<string, string>();
  const codes: { alias: string; id: string }[] = [];
  const add = (alias: string, id: string, code = false) => {
    const key = compact(alias);
    if (key.length < 2) return;
    if (!aliases.has(key)) aliases.set(key, id);
    if (code && !codes.some((c) => c.alias === key))
      codes.push({ alias: key, id });
  };
  for (const room of ctx.rooms) {
    add(room.id, room.id, true);
    add(room.name, room.id);
    if (/theatre/i.test(room.name))
      add(room.name.replace(/theatre/gi, "theater"), room.id);
    const words = room.name.split(/[\s-]+/).filter(Boolean);
    const letters = words
      .filter((w) => /^[A-Za-z]+$/.test(w))
      .map((w) => w[0])
      .join("");
    const digits = words.filter((w) => /\d/.test(w)).join("");
    if (letters.length >= 2 && (digits || letters.length >= 3))
      add(letters + digits, room.id, true);
    for (const token of room.name.match(/\b[A-Za-z]?-?\d+[A-Za-z]?\b/g) ?? [])
      if (/[A-Za-z]/.test(token)) add(token, room.id, true);
    if (room.type === "auditorium") {
      add("audi", room.id);
      add("main audi", room.id);
    }
    if (room.type === "outdoor") add("open air", room.id);
  }
  const notRooms = new Set<string>();
  for (const g of ctx.groups) {
    notRooms.add(compact(g.id));
    notRooms.add(compact(g.department));
  }
  return { rooms: ctx.rooms, aliases, codes, notRooms };
}

function roomById(index: RoomIndex, id: string | undefined): Room | null {
  return id ? (index.rooms.find((r) => r.id === id) ?? null) : null;
}

/** The only room of `type`, if exactly one exists. */
function uniqueOfType(index: RoomIndex, type: string): Room | null {
  const of = index.rooms.filter((r) => r.type === type);
  return of.length === 1 ? of[0] : null;
}

/** The closest code-like alias within edit distance 2 (ties: dataset order). */
function suggest(index: RoomIndex, key: string): Room | null {
  if (key.length < 2) return null;
  let best: { d: number; id: string } | null = null;
  for (const { alias, id } of index.codes) {
    const d = editDistance(key, alias);
    if (
      d <= 2 &&
      d < Math.max(key.length, alias.length) &&
      (!best || d < best.d)
    )
      best = { d, id };
  }
  return roomById(index, best?.id);
}

/** "room 204", "room no. 5", "rm #12" (not "room 2 hours" or "room 45 people"). */
const ROOM_NUMBER_RE =
  /\b(?:class\s*room|room|rm)[\s-]*(?:no\.?\s*|number\s*|#\s*)?(\d{1,4})\b(?!\s*(?:people|persons?|students?|participants?|attendees?|members?|guests?|log|seats?|hours?|hrs?|hr\b|ghante|ghanta|minutes?|mins?|am\b|pm\b|a\.m|p\.m|baje|o'?clock|:\d|-\s*\d|to\s+\d))/gi;

/** A bare room number as the LLM may copy it ("204", "room 204"). */
const NUMBER_TEXT_RE =
  /^(?:the\s+)?(?:(?:class\s*room|room|rm)\s*(?:no\.?\s*|number\s*|#\s*)?)?(\d{1,4})$/i;

/** Rooms whose id or name ends in `n` ("204" → CR-204 / Classroom B-204). */
function roomsNumbered(index: RoomIndex, n: number): Room[] {
  const tail = (s: string) => {
    const m = /(\d+)[A-Za-z]?$/.exec(s.trim());
    return m ? Number(m[1]) : null;
  };
  return index.rooms.filter((r) => tail(r.id) === n || tail(r.name) === n);
}

/** Lower-case letters before a number that are not room codes ("covid-19", "top-10", "mon-5"). */
const NOT_CODE_WORDS = new Set(
  (
    "am pm baje bje no num nos rs inr usd covid top web mp year yr yrs sem batch team grade " +
    "class round phase level sec section gate day days week room rm " +
    "mon tue tues wed thu thur thurs fri sat sun jan feb mar apr may jun jul aug sep sept oct " +
    "nov dec for at by on in to of and or the"
  ).split(" "),
);

type Mention = { text: string; index: number; room: Room | null };

/** Every room mention in `text` (known rooms by alias; unknown room-like codes kept as text). */
function roomMentions(text: string, index: RoomIndex): Mention[] {
  const found: Mention[] = [];
  const tokens = [...text.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)];
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    for (let n = Math.min(4, tokens.length - i); n >= 1; n--) {
      const slice = tokens.slice(i, i + n);
      // Only join tokens separated by plain spaces ("LH 5", "Seminar Hall 1").
      const start = slice[0].index;
      const last = slice[n - 1];
      const span = text.slice(start, last.index + last[0].length);
      if (n > 1 && /[^A-Za-z0-9\s-]/.test(span)) continue;
      const key = compact(span);
      const id = index.aliases.get(key);
      if (!id || index.notRooms.has(key)) continue;
      found.push({ text: span, index: start, room: roomById(index, id) });
      for (let k = i; k < i + n; k++) used.add(k);
      break;
    }
  }
  // "the auditorium" / "main auditorium" when the campus has exactly one.
  const lower = text.toLowerCase();
  for (const { re, type } of TYPE_PHRASES) {
    const room = uniqueOfType(index, type);
    if (!room) continue;
    const m = new RegExp(
      String.raw`\b(?:the|main|our)\s+(?:${re.source})\b`,
    ).exec(lower);
    if (m && !found.some((f) => f.room?.id === room.id))
      found.push({
        text: text.slice(m.index, m.index + m[0].length),
        index: m.index,
        room,
      });
  }
  // "room 204": the one room whose id or name ends in that number, else kept as text.
  for (const m of text.matchAll(ROOM_NUMBER_RE)) {
    if (found.some((f) => overlaps(f, m.index, m[0].length))) continue;
    const candidates = roomsNumbered(index, Number(m[1]));
    found.push({
      text: m[0],
      index: m.index,
      room: candidates.length === 1 ? candidates[0] : null,
    });
  }
  // Unknown room-like codes ("LHC-5", "lhc-5"): letters + digits that are not a group or room.
  // In capitals a space may separate them ("LHC 5"); in lower case only a hyphen or nothing.
  for (const m of text.matchAll(
    /(?<![\w-])([A-Za-z]{2,5})([\s-]?)(\d{1,3}[A-Za-z]?)(?![\w-])/g,
  )) {
    const [all, letters, sep] = m;
    const capitals = /^[A-Z]+$/.test(letters);
    if (!capitals && (sep === " " || NOT_CODE_WORDS.has(letters.toLowerCase())))
      continue;
    const key = compact(all);
    if (index.aliases.has(key) || index.notRooms.has(key)) continue;
    if (index.notRooms.has(compact(letters)) || /^(?:AM|PM)$/i.test(letters))
      continue;
    if (found.some((f) => overlaps(f, m.index, all.length))) continue;
    found.push({ text: all, index: m.index, room: null });
  }
  return found.sort((a, b) => a.index - b.index);
}

function overlaps(m: Mention, index: number, length: number): boolean {
  return m.index < index + length && index < m.index + m.text.length;
}

/** The first room the text names, as written (`requested_room_text`), or null. */
export function findRequestedRoomText(
  text: string,
  index: RoomIndex,
): string | null {
  return roomMentions(text, index)[0]?.text ?? null;
}

/** Resolves room text (from the text or the LLM) to an existing room, or a suggestion. */
export function resolveRoomText(
  text: string | null,
  index: RoomIndex,
): RoomResolution {
  const raw = text?.trim() ?? "";
  if (!raw) return { text: null, room: null, suggestion: null };
  const key = compact(raw);
  const direct = roomById(index, index.aliases.get(key));
  if (direct && !index.notRooms.has(key))
    return { text: raw, room: direct, suggestion: null };
  const lower = raw.toLowerCase().replace(/^(?:the|main|our)\s+/, "");
  for (const { re, type } of TYPE_PHRASES) {
    if (new RegExp(String.raw`^(?:${re.source})$`).test(lower)) {
      const room = uniqueOfType(index, type);
      if (room) return { text: raw, room, suggestion: null };
    }
  }
  const numbered = NUMBER_TEXT_RE.exec(raw);
  if (numbered) {
    const number = Number(numbered[1]);
    const candidates = roomsNumbered(index, number);
    return {
      text: raw,
      room: candidates.length === 1 ? candidates[0] : null,
      suggestion: null,
      numbered: { number, candidates },
    };
  }
  const inside = roomMentions(raw, index).find((m) => m.room);
  if (inside?.room) return { text: raw, room: inside.room, suggestion: null };
  // "a seminar hall", "any lecture hall": a room type, not a specific room.
  if (!/\d/.test(raw) && roomTypeWords(raw.toLowerCase()).length > 0)
    return { text: null, room: null, suggestion: null };
  return { text: raw, room: null, suggestion: suggest(index, key) };
}

// ------------------------------------------------------------------------------- room fit

/** Needs `room` lacks (accessibility counts as a need). */
export function lackingNeeds(room: Room, needs: readonly Need[]): Need[] {
  return needs.filter((n) =>
    n === "accessible" ? !room.accessible : !room.features.includes(n),
  );
}

function fits(
  room: Room,
  attendance: number | null,
  needs: readonly Need[],
): boolean {
  return (
    (attendance === null || room.capacity >= attendance) &&
    lackingNeeds(room, needs).length === 0
  );
}

/**
 * An event room that has everything: same type first, then the request's types, then any;
 * smallest first.
 */
export function alternativeRoom(
  named: Room,
  needs: readonly Need[],
  attendance: number | null,
  roomTypes: readonly string[],
  rooms: readonly Room[],
): Room | null {
  const groups = [
    [named.type],
    roomTypes.filter((t) => t !== named.type),
    null,
  ];
  for (const types of groups) {
    const candidates = rooms
      .filter(
        (r) =>
          r.id !== named.id &&
          hostsEvents(r) &&
          (types === null || types.includes(r.type)) &&
          fits(r, attendance, needs),
      )
      .sort((a, b) => a.capacity - b.capacity);
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}

/**
 * A note for the requested room: an unknown name ("LHC-5 doesn't exist; did you mean LH-5? It
 * has no pa_system"), or a named room that contradicts a need or the head count ("SH-2 isn't
 * wheelchair accessible. SH-1 (Seminar Hall 1) has everything you asked for."). The second
 * value is the room to offer (the suggestion or the alternative).
 */
export function roomNote(
  resolution: RoomResolution,
  needs: readonly Need[],
  attendance: number | null,
  roomTypes: readonly string[],
  rooms: readonly Room[],
): { note: string | null; suggestion: Room | null } {
  const { text, room, suggestion } = resolution;
  if (!text) return { note: null, suggestion: null };
  if (!room && resolution.numbered) {
    const { number, candidates } = resolution.numbered;
    return {
      note:
        candidates.length > 1
          ? `Several rooms end in ${number}: ${candidates.map((r) => r.id).join(", ")}. Pick one from the list.`
          : `No room numbered ${number} exists; pick a room from the list.`,
      suggestion: null,
    };
  }
  if (!room) {
    if (!suggestion)
      return {
        note: `No room called "${text}" exists; pick a room from the list.`,
        suggestion: null,
      };
    const parts = [`${text} doesn't exist; did you mean ${suggestion.id}?`];
    const lacks = lackingNeeds(suggestion, needs);
    if (lacks.length > 0) parts.push(`It has no ${needList(lacks, "or")}.`);
    if (attendance !== null && suggestion.capacity < attendance)
      parts.push(`It seats ${suggestion.capacity}.`);
    return { note: parts.join(" "), suggestion };
  }
  const problems: string[] = [];
  const lacks = lackingNeeds(room, needs);
  if (lacks.includes("accessible"))
    problems.push("isn't wheelchair accessible");
  const features = lacks.filter((n) => n !== "accessible");
  if (features.length > 0) problems.push(`has no ${needList(features, "or")}`);
  if (attendance !== null && room.capacity < attendance)
    problems.push(`seats only ${room.capacity}`);
  if (problems.length === 0) return { note: null, suggestion: null };
  const alt = alternativeRoom(room, needs, attendance, roomTypes, rooms);
  const head = `${room.id} ${problems.join(" and ")}.`;
  return {
    note: alt
      ? `${head} ${alt.id} (${alt.name}) has everything you asked for.`
      : `${head} No other room has everything you asked for.`,
    suggestion: alt,
  };
}

// ------------------------------------------------------------------------------ room types

const TYPE_WORDS: readonly { re: RegExp; types: RoomType[] }[] = [
  { re: /\bseminar[\s-]?halls?\b/, types: ["seminar_hall"] },
  { re: /\blecture[\s-]?halls?\b|\blh\b(?![\s-]?\d)/, types: ["lecture_hall"] },
  {
    re: /\bclass[\s-]?rooms?\b|\bsmall rooms?\b|\btutorial rooms?\b/,
    types: ["classroom"],
  },
  { re: /\bauditorium\b|\baudi\b/, types: ["auditorium"] },
  {
    re: /\boat\b|\bopen[\s-]?air\b|\boutdoors?\b|\bamphitheat(?:re|er)\b/,
    types: ["outdoor"],
  },
  {
    re: /\b(?:computer|computing|cs|programming|coding)\s+labs?\b|\blabs?\s+with\s+(?:computers|pcs|systems)\b/,
    types: ["lab_cs"],
  },
  {
    re: /\b(?:elec|electronics|electrical|ece|ee)\s+labs?\b/,
    types: ["lab_elec"],
  },
  { re: /\bphysics\s+labs?\b/, types: ["lab_phy"] },
  { re: /\bcivil(?:\s+engineering)?\s+labs?\b/, types: ["lab_civil"] },
  {
    re: /\b(?:central|mech(?:anical)?)\s+workshop\b|\bworkshop\s+shed\b/,
    types: ["workshop"],
  },
  {
    re: /\bany (?:big |large )?halls?\b/,
    types: ["seminar_hall", "lecture_hall"],
  },
];

/** Room types named in the text ("seminar hall", "computer lab", "OAT"). */
export function roomTypeWords(lower: string): RoomType[] {
  return uniq(
    TYPE_WORDS.filter(({ re }) => re.test(lower)).flatMap((w) => w.types),
  );
}

/** Hands-on activities that need a specialised room. */
const ACTIVITY_TYPES: readonly {
  re: RegExp;
  types: RoomType[];
  what: string;
}[] = [
  {
    re: /\b(?:bridge|truss|concrete|surveying)\b/,
    types: ["lab_civil", "workshop"],
    what: "civil-engineering activity",
  },
  {
    re: /\b(?:welding|machining|fabrication|lathe)\b/,
    types: ["workshop"],
    what: "workshop activity",
  },
];

/** Attendance tiers (backend.md §5.3): ≤ 90 classroom, ≤ 200 lecture/seminar hall, else big venues. */
const TIERS: readonly { max: number; types: RoomType[] }[] = [
  { max: 90, types: ["classroom", "lecture_hall", "seminar_hall"] },
  { max: 200, types: ["lecture_hall", "seminar_hall"] },
  { max: Number.POSITIVE_INFINITY, types: ["auditorium", "outdoor"] },
];

function asRoomTypes(types: readonly string[]): RoomType[] {
  return types.filter((t): t is RoomType => RoomType.safeParse(t).success);
}

/** A plain "lab" ("book a lab for the robotics workshop"): the lab room types. */
const LAB_WORD_RE = /\blabs?\b/;

/**
 * Room types for a request that names none: the requested room's type, then (in order) a
 * hands-on activity's rooms, the lab types when a lab is asked for, the rooms that have a
 * specialised need (computers, power benches), or the attendance tier, keeping only types with
 * an event room that fits (capacity and needs). Returns the types and a chip explaining them;
 * empty when nothing is known.
 */
export function deriveRoomTypes(
  lower: string,
  attendance: number | null,
  needs: readonly Need[],
  requested: Room | null,
  allRooms: readonly Room[],
): { types: RoomType[]; assumption: string | null } {
  const rooms = allRooms.filter(hostsEvents);
  const pre = asRoomTypes(requested ? [requested.type] : []);
  const usable = (types: readonly RoomType[]) =>
    types.filter((t) =>
      rooms.some((r) => r.type === t && fits(r, attendance, needs)),
    );
  const result = (types: RoomType[], why: string) => {
    const all = uniq([...pre, ...types]);
    return {
      types: all,
      assumption: `Room type from ${why}: ${all.join(", ")}`,
    };
  };

  for (const activity of ACTIVITY_TYPES) {
    if (!activity.re.test(lower)) continue;
    const ok = usable(activity.types);
    return result(ok.length > 0 ? ok : activity.types, `the ${activity.what}`);
  }
  if (!requested && LAB_WORD_RE.test(lower)) {
    const labs = asRoomTypes(
      uniq(rooms.filter((r) => r.type.startsWith("lab_")).map((r) => r.type)),
    );
    const ok = usable(labs);
    if (labs.length > 0)
      return result(ok.length > 0 ? ok : labs, "'lab' in the request");
  }
  if (needs.includes("computers") || needs.includes("power_benches")) {
    const typesOf = (list: readonly Room[]) =>
      asRoomTypes(uniq(list.map((r) => r.type)));
    const sized = typesOf(rooms.filter((r) => fits(r, attendance, needs)));
    const types =
      sized.length > 0
        ? sized
        : typesOf(rooms.filter((r) => fits(r, null, needs)));
    if (types.length > 0)
      return result(types, "the rooms that have what you need");
  }
  if (attendance !== null) {
    const start = TIERS.findIndex((t) => attendance <= t.max);
    for (let i = start; i < TIERS.length; i++) {
      const ok = usable(TIERS[i].types);
      if (ok.length > 0) return result(ok, sizeWhy(attendance, needs));
    }
    return result([...TIERS[start].types], sizeWhy(attendance, needs));
  }
  return pre.length > 0
    ? {
        types: pre,
        assumption: `Room type from the requested room: ${pre.join(", ")}`,
      }
    : { types: [], assumption: null };
}

function sizeWhy(attendance: number, needs: readonly Need[]): string {
  return needs.length > 0
    ? `${attendance} people and needs (${needs.join(", ")})`
    : `${attendance} people`;
}
