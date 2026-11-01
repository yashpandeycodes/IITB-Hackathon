# AI Usage

## 1. AI inside the product

Google Gemini API through the official `@google/genai` SDK, accessed only via the adapter in `src/lib/ai/`. Model ids come from env, so they can be swapped without code changes; both default to `gemini-3.8-flash` (Google's current stable Flash model). AI is used only when `LLM_ENABLED`, the admin's LLM toggle and a `GEMINI_API_KEY` are all set; otherwise an offline rule parser (English + Hinglish) and template explanations do the same jobs.

| Model (env, default `gemini-3.8-flash`) | Used for                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_MODEL_FAST`                     | Turns English/Hinglish venue requests into an editable structured draft (JSON schema); reads what a timetable-assistant message asks for (intent extraction, JSON schema)                                                            |
| `GEMINI_MODEL_SMART`                    | Words booking explanations, session explanations ("why is this class here?") and assistant replies from facts our code and the engine have already computed (template fallback); change-request explanations always use the template |

Every parse (Gemini or rule parser), every assistant turn and every Gemini-worded explanation or reply is recorded in the `ai_logs` collection (kept 30 days); `npm run ai-eval` measures parsing accuracy against the dataset's own requests, and the assistant's intent reading on 63 messages.

## 2. AI tools used to build the project

| Tool                              | Used for                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Claude Code (AI coding assistant) | Scaffolding, code generation, code review and documentation drafts across the repo |

## 3. Where prompts are kept

`prompts/`, one versioned file per feature (`<feature>.v<N>.md`). See [prompts/README.md](prompts/README.md).

## 4. What the LLM is not allowed to decide

- Whether any schedule, booking or timetable change is valid
- Approvals, rejections or any status change
- A request's priority category (always capped by role in code)
- Which session, room or faculty member a request refers to (code resolves every id against the dataset and the asker's own sessions; anything else is refused)
- Which timetable options exist or how many sessions move (the constraint engine computes every option)
- Anything written to the database (the LLM has no write access and calls no mutation API)

Every structured model output (booking drafts, assistant intents) is parsed with Zod, then checked by the deterministic constraint engine, then reviewed by a person: the requester confirms a booking draft or an assistant option, and a timetable change waits for an admin's approval, which verifies it again. Model-phrased text is fact-checked against the engine's facts and shown only if it passes; otherwise the template text from the same facts is used. The manual booking form and the change-request API never call the LLM, and everything works with `LLM_ENABLED=false`.
