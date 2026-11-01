/**
 * Public types of the AI layer. The layer only extracts fields from text and phrases text from
 * facts; validity, priority and status are decided by the engine (backend.md §5.1).
 */
import type {
  AssistantIntentKind,
  AssistantIntentLLM,
  BookingDraftLLM,
  Category,
  ConflictEntry,
  Day,
  DecisionStatus,
  ExplanationSource,
  FallbackCode,
  ParseBookingResult,
  ParsedBookingDraft,
  ParseSource,
  ReasonCode,
  Role,
  Room,
  SessionKind,
  SessionRef,
  StudentGroup,
  Calendar,
} from "@/lib/contracts";

/** What the parser knows about the campus (built from the active dataset by the service). */
export type ParseContext = {
  /**
   * The active dataset's id (`datasets.dataset_id`, or the bundled file's): part of the parse
   * cache key, since a cached draft holds room and group ids resolved against this campus.
   */
  datasetId: string;
  calendar: {
    days: Calendar["days"];
    /** Every period with its clock times ("08:00"–"09:00"); P10–P13 are evening periods. */
    periods: readonly {
      id: number;
      start: string;
      end: string;
      teaching: boolean;
    }[];
    lunch: { after_period: number; start: string; end: string };
  };
  /** `allowed_uses` decides which rooms may host an event (alternatives are drawn from those). */
  rooms: readonly Pick<
    Room,
    | "id"
    | "name"
    | "type"
    | "capacity"
    | "features"
    | "accessible"
    | "allowed_uses"
  >[];
  groups: readonly (Pick<
    StudentGroup,
    "id" | "name" | "year" | "department"
  > & {
    /**
     * Students in the group. Optional; when given, "compulsory for ECE-3" with no head count
     * sets attendance to the group's size (shown as an assumption).
     */
    size?: number;
  })[];
  /** "Today" for relative days ("kal", "tomorrow", "aaj"): `YYYY-MM-DD` (settings.reference_date). */
  referenceDate: string;
};

/** One JSON-generation call; Gemini in production (`createGeminiClient`), fakes in tests. */
export type LlmClient = {
  generateJson(request: {
    model: string;
    system: string;
    prompt: string;
    /** JSON Schema for structured output (`z.toJSONSchema(BookingDraftLLMSchema)`). */
    jsonSchema: unknown;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<string>;
  /** Plain-text generation (explanations). */
  generateText(request: {
    model: string;
    system: string;
    prompt: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<string>;
};

/** The LLM to use, or null when AI is off (the rule parser then does everything). */
export type LlmConfig = {
  client: LlmClient;
  model: string;
  timeoutMs: number;
} | null;

export type ParseCache = {
  get(key: string): ParseOutcome | undefined;
  set(key: string, value: ParseOutcome): void;
};

export type ParseOptions = {
  llm: LlmConfig;
  /** Same text + reference date + dataset + model + prompt → same outcome, no new LLM call. */
  cache?: ParseCache;
  /**
   * Total time budget for the LLM calls of this parse (first call + repair), in ms; the repair is
   * skipped when too little is left, and the rule parser answers instead. Default:
   * `llm.timeoutMs`.
   */
  budgetMs?: number;
  /** Aborts the LLM calls (e.g. the client disconnected); the rule parser then answers. */
  signal?: AbortSignal;
};

export type ParseOutcome = {
  /** Resolved against the campus (room ids and group ids exist) and ready for the form. */
  draft: ParsedBookingDraft;
  /** The extraction (LLM or rules) after schema validation, before resolution. */
  extraction: BookingDraftLLM;
  source: ParseSource;
  /** The model that produced the draft: null whenever the rule parser did (incl. fallbacks). */
  model: string | null;
  /** Why the rule parser was used although an LLM was configured (safe to show); else null. */
  fallback_code: FallbackCode | null;
  /** The same, in detail, for `ai_logs` only (API keys redacted); null otherwise. */
  fallback_reason: string | null;
  /** True when the LLM's first output failed validation and one repair retry fixed it. */
  repaired: boolean;
  /** The LLM's raw text (for `ai_logs`); null for the rule parser. */
  raw_output: string | null;
  latency_ms: number;
  requested_room: ParseBookingResult["requested_room"];
  /** Informational only: what the text claims ("institute level"); never used for priority. */
  claimed_category: Category | null;
  conditions: string[];
  confidence: number;
  /** True when this outcome came from the cache. */
  cached: boolean;
};

/** What `phraseExplanation` phrases: the stored decision's status, code, reason and facts. */
export type ExplanationInput = {
  status: DecisionStatus;
  reason_code: ReasonCode;
  /** The engine's (or the approver's) reason text. */
  reason: string;
  facts: Record<string, unknown>;
};

export type Explanation = {
  text: string;
  source: ExplanationSource;
  /** The model asked, or null when no model call was made (AI off, or a code that skips it). */
  model: string | null;
  /** The model's raw text (for `ai_logs`); null without a model call. */
  raw_output: string | null;
  latency_ms: number;
  /** Why the template was used although a model was called (detail, for `ai_logs`); else null. */
  fallback_reason: string | null;
};

// ------------------------------------------------------------------------------- assistant

/**
 * What the assistant's intent extraction knows (built from the active dataset and timetable by
 * the service). Ids in here are reference data for matching; the service still resolves every id
 * against the user's own scope.
 */
export type AssistantContext = {
  datasetId: string;
  calendar: ParseContext["calendar"];
  /** "Today" for "kal", "tomorrow", "aaj": `YYYY-MM-DD` (settings.reference_date). */
  referenceDate: string;
  /** Who is asking: shapes what "I" means and whether a faculty member may be named. */
  role: Role;
  /** The asker's own faculty id ("I", "me", "my"); null for coordinators and admins. */
  selfFacultyId: string | null;
  courses: readonly { id: string; title: string; department: string }[];
  faculty: readonly { id: string; name: string; department: string }[];
  rooms: readonly { id: string; name: string }[];
  /**
   * The asker's sessions and where they are now (bounded by the service), so the model can map
   * "my Friday lecture" to a course. Never used to decide anything.
   */
  sessions: readonly {
    id: string;
    course_id: string;
    kind: SessionKind;
    day: Day | null;
    start_period: number | null;
    room_id: string | null;
  }[];
  /** In-scope sessions beyond `sessions` (left out of the model's context). */
  sessionsOmitted: number;
};

/** A window to try when the first one has no option ("Thursday morning, otherwise Friday"). */
export type FallbackWindow = { days: Day[]; periods: number[] };

/** What code read from the message itself, whichever extractor produced the intent. */
export type IntentSignals = {
  /** Asks to approve, apply, override or ignore the rules ("approve it yourself"). */
  bypass: boolean;
  /** Reads like a room or event booking (the booking request form handles those). */
  booking: boolean;
  /** "All my classes": more than one session at once. */
  allSessions: boolean;
  /** A time outside teaching hours ("evening", "7 pm", "6 am"), as written; else null. */
  outsideHours: string | null;
  /** Saturday or Sunday was named. */
  weekend: boolean;
  /** "same day": keep the session's own day. */
  sameDay: boolean;
  /** "another day", "koi aur din": any day but the session's own. */
  otherDay: boolean;
  /** The text after "otherwise", "else", "warna": a second window to try. */
  fallback: FallbackWindow | null;
  /**
   * A shift relative to where the session is now, in periods: "two hours later" = 2, "an hour
   * earlier" = -1; null when none is asked.
   */
  shift: number | null;
};

export type ExtractIntentOptions = {
  llm: LlmConfig;
  /** Total time for the model calls (first call + repair); default `llm.timeoutMs`. */
  budgetMs?: number;
  /** Aborts the model calls; the rule parser then answers. */
  signal?: AbortSignal;
};

export type IntentOutcome = {
  intent: AssistantIntentLLM;
  source: ParseSource;
  /** The model whose intent was used; null whenever the rule parser answered. */
  model: string | null;
  /** Why the rule parser answered although a model was configured (safe to show); else null. */
  fallback_code: FallbackCode | null;
  /** The same in detail, for `ai_logs` only (keys redacted). */
  fallback_reason: string | null;
  /** The model's raw text (for `ai_logs`); null for the rule parser. */
  raw_output: string | null;
  repaired: boolean;
  latency_ms: number;
  /** Readings the user should see ("'morning' read as P1–P5 (08:00–13:00)"). */
  assumptions: string[];
  signals: IntentSignals;
};

/** One option as the reply's phrasing sees it (already verified by the engine). */
export type ReplyOptionFacts = {
  option_id: string;
  label: string;
  moved_count: number;
  time_changed: number;
  room_only_changed: number;
  soft_delta: number;
};

/**
 * Everything an assistant reply may say, computed by code and the engine. Nothing has changed
 * when a reply is written: an option becomes a change request only when the user submits it,
 * and only an admin's approval applies it.
 */
export type AssistantReplyFacts = {
  intent: AssistantIntentKind;
  session: SessionRef | null;
  /** True when the options and conflicts come from the constraint engine. */
  verified: boolean;
  options: ReplyOptionFacts[];
  conflicts: Pick<ConflictEntry, "session_id" | "summary" | "contradictions">[];
  assumptions: string[];
  follow_up: string | null;
};
