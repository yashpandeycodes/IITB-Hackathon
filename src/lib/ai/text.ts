/**
 * Small text helpers shared by the rule parser and the post-processing (pure, no I/O).
 */

/**
 * Basic Devanagari (Hindi) support: the words the lexicons need, written in the romanised
 * Hinglish the rule parser already reads ("मंगलवार शाम 6 बजे" → "mangalvar shaam 6 baje").
 */
const DEVANAGARI_WORDS: Record<string, string> = {
  सोमवार: "somvar",
  मंगलवार: "mangalvar",
  बुधवार: "budhvar",
  गुरुवार: "guruvar",
  बृहस्पतिवार: "guruvar",
  शुक्रवार: "shukravar",
  शनिवार: "shanivar",
  रविवार: "ravivar",
  आज: "aaj",
  कल: "kal",
  परसों: "parso",
  बजे: "baje",
  सुबह: "subah",
  दोपहर: "dopahar",
  शाम: "shaam",
  रात: "raat",
  से: "se",
  तक: "tak",
  घंटे: "ghante",
  घंटा: "ghanta",
  घंटों: "ghanton",
  लोग: "log",
  लोगों: "log",
  हॉल: "hall",
  चाहिए: "chahiye",
  माइक: "mic",
  प्रोजेक्टर: "projector",
  मंच: "manch",
};
const DEVANAGARI_RE = new RegExp(
  String.raw`(?<![ऀ-ॿ])(?:${Object.keys(DEVANAGARI_WORDS)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![ऀ-ॿ])`,
  "gu",
);

/** Devanagari digits (०–९) to ASCII and the lexicon words above romanised. */
function romaniseDevanagari(text: string): string {
  if (!/[ऀ-ॿ]/.test(text)) return text;
  return text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/।/g, ".")
    .replace(DEVANAGARI_RE, (word) => DEVANAGARI_WORDS[word] ?? word);
}

/** Unicode dashes and quotes to ASCII, Devanagari lexicon words romanised, whitespace collapsed. */
export function cleanText(text: string): string {
  return romaniseDevanagari(text)
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** `cleanText` lower-cased: the form every lexicon regex runs on. */
export function lowerText(text: string): string {
  return cleanText(text).toLowerCase();
}

/** Upper-case letters and digits only: `"LH 5"`, `"lh-5"` and `"LH5"` all become `"LH5"`. */
export function compact(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unique values in first-seen order. */
export function uniq<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

/** Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[b.length];
}

/** English number words used for durations ("one hour", "two hours"). */
export const ENGLISH_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/** Hindi number words, only trusted next to Hindi units ("do ghante", "dedh ghanta"). */
export const HINDI_NUMBERS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  dedh: 1.5,
  dhai: 2.5,
  dhaai: 2.5,
};

/** Clock time `"HH:MM"` to minutes after midnight. */
export function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Truncates to `max` characters (for schema-bounded strings). */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
