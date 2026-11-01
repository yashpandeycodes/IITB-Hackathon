/** Prompt file ids (`prompts/<id>.md`). */
export const PARSE_PROMPT_ID = "parse_booking.v1";
export const EXPLAIN_PROMPT_ID = "explain_booking.v1";
/** The assistant: intent extraction, and its reply phrased from the engine's facts. */
export const ASSISTANT_INTENT_PROMPT_ID = "assistant_intent.v1";
export const ASSISTANT_REPLY_PROMPT_ID = "assistant_reply.v1";
/** "Why is this class here?" and "why did these sessions move?", phrased from facts. */
export const EXPLAIN_SCHEDULE_PROMPT_ID = "explain_schedule.v1";

/** Default Gemini model when `GEMINI_MODEL_FAST` / `GEMINI_MODEL_SMART` are unset (stable Flash). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
