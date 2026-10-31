/**
 * Student groups: "ECE-3", "CSE third years", "Mechanical third years", "third year civil
 * students" → group ids that exist in `ctx.groups`; "compulsory/mandatory/zaroori" makes them
 * `mandatory_for_groups`. Pure.
 */
import type { ParseContext } from "./types";
import { compact, escapeRegex, uniq } from "./text";

type Group = ParseContext["groups"][number];

/** Department aliases: case-insensitive words, and short codes matched only in capitals. */
const DEPT_ALIASES: Record<string, { words: string[]; codes: string[] }> = {
  CSE: {
    words: ["cse", "computer science", "comp sci", "computer engineering"],
    codes: ["CS"],
  },
  ECE: {
    words: [
      "ece",
      "electronics and communication",
      "electronics",
      "entc",
      "extc",
    ],
    codes: [],
  },
  EE: { words: ["eee", "electrical"], codes: ["EE"] },
  ME: { words: ["mech", "mechanical"], codes: ["ME"] },
  CE: { words: ["civil"], codes: ["CE"] },
};

const YEAR_WORDS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  final: 4,
};

const YEAR_RE =
  /\b(first|1st|second|2nd|third|3rd|fourth|4th|final)[\s-]*(?:year|yr)s?\b|\b(?:year|yr)[\s-]*([1-4])\b|\b(freshers?|freshmen)\b/gi;

const MANDATORY_RE =
  /\b(?:compulsory|mandatory|zaroori|zaruri|jaruri|obligatory|must attend|attendance (?:is )?required)\b/i;

/** "compulsory", "mandatory", "zaroori", … */
export function isMandatory(text: string): boolean {
  return MANDATORY_RE.test(text);
}

type Hit = { key: string; index: number; end: number };

function departmentHits(text: string, ctx: ParseContext): Hit[] {
  const departments = uniq(ctx.groups.map((g) => g.department.toUpperCase()));
  const hits: Hit[] = [];
  for (const dept of departments) {
    if (dept === "COMMON") continue;
    const alias = DEPT_ALIASES[dept] ?? { words: [], codes: [] };
    const words = [...alias.words];
    const codes = [...alias.codes];
    (dept.length >= 3 ? words : codes).push(
      dept.length >= 3 ? dept.toLowerCase() : dept,
    );
    const patterns: RegExp[] = [];
    if (words.length > 0)
      patterns.push(
        new RegExp(
          String.raw`\b(?:${words.map(escapeRegex).join("|")})\b`,
          "gi",
        ),
      );
    if (codes.length > 0)
      patterns.push(
        new RegExp(
          String.raw`\b(?:${codes.map(escapeRegex).join("|")})\b`,
          "g",
        ),
      );
    for (const re of patterns)
      for (const m of text.matchAll(re))
        hits.push({ key: dept, index: m.index, end: m.index + m[0].length });
  }
  return hits.sort((a, b) => a.index - b.index);
}

function groupsFor(
  ctx: ParseContext,
  dept: string | null,
  year: number,
): Group[] {
  if (dept) {
    const exact = ctx.groups.filter(
      (g) => g.department.toUpperCase() === dept && g.year === year,
    );
    if (exact.length > 0) return exact;
  }
  // First years are common sections: "first years" → every year-1 group.
  if (year === 1) return ctx.groups.filter((g) => g.year === 1);
  return [];
}

/** Group ids mentioned in `text` (ids, names, or department + year phrases), in order. */
export function findGroupMentions(text: string, ctx: ParseContext): string[] {
  const found: { id: string; index: number }[] = [];

  for (const g of ctx.groups) {
    const prefix = /^[A-Za-z]+/.exec(g.id)?.[0] ?? "";
    const idSource = g.id
      .split("-")
      .map(escapeRegex)
      .join(String.raw`[\s-]?`);
    const idRe = new RegExp(
      String.raw`(?<![\w-])${idSource}(?![\w-])`,
      prefix.length >= 3 ? "gi" : "g",
    );
    for (const m of text.matchAll(idRe))
      found.push({ id: g.id, index: m.index });
    const nameRe = new RegExp(
      String.raw`\b${escapeRegex(g.name).replace(/\s+/g, String.raw`\s+`)}\b`,
      "gi",
    );
    for (const m of text.matchAll(nameRe))
      found.push({ id: g.id, index: m.index });
  }

  const depts = departmentHits(text, ctx);
  const distinct = uniq(depts.map((d) => d.key));
  for (const m of text.matchAll(YEAR_RE)) {
    const year = m[1]
      ? YEAR_WORDS[m[1].toLowerCase()]
      : m[2]
        ? Number(m[2])
        : 1;
    const start = m.index;
    const end = m.index + m[0].length;
    const before = depts.find(
      (d) =>
        d.end <= start &&
        /^[\s-]*(?:students?\s+(?:of\s+)?(?:the\s+)?)?$/i.test(
          text.slice(d.end, start),
        ),
    );
    const after = depts.find(
      (d) =>
        d.index >= end &&
        /^\s*(?:students?\s+)?(?:of\s+|from\s+|in\s+)?(?:the\s+)?$/i.test(
          text.slice(end, d.index),
        ),
    );
    const dept =
      before?.key ?? after?.key ?? (distinct.length === 1 ? distinct[0] : null);
    for (const g of groupsFor(ctx, dept, year))
      found.push({ id: g.id, index: start });
  }

  found.sort((a, b) => a.index - b.index);
  return uniq(found.map((f) => f.id));
}

/** A group reference from the LLM ("ECE-3", "mechanical third years") → existing ids. */
export function resolveGroupRef(ref: string, ctx: ParseContext): string[] {
  const key = compact(ref);
  const exact = ctx.groups.find((g) => compact(g.id) === key);
  if (exact) return [exact.id];
  return findGroupMentions(ref, ctx);
}

/** Total size of `ids`, or null when any size is unknown. */
export function groupsSize(
  ids: readonly string[],
  ctx: ParseContext,
): number | null {
  if (ids.length === 0) return null;
  let total = 0;
  for (const id of ids) {
    const size = ctx.groups.find((g) => g.id === id)?.size;
    if (typeof size !== "number" || size <= 0) return null;
    total += size;
  }
  return total;
}
