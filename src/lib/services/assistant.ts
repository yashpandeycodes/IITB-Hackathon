/**
 * The faculty AI assistant (`POST /api/assistant`, architecture §7.4). One turn:
 *
 * 1. The AI layer extracts an intent (Gemini structured output, or the offline rule parser).
 * 2. Code resolves it against the user's own scope (`sessionsInScope`): ids and names from the
 *    message are hints, and a session, course or faculty member outside the scope is never acted
 *    on. Ambiguity returns candidates and a question, never a guess.
 * 3. The constraint engine finds candidate placements (`suggestMoves`) or the conflicts that
 *    rule the request out. Each option is then built by the same `computeProposal` that
 *    `POST /api/changes` runs (`change-proposal.ts`): its moves, counts, soft delta and diff are
 *    what filing it would store, and an option that filing would refuse or find infeasible is
 *    never offered. `POST /api/changes` still recomputes it from scratch before anything is
 *    stored, and nothing changes until an admin approves it.
 * 4. The reply is a template built from those facts, phrased by the model when AI is on (checked
 *    against the facts; over the explanation quota the template is shown).
 *
 * Every turn writes one `ai_logs` entry (`feature: "assistant"`); a model-phrased reply writes a
 * second one for that call. With AI off everything works on the rule parser and templates.
 */
import "server-only";
import type { Db } from "mongodb";
import {
  ASSISTANT_INTENT_PROMPT_ID,
  ASSISTANT_REPLY_PROMPT_ID,
  EXPLAIN_SCHEDULE_PROMPT_ID,
  extractAssistantIntentWithRules,
  extractIntent,
  phraseAssistantReply,
  phraseScheduleExplanation,
  type AssistantContext,
  type AssistantReplyFacts,
  type Explanation,
  type IntentOutcome,
  type IntentSignals,
  type LlmConfig,
} from "@/lib/ai";
import {
  AssistantReplySchema,
  PathIssueSchema,
  type AssistantIntentKind,
  type AssistantIntentLLM,
  type AssistantOption,
  type AssistantReply,
  type AssistantRequest,
  type Assignment,
  type ChangeProposal,
  type ChangeProposalRequest,
  type ConflictEntry,
  type Dataset,
  type Day,
  type DisruptionChange,
  type Faculty,
  type MoveDiff,
  type Session,
  type SessionFacts,
  type SessionKind,
  type SessionRef,
  type SessionUser,
} from "@/lib/contracts";
import { limits } from "@/lib/auth/rate-limit";
import { appendAiLog } from "@/lib/db/repos/ai-logs";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import {
  deriveExtraSession,
  explainSession,
  plural,
  suggestMoves,
  type MoveOption,
  type MoveTarget,
} from "@/lib/engine";
import { forbidden, isApiError, type ApiError } from "@/lib/errors";
import { computeProposal, type ProposalContext } from "./change-proposal";
import { changeScopeIssues, sessionsInScope } from "./change-scope";
import { getActiveDataset } from "./dataset";
import { getLlmConfig } from "./llm";
import { getSettings } from "./settings";

/** Injection points for tests and scripts. */
export type AssistantDeps = {
  /** Intent extraction; `null` = AI off. Default: {@link getLlmConfig}(db, "fast"). */
  llm?: LlmConfig;
  /** Reply phrasing; `null` = templates only. Default: {@link getLlmConfig}(db, "smart"). */
  replyLlm?: LlmConfig;
};

/** Options shown per turn (the engine's best first). */
export const OPTION_LIMIT = 3;
/** Candidates listed when the session is ambiguous. */
export const CANDIDATE_LIMIT = 12;
/** Sessions of the asker given to the model as context. */
const CONTEXT_SESSION_LIMIT = 40;

const APPROVAL_NOTE =
  "I can't approve, apply or force a change, and I can't skip the timetable rules: every option is checked by the scheduling engine, and an admin approves each change after reviewing it.";
const SUBMIT_NOTE =
  "Submit an option to send it to an admin for approval; nothing changes until then.";
const CAPABILITIES =
  'I can move one of your sessions, mark when you are unavailable, add an extra session of a course you teach, or explain why a session is where it is. For example: "Move my Friday CS202 lecture to Thursday morning" or "Why is CS202 at 8 AM?".';
const BOOKING_NOTE =
  "For rooms and events, use the booking request form (it reads plain-language requests too).";

// ------------------------------------------------------------------------------- context

/**
 * What the intent extraction may know: the calendar, every course, faculty member and room, and
 * the asker's own sessions with where they are now (bounded). Pure.
 */
export function buildAssistantContext(
  dataset: Dataset,
  user: SessionUser,
  assignments: readonly Assignment[],
  referenceDate: string,
): AssistantContext {
  const at = new Map(assignments.map((a) => [a.session_id, a]));
  const own = sessionsInScope(user, dataset);
  const { calendar } = dataset;
  return {
    datasetId: dataset.dataset_id,
    calendar: {
      days: calendar.days,
      periods: calendar.periods.map(({ id, start, end, teaching }) => ({
        id,
        start,
        end,
        teaching,
      })),
      lunch: {
        after_period: calendar.lunch.after_period,
        start: calendar.lunch.start,
        end: calendar.lunch.end,
      },
    },
    referenceDate,
    role: user.role,
    selfFacultyId: user.role === "faculty" ? user.faculty_id : null,
    courses: dataset.courses.map((c) => ({
      id: c.id,
      title: c.title,
      department: c.department,
    })),
    faculty: dataset.faculty.map((f) => ({
      id: f.id,
      name: f.name,
      department: f.department,
    })),
    rooms: dataset.rooms.map((r) => ({ id: r.id, name: r.name })),
    sessions: own.slice(0, CONTEXT_SESSION_LIMIT).map((s) => {
      const a = at.get(s.id);
      return {
        id: s.id,
        course_id: s.course_id,
        kind: s.kind,
        day: a?.day ?? null,
        start_period: a?.start_period ?? null,
        room_id: a?.room_id ?? null,
      };
    }),
    sessionsOmitted: Math.max(0, own.length - CONTEXT_SESSION_LIMIT),
  };
}

// ---------------------------------------------------------------------------- turn state

type Env = {
  user: SessionUser;
  dataset: Dataset;
  message: string;
  /** The active timetable's assignments (what options move from). */
  baseline: readonly Assignment[];
  /** What each option's proposal is built on, as `POST /api/changes` builds it. */
  proposal: ProposalContext;
  at: Map<string, Assignment>;
  scope: Session[];
  scopeIds: Set<string>;
  byId: Map<string, Session>;
  signals: IntentSignals;
  teaching: number[];
};

/** A reply before phrasing. */
type Draft = {
  intent: AssistantIntentKind;
  text: string;
  verified: boolean;
  session: SessionRef | null;
  candidates: SessionRef[];
  options: AssistantOption[];
  conflicts: ConflictEntry[];
  follow_up: string | null;
  assumptions: string[];
  /** Sentences shown before the (possibly phrased) text, e.g. "There's no session CS202-L9." */
  prefix: string[];
  facts: SessionFacts | null;
  /** `engine_verdict` in `ai_logs`. */
  verdict: string;
  /** Which phrasing the model may do: the reply, a session explanation, or none. */
  phrase: "reply" | "explain" | null;
};

function draft(
  intent: AssistantIntentKind,
  text: string,
  extra: Partial<Draft> = {},
): Draft {
  return {
    intent,
    text,
    verified: false,
    session: null,
    candidates: [],
    options: [],
    conflicts: [],
    follow_up: null,
    assumptions: [],
    prefix: [],
    facts: null,
    verdict: "follow_up",
    phrase: null,
    ...extra,
  };
}

function refOf(env: Env, s: Session): SessionRef {
  const a = env.at.get(s.id);
  return {
    session_id: s.id,
    course_id: s.course_id,
    kind: s.kind,
    day: a?.day ?? null,
    start_period: a?.start_period ?? null,
    room_id: a?.room_id ?? null,
  };
}

/** "THU P2 in LH-3", "not placed". */
function slotText(env: Env, s: Session): string {
  const a = env.at.get(s.id);
  if (!a) return "not placed";
  const end = a.start_period + s.duration - 1;
  const periods =
    s.duration > 1 ? `P${a.start_period}–P${end}` : `P${a.start_period}`;
  return `${a.day} ${periods} in ${a.room_id}`;
}

function periodsText(periods: readonly number[]): string {
  if (periods.length === 0) return "";
  const sorted = [...periods].sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  if (sorted.length === 1) return `P${sorted[0]}`;
  return contiguous
    ? `P${sorted[0]}–P${sorted[sorted.length - 1]}`
    : sorted.map((p) => `P${p}`).join(", ");
}

/** "THU P1–P5", "any time on THU or FRI", "P6–P9 on any day", "any slot", + " in LH-3". */
function windowText(target: MoveTarget): string {
  const days = target.days ?? [];
  const periods = target.periods ?? [];
  const dayText = days.length > 0 ? days.join(" or ") : "";
  let text: string;
  if (days.length > 0 && periods.length > 0)
    text = `${dayText} ${periodsText(periods)}`;
  else if (days.length > 0) text = `any time on ${dayText}`;
  else if (periods.length > 0) text = `${periodsText(periods)} on any day`;
  else text = "any slot";
  return target.room_id ? `${text} in ${target.room_id}` : text;
}

function outOfScopeText(user: SessionUser): string {
  if (user.role === "department_coordinator")
    return user.department
      ? `You can only change ${user.department} sessions.`
      : "Your account isn't linked to a department, so there are no sessions you can change.";
  if (user.role === "faculty")
    return user.faculty_id
      ? "You can only change your own sessions."
      : "Your account isn't linked to a faculty member, so there are no sessions you can change.";
  return "That session is outside what you may change.";
}

// --------------------------------------------------------------------------- resolution

type FacultyMatch =
  | { ok: true; faculty: Faculty }
  | { ok: false; reason: "unknown" | "ambiguous"; matches: Faculty[] };

function plainName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:dr|prof|professor|mr|mrs|ms)\.?\s+/gi, " ")
    .replace(/[^a-z\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The faculty member `hint` names ("F07", "f7", "Dr. Pooja Das", "das"), resolved in code. */
export function resolveFaculty(
  dataset: Pick<Dataset, "faculty">,
  hint: string,
): FacultyMatch {
  const text = hint.trim();
  const idMatch = /^f-?0*(\d{1,3})$/i.exec(text);
  if (idMatch) {
    const n = Number(idMatch[1]);
    const hit = dataset.faculty.find(
      (f) =>
        f.id.toUpperCase() === text.toUpperCase() ||
        (/^F\d+$/i.test(f.id) && Number(f.id.slice(1)) === n),
    );
    return hit
      ? { ok: true, faculty: hit }
      : { ok: false, reason: "unknown", matches: [] };
  }
  const exact = dataset.faculty.find(
    (f) => f.id.toUpperCase() === text.toUpperCase(),
  );
  if (exact) return { ok: true, faculty: exact };
  const wanted = plainName(text)
    .split(" ")
    .filter((w) => w.length >= 2 && !/^(?:sir|madam|maam|ji)$/.test(w));
  if (wanted.length === 0) return { ok: false, reason: "unknown", matches: [] };
  const matches = dataset.faculty.filter((f) => {
    const words = plainName(f.name).split(" ");
    return wanted.every((w) => words.includes(w));
  });
  if (matches.length === 1) return { ok: true, faculty: matches[0] };
  return {
    ok: false,
    reason: matches.length > 1 ? "ambiguous" : "unknown",
    matches,
  };
}

type Resolution =
  | { ok: true; session: Session; notes: string[] }
  | {
      ok: false;
      reason: "refused" | "unknown" | "ambiguous" | "mismatch";
      text: string;
      candidates: Session[];
      question: string | null;
    };

type SessionHint = AssistantIntentLLM["session"];

/**
 * The one session the user means, from `pick` (a candidate they chose) or the hints, among the
 * sessions they may act on (`purpose: "move"`) or, for an explanation, any session (their own
 * first). Never acts on a session outside the scope.
 */
function resolveSession(
  env: Env,
  hint: SessionHint,
  facultyHint: string | null,
  pick: string | undefined,
  purpose: "move" | "explain",
): Resolution {
  const { user, dataset } = env;
  const fail = (
    reason: Exclude<Resolution, { ok: true }>["reason"],
    text: string,
    candidates: Session[] = [],
    question: string | null = null,
  ): Resolution => ({ ok: false, reason, text, candidates, question });
  const allowed = (s: Session) =>
    purpose === "explain" || env.scopeIds.has(s.id);

  if (pick) {
    const s = env.byId.get(pick);
    if (!s)
      return fail("unknown", `There's no session ${pick} in the timetable.`);
    if (!allowed(s)) return fail("refused", outOfScopeText(user));
    return { ok: true, session: s, notes: [] };
  }

  if (purpose === "move" && env.scope.length === 0)
    return fail("refused", outOfScopeText(user));

  // A named faculty member: theirs only, and only if the user may act for them.
  let facultyId: string | null = null;
  if (facultyHint) {
    const found = resolveFaculty(dataset, facultyHint);
    if (!found.ok)
      return found.reason === "ambiguous"
        ? fail(
            "ambiguous",
            `More than one faculty member matches "${facultyHint}".`,
            [],
            `Which one do you mean: ${found.matches.map((f) => `${f.id} (${f.name})`).join(", ")}?`,
          )
        : fail(
            "unknown",
            `There's no faculty member "${facultyHint}" in the dataset.`,
          );
    facultyId = found.faculty.id;
    if (
      purpose === "move" &&
      !env.scope.some((s) => s.faculty_id === facultyId)
    )
      return fail("refused", outOfScopeText(user));
  }

  const notes: string[] = [];
  let courseId = hint.course_id;
  if (hint.session_id) {
    const s = env.byId.get(hint.session_id);
    if (s) {
      if (!allowed(s)) return fail("refused", outOfScopeText(user));
      return { ok: true, session: s, notes };
    }
    notes.push(`There's no session ${hint.session_id}.`);
    courseId ??= /^[A-Z]+\d+/.exec(hint.session_id)?.[0] ?? null;
  }

  let pool = purpose === "move" ? env.scope : dataset.sessions;
  if (courseId) {
    const course = dataset.courses.find((c) => c.id === courseId);
    if (!course)
      return fail(
        "unknown",
        [...notes, `There's no course ${courseId} in the dataset.`].join(" "),
      );
    const inScope = env.scope.filter((s) => s.course_id === courseId);
    if (purpose === "move" && inScope.length === 0)
      return fail(
        "refused",
        `${courseId} isn't one of the courses you may change. ${outOfScopeText(user)}`,
      );
    pool = (inScope.length > 0 ? inScope : dataset.sessions).filter(
      (s) => s.course_id === courseId,
    );
  } else if (purpose === "explain") {
    pool = env.scope.length > 0 ? env.scope : dataset.sessions;
  }
  if (facultyId) pool = pool.filter((s) => s.faculty_id === facultyId);
  if (hint.kind) {
    const kinded = pool.filter((s) => s.kind === hint.kind);
    if (kinded.length === 0 && pool.length > 0)
      return fail(
        "mismatch",
        `${courseId ? `${courseId} has` : "You have"} no ${hint.kind} session${courseId ? "" : " here"}.`,
        pool.slice(0, CANDIDATE_LIMIT),
        "Which session do you mean?",
      );
    pool = kinded;
  }
  const beforeSlot = pool;
  if (hint.day) pool = pool.filter((s) => env.at.get(s.id)?.day === hint.day);
  if (hint.start_period) {
    const p = hint.start_period;
    const starting = pool.filter((s) => env.at.get(s.id)?.start_period === p);
    pool =
      starting.length > 0
        ? starting
        : pool.filter((s) => {
            const a = env.at.get(s.id);
            return (
              a !== undefined &&
              a.start_period <= p &&
              p < a.start_period + s.duration
            );
          });
  }
  if (pool.length === 0 && beforeSlot.length > 0) {
    const where = [hint.day, hint.start_period ? `P${hint.start_period}` : null]
      .filter(Boolean)
      .join(" ");
    return fail(
      "mismatch",
      `None of ${purpose === "move" ? "your " : "the "}matching sessions is at ${where}.`,
      beforeSlot.slice(0, CANDIDATE_LIMIT),
      "Which session do you mean?",
    );
  }
  if (pool.length === 0)
    return fail(
      "unknown",
      [
        ...notes,
        purpose === "move"
          ? "I couldn't find that session among yours."
          : "I couldn't find that session.",
      ].join(" "),
    );
  if (pool.length === 1) return { ok: true, session: pool[0], notes };

  const question =
    env.signals.allSessions && purpose === "move"
      ? "I can move one session at a time. Which one first?"
      : "Which session do you mean?";
  return fail(
    "ambiguous",
    [...notes, `${plural(pool.length, "session")} match.`].join(" "),
    pool.slice(0, CANDIDATE_LIMIT),
    question,
  );
}

function failureDraft(
  env: Env,
  intent: AssistantIntentKind,
  res: Exclude<Resolution, { ok: true }>,
): Draft {
  const candidates = res.candidates.map((s) => refOf(env, s));
  const listed =
    candidates.length > 0
      ? ` ${candidates.map((c) => `${c.session_id} (${c.day && c.start_period ? `${c.day} P${c.start_period}` : "not placed"})`).join(", ")}.`
      : "";
  return draft(
    intent,
    `${res.text}${res.question ? ` ${res.question}` : ""}${listed}`,
    {
      candidates,
      follow_up: res.question,
      verdict:
        res.reason === "refused"
          ? "refused"
          : res.question
            ? "follow_up"
            : "no_session",
    },
  );
}

// ------------------------------------------------------------------------------ options

const MOVES = new Set(["room_only", "time_only", "time_and_room"]);

/** Sessions other than `sessionId` that move in `diff`. */
function othersMoving(diff: readonly MoveDiff[], sessionId: string): number {
  return diff.filter((d) => d.session_id !== sessionId && MOVES.has(d.move))
    .length;
}

function othersText(n: number): string {
  if (n === 0) return "no other class moves";
  return `${plural(n, "other session")} ${n === 1 ? "moves" : "move"}`;
}

function placementText(p: Assignment, duration: number): string {
  const periods =
    duration > 1
      ? `P${p.start_period}–P${p.start_period + duration - 1}`
      : `P${p.start_period}`;
  return `${p.day} ${periods} in ${p.room_id}`;
}

/**
 * `request` built exactly as `POST /api/changes` would build it (`computeProposal`: the same
 * checks, scope, rescheduler run and self-check), so what an option shows is what filing it
 * stores. A `400` or `403` from the builder (filing it would be refused) is returned as the
 * error, for the caller to drop the option or explain; an engine fault is thrown.
 */
function buildProposal(
  env: Env,
  request: ChangeProposalRequest,
): { ok: true; proposal: ChangeProposal } | { ok: false; error: ApiError } {
  try {
    return {
      ok: true,
      proposal: computeProposal(env.user, env.proposal, request).proposal,
    };
  } catch (err) {
    if (isApiError(err) && err.status < 500) return { ok: false, error: err };
    throw err;
  }
}

/** A refused proposal's problems in words: its `PathIssue` messages, else its own message. */
function refusalText(error: ApiError): string {
  const issues = PathIssueSchema.array().safeParse(error.details);
  return issues.success && issues.data.length > 0
    ? issues.data.map((i) => i.message).join(" ")
    : error.message;
}

/**
 * The option for the engine's candidate `option`, with the numbers its proposal is built with;
 * null when filing it would be refused (outside the user's scope, unknown ids) or would come
 * back infeasible.
 */
function toOption(
  env: Env,
  option: MoveOption,
  session: Pick<Session, "id" | "duration">,
  request: ChangeProposalRequest,
  verb: "Move" | "Add",
): AssistantOption | null {
  const built = buildProposal(env, request);
  if (!built.ok || !built.proposal.feasible) return null;
  const { proposal } = built;
  const others = othersMoving(proposal.diff, session.id);
  const where = placementText(option.placement, session.duration);
  return {
    option_id: "",
    label:
      verb === "Move"
        ? `Move ${session.id} to ${where} (${othersText(others)})`
        : `Add ${session.id} on ${where} (${othersText(others)})`,
    proposal: request,
    moved_count: proposal.moved_count,
    time_changed: proposal.time_changed,
    room_only_changed: proposal.room_only_changed,
    soft_delta: proposal.soft_delta,
    diff: proposal.diff,
  };
}

function conflictText(conflicts: readonly ConflictEntry[]): string {
  const first = conflicts[0];
  if (!first) return "the engine found no valid slot.";
  const parts = [first.summary.trim()];
  if (first.contradictions.length > 0)
    parts.push(
      `It conflicts directly: ${first.contradictions.slice(0, 2).join("; ")}.`,
    );
  return parts.filter(Boolean).join(" ");
}

/**
 * The target window with what the signals add: "same day" / "another day", and a start time
 * stretched to the session's whole block ("P6" for a 3-period lab is P6–P8).
 */
function effectiveTarget(
  env: Env,
  intent: AssistantIntentLLM,
  session: Pick<Session, "id" | "duration">,
  assumptions: string[],
): MoveTarget {
  const current = env.at.get(session.id);
  let days: Day[] = [...intent.target.days];
  if (env.signals.sameDay && current && days.length === 0) {
    days = [current.day];
    assumptions.push(`'same day' read as ${current.day}`);
  } else if (env.signals.otherDay && current && days.length === 0) {
    days = env.dataset.calendar.days.filter((d) => d !== current.day);
    assumptions.push(`'another day' read as any day but ${current.day}`);
  }
  let periods = [...intent.target.periods];
  if (periods.length === 1 && session.duration > 1) {
    const start = periods[0];
    const block = Array.from({ length: session.duration }, (_, i) => start + i);
    const lunchAfter = env.dataset.calendar.lunch.after_period;
    const crossesLunch =
      start <= lunchAfter && block[block.length - 1] > lunchAfter;
    if (block.every((p) => env.teaching.includes(p)) && !crossesLunch) {
      periods = block;
      assumptions.push(
        `P${start} read as the start: ${session.id} runs ${periodsText(block)}`,
      );
    }
  }
  return { days, periods, room_id: intent.target.room_id };
}

type Search = {
  options: AssistantOption[];
  conflicts: ConflictEntry[];
  /** What else was tried after the requested window had no option ("" when nothing). */
  widened: string;
};

/**
 * Engine options for `session` in `target`; when none, the user's fallback window
 * ("otherwise …"), else any slot in the week, so the reply can still offer an alternative.
 */
function searchOptions(
  env: Env,
  session: Pick<Session, "id" | "duration">,
  target: MoveTarget,
  changes: DisruptionChange[],
  makeProposal: (placement: Assignment) => ChangeProposalRequest,
  verb: "Move" | "Add",
): Search {
  const run = (t: MoveTarget) =>
    suggestMoves({
      dataset: env.dataset,
      baseline: env.baseline,
      session_id: session.id,
      ...(changes.length > 0 && { changes }),
      target: t,
      limit: OPTION_LIMIT,
    });
  // Best first by the built numbers (a stable sort, so the engine's order breaks ties).
  const wrap = (opts: readonly MoveOption[]) =>
    opts
      .map((o) => toOption(env, o, session, makeProposal(o.placement), verb))
      .filter((o): o is AssistantOption => o !== null)
      .sort(
        (a, b) =>
          a.moved_count - b.moved_count ||
          a.time_changed - b.time_changed ||
          a.soft_delta - b.soft_delta,
      )
      .map((o, i) => ({ ...o, option_id: `opt-${i + 1}` }));

  const first = run(target);
  let options = wrap(first.options);
  if (options.length > 0) return { options, conflicts: [], widened: "" };

  const restricted =
    (target.days?.length ?? 0) > 0 ||
    (target.periods?.length ?? 0) > 0 ||
    Boolean(target.room_id);
  const fallback = env.signals.fallback;
  if (fallback) {
    const second: MoveTarget = {
      days: fallback.days,
      periods: fallback.periods,
      room_id: null,
    };
    options = wrap(run(second).options);
    if (options.length > 0)
      return {
        options,
        conflicts: first.conflicts,
        widened: `your fallback, ${windowText(second)}`,
      };
  } else if (restricted) {
    options = wrap(run({}).options);
    if (options.length > 0)
      return {
        options,
        conflicts: first.conflicts,
        widened: "the rest of the week",
      };
  }
  return { options: [], conflicts: first.conflicts, widened: "" };
}

function engineFailure(intent: AssistantIntentKind, err: unknown): Draft {
  console.error(
    "[assistant] the engine failed:",
    err instanceof Error ? err.message : err,
  );
  return draft(
    intent,
    "The timetable engine couldn't check this request just now. Please try again in a moment.",
    { verdict: "engine_error" },
  );
}

/** A target window that can't hold classes: evening, before 08:00, or a weekend. */
function windowProblem(
  env: Env,
  intent: AssistantIntentKind,
  subject: string,
): Draft | null {
  const { outsideHours, weekend } = env.signals;
  const teaching = periodsText(env.teaching);
  const first = env.dataset.calendar.periods.find(
    (p) => p.id === env.teaching[0],
  );
  const last = env.dataset.calendar.periods.find(
    (p) => p.id === env.teaching[env.teaching.length - 1],
  );
  const hours = first && last ? ` (${first.start}–${last.end})` : "";
  if (outsideHours)
    return draft(
      intent,
      `Classes run only in ${teaching}${hours}, so ${subject} can't go to "${outsideHours}": there are no teaching periods then.`,
      {
        follow_up: `Would a time between ${first?.start ?? "the first"} and ${last?.end ?? "the last period"} work?`,
        verdict: "outside_hours",
      },
    );
  if (weekend && intent !== "mark_unavailable")
    return draft(
      intent,
      `There are no classes on Saturday or Sunday; teaching days are ${env.dataset.calendar.days.join(", ")}.`,
      { follow_up: "Which weekday would work?", verdict: "follow_up" },
    );
  return null;
}

// ------------------------------------------------------------------------------ intents

function handleMove(
  env: Env,
  outcome: IntentOutcome,
  pick: string | undefined,
): Draft {
  let intent = outcome.intent;
  const assumptions: string[] = [];
  let res = resolveSession(
    env,
    intent.session,
    intent.faculty_hint,
    pick,
    "move",
  );
  const targetEmpty =
    intent.target.days.length === 0 &&
    intent.target.periods.length === 0 &&
    !intent.target.room_id;
  if (
    !res.ok &&
    res.reason === "mismatch" &&
    targetEmpty &&
    (intent.session.day || intent.session.start_period)
  ) {
    // "Move my CS202 lecture on Thursday" where no CS202 lecture is on Thursday: Thursday is
    // where it should go.
    const retry = resolveSession(
      env,
      { ...intent.session, day: null, start_period: null },
      intent.faculty_hint,
      pick,
      "move",
    );
    if (retry.ok) {
      const where = [
        intent.session.day,
        intent.session.start_period ? `P${intent.session.start_period}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      assumptions.push(`Read '${where}' as where you want it to go`);
      intent = {
        ...intent,
        target: {
          days: intent.session.day ? [intent.session.day] : [],
          periods: intent.session.start_period
            ? [intent.session.start_period]
            : [],
          room_id: null,
        },
      };
      res = retry;
    }
  }
  if (!res.ok) return failureDraft(env, "move_session", res);

  const session = res.session;
  const ref = refOf(env, session);
  const blocked = windowProblem(env, "move_session", session.id);
  if (blocked) return { ...blocked, session: ref, prefix: res.notes };

  const current = env.at.get(session.id);
  const shift = env.signals.shift;
  if (
    shift !== null &&
    current &&
    intent.target.days.length === 0 &&
    intent.target.periods.length === 0
  ) {
    // "two hours later": the same day, that many periods on from where it starts now.
    const start = current.start_period + shift;
    const block = Array.from({ length: session.duration }, (_, i) => start + i);
    const lunchAfter = env.dataset.calendar.lunch.after_period;
    const crossesLunch =
      block[0] <= lunchAfter && block[block.length - 1] > lunchAfter;
    const moved = `${Math.abs(shift)} ${Math.abs(shift) === 1 ? "period" : "periods"} ${shift > 0 ? "later" : "earlier"}`;
    if (!block.every((p) => env.teaching.includes(p)) || crossesLunch)
      return draft(
        "move_session",
        `${session.id} is at ${slotText(env, session)}; ${moved} would leave the teaching periods (${periodsText(env.teaching)}) or run into lunch.`,
        {
          session: ref,
          prefix: res.notes,
          follow_up: "Which day or time would work instead?",
          verdict: "outside_hours",
        },
      );
    assumptions.push(`Read as ${moved}: ${current.day} ${periodsText(block)}`);
    intent = {
      ...intent,
      target: {
        days: [current.day],
        periods: block,
        room_id: intent.target.room_id,
      },
    };
  }

  const target = effectiveTarget(env, intent, session, assumptions);
  if (current && sameSlot(current, session, target))
    return draft(
      "move_session",
      `${session.id} is already at ${slotText(env, session)}.`,
      {
        session: ref,
        assumptions,
        prefix: res.notes,
        verdict: "no_change",
      },
    );

  let search: Search;
  try {
    search = searchOptions(
      env,
      session,
      target,
      [],
      (placement) => ({
        kind: "faculty_request",
        changes: [],
        placements: [placement],
        nl_prompt: env.message,
      }),
      "Move",
    );
  } catch (err) {
    return { ...engineFailure("move_session", err), session: ref };
  }

  const now = `${session.id} (now ${slotText(env, session)})`;
  const asked = windowText(target);
  let text: string;
  if (search.options.length > 0 && !search.widened)
    text = `I found ${plural(search.options.length, "option")} for ${now} in ${asked}, each checked by the constraint engine. The best: ${search.options[0].label}. ${SUBMIT_NOTE}`;
  else if (search.options.length > 0)
    text = `${now} can't move to ${asked}: ${conflictText(search.conflicts)} I looked at ${search.widened} instead and found ${plural(search.options.length, "option")}; the best: ${search.options[0].label}. ${SUBMIT_NOTE}`;
  else
    text = `${now} can't move to ${asked}: ${conflictText(search.conflicts)}${session.fixed_slot ? " The dataset pins it to a fixed slot." : ""}`;
  if (search.widened)
    assumptions.push(
      `Nothing fits ${asked}, so the options are from ${search.widened}`,
    );

  return draft("move_session", text, {
    verified: true,
    session: ref,
    options: search.options,
    conflicts: search.conflicts,
    assumptions,
    prefix: res.notes,
    verdict:
      search.options.length > 0
        ? `options:${search.options.length}`
        : "no_option",
    phrase: "reply",
    follow_up:
      search.options.length === 0 ? "Would another day or time work?" : null,
  });
}

/** The target is exactly where the session already is. */
function sameSlot(
  current: Assignment,
  session: Pick<Session, "duration">,
  target: MoveTarget,
): boolean {
  const days = target.days ?? [];
  const periods = target.periods ?? [];
  if (days.length !== 1 || days[0] !== current.day) return false;
  const block = Array.from(
    { length: session.duration },
    (_, i) => current.start_period + i,
  );
  if (
    periods.length !== block.length ||
    !block.every((p) => periods.includes(p))
  )
    return false;
  return !target.room_id || target.room_id === current.room_id;
}

/** The faculty member a mark_unavailable or add_session request is for, or why not. */
function facultyFor(
  env: Env,
  hint: string | null,
  kind: AssistantIntentKind,
): { ok: true; faculty: Faculty | null } | { ok: false; draft: Draft } {
  const { user, dataset } = env;
  if (user.role === "faculty") {
    if (!user.faculty_id)
      return {
        ok: false,
        draft: draft(kind, outOfScopeText(user), { verdict: "refused" }),
      };
    const me = dataset.faculty.find((f) => f.id === user.faculty_id) ?? null;
    if (hint) {
      const found = resolveFaculty(dataset, hint);
      if (!found.ok || found.faculty.id !== user.faculty_id)
        return {
          ok: false,
          draft: draft(
            kind,
            kind === "mark_unavailable"
              ? "You can only mark your own unavailability."
              : "You can only add sessions you teach yourself.",
            { verdict: "refused" },
          ),
        };
    }
    return { ok: true, faculty: me };
  }
  if (!hint) return { ok: true, faculty: null };
  const found = resolveFaculty(dataset, hint);
  if (!found.ok)
    return {
      ok: false,
      draft:
        found.reason === "ambiguous"
          ? draft(kind, `More than one faculty member matches "${hint}".`, {
              follow_up: `Which one do you mean: ${found.matches.map((f) => `${f.id} (${f.name})`).join(", ")}?`,
            })
          : draft(kind, `There's no faculty member "${hint}" in the dataset.`, {
              follow_up:
                "Which faculty member do you mean (an id like F07, or a name)?",
            }),
    };
  if (
    user.role === "department_coordinator" &&
    found.faculty.department !== user.department
  )
    return {
      ok: false,
      draft: draft(
        kind,
        user.department
          ? `${found.faculty.id} (${found.faculty.name}) isn't in ${user.department}; you can only act for ${user.department} faculty.`
          : outOfScopeText(user),
        { verdict: "refused" },
      ),
    };
  return { ok: true, faculty: found.faculty };
}

function handleUnavailable(env: Env, outcome: IntentOutcome): Draft {
  const { intent } = outcome;
  const who = facultyFor(env, intent.faculty_hint, "mark_unavailable");
  if (!who.ok) return who.draft;
  const faculty = who.faculty;
  if (!faculty)
    return draft("mark_unavailable", "Who is unavailable?", {
      follow_up: "Which faculty member (an id like F07, or a name)?",
    });
  const { outsideHours } = env.signals;
  if (outsideHours)
    return draft(
      "mark_unavailable",
      `No classes run at "${outsideHours}" (teaching periods are ${periodsText(env.teaching)}), so nothing in the timetable needs to change.`,
      { verdict: "outside_hours" },
    );
  if (intent.target.days.length === 0)
    return draft(
      "mark_unavailable",
      env.signals.weekend
        ? `There are no classes on Saturday or Sunday, so ${faculty.id} being away then changes nothing.`
        : `On which day${intent.target.periods.length > 0 ? "" : "s"} is ${faculty.id} unavailable?`,
      {
        follow_up: env.signals.weekend ? null : "Which day or days (MON–FRI)?",
        verdict: env.signals.weekend ? "no_change" : "follow_up",
      },
    );

  const assumptions: string[] = [];
  let periods = intent.target.periods;
  if (periods.length === 0) {
    periods = env.teaching;
    assumptions.push(
      `No time given: all teaching periods ${periodsText(periods)}`,
    );
  }
  const days = intent.target.days;
  const change: DisruptionChange = {
    type: "faculty_unavailable",
    faculty_id: faculty.id,
    days: [...days],
    periods: [...periods],
    ...(intent.reason ? { reason: intent.reason } : {}),
  };
  const proposal: ChangeProposalRequest = {
    kind: "unavailability",
    changes: [change],
    placements: [],
    nl_prompt: env.message,
  };
  const scopeIssues = changeScopeIssues(env.user, env.dataset, proposal);
  if (scopeIssues.length > 0)
    return draft("mark_unavailable", scopeIssues.join(" "), {
      verdict: "refused",
    });

  const window = `${days.join("/")} ${periodsText(periods)}`;
  const affected = env.dataset.sessions.filter((s) => {
    if (s.faculty_id !== faculty.id) return false;
    const a = env.at.get(s.id);
    if (!a || !days.includes(a.day)) return false;
    for (let p = a.start_period; p < a.start_period + s.duration; p++)
      if (periods.includes(p)) return true;
    return false;
  });

  let built: ReturnType<typeof buildProposal>;
  try {
    built = buildProposal(env, proposal);
  } catch (err) {
    return engineFailure("mark_unavailable", err);
  }
  if (!built.ok)
    return draft("mark_unavailable", refusalText(built.error), {
      verdict: built.error.code === "FORBIDDEN" ? "refused" : "invalid",
    });
  const result = built.proposal;

  if (!result.feasible)
    return draft(
      "mark_unavailable",
      `Marking ${faculty.id} unavailable ${window} leaves no valid timetable: ${conflictText(result.conflicts)}`,
      {
        verified: true,
        conflicts: result.conflicts,
        assumptions,
        verdict: "no_option",
        phrase: "reply",
        follow_up: "Would a shorter window work?",
      },
    );

  const moved = result.moved_count;
  const option: AssistantOption = {
    option_id: "opt-1",
    label: `Mark ${faculty.id} unavailable ${window} (${moved === 0 ? "no class moves" : `${plural(moved, "session")} ${moved === 1 ? "moves" : "move"}`})`,
    proposal,
    moved_count: result.moved_count,
    time_changed: result.time_changed,
    room_only_changed: result.room_only_changed,
    soft_delta: result.soft_delta,
    diff: result.diff,
  };
  const text =
    affected.length === 0
      ? `None of ${faculty.id}'s sessions fall in ${window}, so no class moves; submitting this records the unavailability for future timetables. ${SUBMIT_NOTE}`
      : `${affected.length} of ${faculty.id}'s sessions ${affected.length === 1 ? "falls" : "fall"} in ${window} (${affected.map((s) => s.id).join(", ")}). The constraint engine found a fix in which ${plural(moved, "session")} ${moved === 1 ? "moves" : "move"} (${result.time_changed} change time, ${result.room_only_changed} change room only). ${SUBMIT_NOTE}`;
  return draft("mark_unavailable", text, {
    verified: true,
    options: [option],
    assumptions,
    verdict: "options:1",
    phrase: "reply",
  });
}

function handleAdd(env: Env, outcome: IntentOutcome): Draft {
  const { intent } = outcome;
  const { user, dataset } = env;
  const assumptions: string[] = [];
  let courseId = intent.new_session.course_id ?? intent.session.course_id;
  let kind: SessionKind | null = intent.new_session.kind ?? intent.session.kind;

  const ownCourses = [...new Set(env.scope.map((s) => s.course_id))];
  if (!courseId) {
    if (user.role === "faculty" && ownCourses.length === 1) {
      courseId = ownCourses[0];
      assumptions.push(`Course read as ${courseId}, the only course you teach`);
    } else
      return draft("add_session", "Which course is the extra session for?", {
        follow_up:
          user.role === "faculty" && ownCourses.length > 0
            ? `Which course: ${ownCourses.join(" or ")}?`
            : "Which course (for example CS202)?",
      });
  }
  const course = dataset.courses.find((c) => c.id === courseId);
  if (!course)
    return draft(
      "add_session",
      `There's no course ${courseId} in the dataset.`,
      {
        follow_up: "Which course do you mean?",
        verdict: "no_session",
      },
    );
  if (user.role === "faculty" && !ownCourses.includes(course.id))
    return draft(
      "add_session",
      `You can only add sessions to courses you teach${ownCourses.length > 0 ? ` (${ownCourses.join(", ")})` : ""}.`,
      { verdict: "refused" },
    );
  if (
    user.role === "department_coordinator" &&
    course.department !== user.department
  )
    return draft(
      "add_session",
      `${course.id} isn't a ${user.department ?? "department"} course. ${outOfScopeText(user)}`,
      {
        verdict: "refused",
      },
    );

  const kinds = [
    ...new Set(
      dataset.sessions
        .filter((s) => s.course_id === course.id)
        .map((s) => s.kind),
    ),
  ];
  if (!kind) {
    kind = kinds.includes("lecture") ? "lecture" : (kinds[0] ?? null);
    if (kind) assumptions.push(`'class' read as a ${kind}`);
  }
  if (!kind || !kinds.includes(kind))
    return draft(
      "add_session",
      kinds.length > 0
        ? `${course.id} has no ${kind} session to model an extra one on (it has ${kinds.join(", ")} sessions).`
        : `${course.id} has no sessions to model an extra one on.`,
      {
        follow_up:
          kinds.length > 0 ? `Which kind: ${kinds.join(" or ")}?` : null,
        verdict: "no_session",
      },
    );

  const who = facultyFor(env, intent.faculty_hint, "add_session");
  if (!who.ok) return who.draft;
  const template = dataset.sessions.find(
    (s) => s.course_id === course.id && s.kind === kind,
  );
  const facultyId =
    user.role === "faculty"
      ? user.faculty_id
      : (who.faculty?.id ?? template?.faculty_id ?? null);
  if (!facultyId)
    return draft("add_session", outOfScopeText(user), { verdict: "refused" });

  const blocked = windowProblem(
    env,
    "add_session",
    `an extra ${course.id} ${kind}`,
  );
  if (blocked) return { ...blocked, assumptions };

  let session: Session | null;
  let search: Search;
  try {
    session = deriveExtraSession(dataset, {
      course_id: course.id,
      kind,
      faculty_id: facultyId,
    });
    if (!session)
      return draft(
        "add_session",
        `${course.id} has no ${kind} session to model an extra one on.`,
        {
          verdict: "no_session",
        },
      );
    const extra = session;
    const change: DisruptionChange = { type: "add_session", session: extra };
    // Check the user may file this session at all before searching: otherwise every option would
    // be dropped by `toOption` and the reply would wrongly say it can't be placed.
    const scopeIssues = changeScopeIssues(user, dataset, {
      kind: "faculty_request",
      changes: [change],
      placements: [],
    });
    if (scopeIssues.length > 0)
      return draft(
        "add_session",
        `You can't request this extra session: ${scopeIssues[0].replace(/^changes\[\d+\]: /, "")}`,
        { verdict: "refused" },
      );
    const target = effectiveTarget(env, intent, extra, assumptions);
    search = searchOptions(
      env,
      extra,
      target,
      [change],
      (placement) => ({
        kind: "faculty_request",
        changes: [change],
        placements: [placement],
        nl_prompt: env.message,
      }),
      "Add",
    );
    const asked = windowText(target);
    if (search.widened)
      assumptions.push(
        `Nothing fits ${asked}, so the options are from ${search.widened}`,
      );
    const what = `An extra ${course.id} ${kind} (${extra.id}, for ${extra.groups.join(", ")}, taught by ${extra.faculty_id})`;
    let text: string;
    if (search.options.length > 0 && !search.widened)
      text = `${what} fits in ${plural(search.options.length, "slot")} of ${asked}, each checked by the constraint engine. The best: ${search.options[0].label}. ${SUBMIT_NOTE}`;
    else if (search.options.length > 0)
      text = `${what} can't go in ${asked}: ${conflictText(search.conflicts)} I looked at ${search.widened} instead; the best: ${search.options[0].label}. ${SUBMIT_NOTE}`;
    else
      text = `${what} can't be placed in ${asked}: ${conflictText(search.conflicts)}`;
    return draft("add_session", text, {
      verified: true,
      options: search.options,
      conflicts: search.conflicts,
      assumptions,
      verdict:
        search.options.length > 0
          ? `options:${search.options.length}`
          : "no_option",
      phrase: "reply",
      follow_up:
        search.options.length === 0 ? "Would another day or time work?" : null,
    });
  } catch (err) {
    return engineFailure("add_session", err);
  }
}

function handleExplain(
  env: Env,
  outcome: IntentOutcome,
  pick: string | undefined,
  versionId: string,
): Draft {
  const { intent } = outcome;
  const res = resolveSession(
    env,
    intent.session,
    intent.faculty_hint,
    pick,
    "explain",
  );
  if (!res.ok) return failureDraft(env, "explain_session", res);
  let facts: SessionFacts | null;
  try {
    facts = explainSession({
      dataset: env.dataset,
      assignments: env.baseline,
      session_id: res.session.id,
      version_id: versionId,
    });
  } catch (err) {
    return {
      ...engineFailure("explain_session", err),
      session: refOf(env, res.session),
    };
  }
  if (!facts)
    return draft(
      "explain_session",
      `There's no session ${res.session.id} in the timetable.`,
      {
        verdict: "no_session",
      },
    );
  return draft("explain_session", facts.summary, {
    verified: true,
    session: refOf(env, res.session),
    facts,
    prefix: res.notes,
    verdict: "explained",
    phrase: "explain",
  });
}

function handleUnsupported(env: Env): Draft {
  const { bypass, booking } = env.signals;
  const parts: string[] = [];
  if (bypass) parts.push(APPROVAL_NOTE);
  if (booking) parts.push(BOOKING_NOTE);
  parts.push(CAPABILITIES);
  return draft("unsupported", parts.join(" "), {
    verdict: bypass ? "refused" : "unsupported",
  });
}

// --------------------------------------------------------------------------------- turn

function replyFacts(d: Draft): AssistantReplyFacts {
  return {
    intent: d.intent,
    session: d.session,
    verified: d.verified,
    options: d.options.map((o) => ({
      option_id: o.option_id,
      label: o.label,
      moved_count: o.moved_count,
      time_changed: o.time_changed,
      room_only_changed: o.room_only_changed,
      soft_delta: o.soft_delta,
    })),
    conflicts: d.conflicts.map((c) => ({
      session_id: c.session_id,
      summary: c.summary,
      contradictions: c.contradictions,
    })),
    assumptions: d.assumptions,
    follow_up: d.follow_up,
  };
}

/** Model phrasing within the explanation quota; the template otherwise. */
async function phrase(
  db: Db,
  user: SessionUser,
  d: Draft,
  llm: LlmConfig,
  signal: AbortSignal | undefined,
): Promise<Explanation | null> {
  if (!llm || !d.phrase) return null;
  if (d.phrase === "explain" && !d.facts) return null;
  if (!limits.aiExplainUser.hit(user.id).allowed) return null;
  const phrased =
    d.phrase === "explain" && d.facts
      ? await phraseScheduleExplanation(d.facts, d.facts.summary, llm, {
          signal,
        })
      : await phraseAssistantReply(replyFacts(d), d.text, llm, { signal });
  if (phrased.model !== null) {
    await appendAiLog(db, {
      feature: "assistant",
      source: phrased.source,
      model: phrased.model,
      prompt_id:
        d.phrase === "explain"
          ? EXPLAIN_SCHEDULE_PROMPT_ID
          : ASSISTANT_REPLY_PROMPT_ID,
      input: JSON.stringify({
        intent: d.intent,
        session_id: d.session?.session_id ?? null,
      }).slice(0, 500),
      output_raw: phrased.raw_output,
      parsed_ok: phrased.source === "llm",
      repaired: false,
      cached: false,
      fallback_reason: phrased.fallback_reason,
      engine_verdict: d.verdict,
      latency_ms: Math.max(0, Math.round(phrased.latency_ms)),
      user_id: user.id,
    }).catch((err: unknown) => {
      console.warn(
        "[assistant] could not log the phrasing call:",
        err instanceof Error ? err.message : err,
      );
    });
  }
  return phrased;
}

/**
 * One assistant turn for `user` (admin, coordinator or faculty; clubs get `403`). Works with AI
 * off: the rule parser reads the message and templates phrase the reply.
 */
export async function assistantTurn(
  db: Db,
  user: SessionUser,
  request: AssistantRequest,
  signal?: AbortSignal,
  deps: AssistantDeps = {},
): Promise<AssistantReply> {
  if (user.role === "club")
    throw forbidden(
      "The assistant is for faculty, coordinators and admins. Clubs can request rooms with the booking form.",
    );
  const [dataset, settings, version] = await Promise.all([
    getActiveDataset(db),
    getSettings(db),
    getActiveTimetableVersion(db),
  ]);
  const message = request.message;
  const baseline = version?.assignments ?? [];
  const ctx = buildAssistantContext(
    dataset,
    user,
    baseline,
    settings.reference_date,
  );

  let outcome: IntentOutcome;
  if (!version) {
    // Nothing to check against: the rule parser reads the message (no model call is spent).
    const rules = extractAssistantIntentWithRules(message, ctx);
    outcome = {
      intent: rules.intent,
      source: "rules",
      model: null,
      fallback_code: null,
      fallback_reason: null,
      raw_output: null,
      repaired: false,
      latency_ms: 0,
      assumptions: rules.assumptions,
      signals: rules.signals,
    };
  } else {
    const llm =
      deps.llm !== undefined ? deps.llm : await getLlmConfig(db, "fast");
    outcome = await extractIntent(message, ctx, { llm, signal });
  }

  let d: Draft;
  if (!version)
    d = draft(
      outcome.intent.intent,
      "There's no active timetable yet, so I can't check any change. An admin has to generate and activate one first.",
      { verdict: "no_timetable" },
    );
  else {
    const scope = sessionsInScope(user, dataset);
    const env: Env = {
      user,
      dataset,
      message,
      baseline,
      // Options don't show `baseline_stability`, so the stored baseline isn't read for them.
      proposal: { dataset, base: version, baseline: null },
      at: new Map(baseline.map((a) => [a.session_id, a])),
      scope,
      scopeIds: new Set(scope.map((s) => s.id)),
      byId: new Map(dataset.sessions.map((s) => [s.id, s])),
      signals: outcome.signals,
      teaching: dataset.calendar.periods
        .filter((p) => p.teaching)
        .map((p) => p.id)
        .sort((a, b) => a - b),
    };
    switch (outcome.intent.intent) {
      case "move_session":
        d = handleMove(env, outcome, request.session_id);
        break;
      case "mark_unavailable":
        d = handleUnavailable(env, outcome);
        break;
      case "add_session":
        d = handleAdd(env, outcome);
        break;
      case "explain_session":
        d = handleExplain(env, outcome, request.session_id, version.id);
        break;
      default:
        d = handleUnsupported(env);
    }
  }
  d.assumptions = [...new Set([...outcome.assumptions, ...d.assumptions])];

  const replyLlm =
    deps.replyLlm !== undefined
      ? deps.replyLlm
      : version
        ? await getLlmConfig(db, "smart")
        : null;
  const phrased = await phrase(db, user, d, replyLlm, signal);
  const core =
    phrased && phrased.source === "llm" && phrased.text.trim()
      ? phrased.text
      : d.text;
  const text_source: AssistantReply["text_source"] =
    core === d.text ? "template" : "llm";
  // Code's own sentences frame the text, so phrasing can never drop them.
  const suffix =
    outcome.signals.bypass && d.intent !== "unsupported" ? [APPROVAL_NOTE] : [];
  const text = [...d.prefix, core, ...suffix].join(" ");

  const log = await appendAiLog(db, {
    feature: "assistant",
    source: outcome.source,
    model: outcome.model,
    prompt_id: ASSISTANT_INTENT_PROMPT_ID,
    input: message.slice(0, 1000),
    output_raw: outcome.raw_output,
    parsed_ok: outcome.fallback_code === null,
    repaired: outcome.repaired,
    cached: false,
    fallback_reason: outcome.fallback_reason,
    assumptions: d.assumptions,
    follow_up: d.follow_up,
    engine_verdict: d.verdict,
    latency_ms: Math.max(0, Math.round(outcome.latency_ms)),
    user_id: user.id,
  });

  return AssistantReplySchema.parse({
    intent: d.intent,
    intent_source: outcome.source,
    text,
    text_source,
    verified: d.verified,
    session: d.session,
    candidates: d.candidates,
    options: d.options,
    conflicts: d.conflicts,
    follow_up: d.follow_up,
    assumptions: d.assumptions,
    facts: d.facts,
    log_id: log.id,
  });
}
