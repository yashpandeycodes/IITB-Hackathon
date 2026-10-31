/**
 * Needs lexicon (backend.md §5.3) plus the needs an event type implies ("a talk needs a
 * projector"), each implied need shown as an assumption chip the user can remove. Pure.
 */
import type { Need } from "@/lib/contracts";

import { uniq } from "./text";

const PERSON_SPEAKER =
  /(?:guest|industry|keynote|invited|expert|chief|alumni|main|two|three|four|several|eminent|distinguished)\s+speakers\b/;

/** Explicit needs ("mic", "projector", "wheelchair") in lower-cased text. */
const NEED_LEXICON: readonly { need: Need; re: RegExp }[] = [
  {
    need: "pa_system",
    re: /\b(?:mics?|mikes?|microphones?|sound(?!\s*(?:proof|good|like))(?:\s+system)?|audio|loud\s?speakers?|speaker\s+system|p\.a\.|pa\s+system|amplifiers?)\b/,
  },
  {
    need: "projector",
    re: /\b(?:projectors?|projection|(?:big |large |projector |led )?screens?|ppts?|power\s?points?|slides|slideshow)\b/,
  },
  {
    need: "computers",
    re: /\b(?:computers?(?!\s+science)|pcs?|desktops?|workstations?|(?<!(?:sound|pa|audio|speaker)\s)systems)\b/,
  },
  {
    need: "accessible",
    re: /\b(?:wheel\s?chairs?|accessib(?:le|ility)|ramps?|lifts?|elevators?|disabled|divyang|handicap(?:ped)?|differently[\s-]abled)\b/,
  },
  { need: "stage", re: /\b(?:stage|manch)\b/ },
  {
    need: "ac",
    re: /\bac\b|\ba\.c\.|\bair[\s-]?condition(?:ed|ing|er)?\b/,
  },
  {
    need: "power_benches",
    re: /\b(?:plugs?|plug points?|sockets?|power (?:benches|bench|sockets?|outlets?|supply|strips?)|charging (?:points?|ports?|stations?)|extension (?:boards?|cords?))\b/,
  },
];

/** Needs stated in the text, with chips for readings that need confirming. */
export function explicitNeeds(
  lower: string,
  original: string,
): { needs: Need[]; assumptions: string[] } {
  const needs: Need[] = [];
  const assumptions: string[] = [];
  for (const { need, re } of NEED_LEXICON) if (re.test(lower)) needs.push(need);
  // Plain "speakers" (no person qualifier) are loudspeakers; "PA" in capitals is the system.
  if (/\bspeakers\b/.test(lower) && !PERSON_SPEAKER.test(lower))
    needs.push("pa_system");
  if (/\bPA\b/.test(original)) needs.push("pa_system");
  if (/\bpower\s?points?\b/.test(lower))
    assumptions.push(
      "'power points' read as PowerPoint slides (projector); ask for plugs or sockets for power benches",
    );
  return { needs: uniq(needs), assumptions };
}

const TALK_RE =
  /\b(?:talks?|lectures?(?!\s*halls?)|seminars?(?!\s*halls?)|webinars?|keynotes?|presentations?|speaker|orientation|pre-placement|panel discussion|symposium|conference)\b/;
const CEREMONY_RE =
  /\b(?:ceremon(?:y|ies)|inaugurations?|inaugural|convocation)\b/;
const MUSIC_RE =
  /\b(?:concerts?|jam|gigs?|band|dj|music(?:al)?|pro[\s-]?ni(?:gh)?te)\b/;
const PERFORMANCE_RE =
  /\b(?:performances?|plays?|dramas?|recitals?|stand[\s-]?up|comedy|fashion show|dance show|cultural (?:night|show|programme|program))\b/;

/** Attendance at which a PA system is assumed. */
export const PA_CROWD = 200;

/** How a need reads in chips and room notes (the one label map of the AI layer). */
export const NEED_LABELS: Readonly<Record<Need, string>> = {
  pa_system: "PA system",
  projector: "projector",
  stage: "stage",
  computers: "computers",
  accessible: "wheelchair access",
  ac: "AC",
  power_benches: "power benches",
};

/** "projector, stage and PA system" (or "… or …") from the shared labels. */
export function needList(needs: readonly Need[], joiner: "and" | "or"): string {
  const labels = needs.map((n) => NEED_LABELS[n]);
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} ${joiner} ${labels[labels.length - 1]}`
    : (labels[0] ?? "");
}

/**
 * Needs the event implies but the text may not spell out: a talk → projector; a ceremony →
 * stage, PA and projector; music or a performance → stage (and PA for music); ≥ 200 people →
 * PA. Only needs not already present are added, each with a chip.
 */
export function impliedNeeds(
  lower: string,
  attendance: number | null,
  present: readonly Need[],
): { needs: Need[]; assumptions: string[] } {
  const have = new Set(present);
  const added: Need[] = [];
  const assumptions: string[] = [];
  const add = (needs: Need[], why: string) => {
    const fresh = needs.filter((n) => !have.has(n));
    if (fresh.length === 0) return;
    for (const n of fresh) have.add(n);
    added.push(...fresh);
    assumptions.push(`Assumed ${needList(fresh, "and")} for ${why}`);
  };
  if (CEREMONY_RE.test(lower))
    add(["stage", "pa_system", "projector"], "the ceremony");
  if (MUSIC_RE.test(lower)) add(["stage", "pa_system"], "the music event");
  if (PERFORMANCE_RE.test(lower)) add(["stage"], "the performance");
  if (TALK_RE.test(lower)) add(["projector"], "the talk");
  if (attendance !== null && attendance >= PA_CROWD)
    add(["pa_system"], `${attendance} people`);
  return { needs: added, assumptions };
}
