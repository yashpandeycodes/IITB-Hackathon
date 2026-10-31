# AI Usage

## 1. AI inside the product

Google Gemini API through the official `@google/genai` SDK, accessed only via the adapter in `src/lib/ai/`. Model ids come from env, so they can be swapped without code changes; both default to `gemini-3.8-flash` (Google's current stable Flash model). AI is used only when `LLM_ENABLED`, the admin's LLM toggle and a `GEMINI_API_KEY` are all set; otherwise an offline rule parser (English + Hinglish) and template explanations do the same jobs.

| Model (env, default `gemini-3.8-flash`) | Used for                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GEMINI_MODEL_FAST`                     | Turns English/Hinglish venue requests into an editable structured draft (JSON schema)     |
| `GEMINI_MODEL_SMART`                    | Words booking explanations from facts the engine has already computed (template fallback) |

Every parse (Gemini or rule parser) and every Gemini explanation is recorded in the `ai_logs` collection (kept 30 days); `npm run ai-eval` measures parsing accuracy against the dataset's own requests.

## 2. AI tools used to build the project

| Tool                              | Used for                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Claude Code (AI coding assistant) | Scaffolding, code generation, code review and documentation drafts across the repo |

## 3. Where prompts are kept

`prompts/`, one versioned file per feature (`<feature>.v<N>.md`). See [prompts/README.md](prompts/README.md).

## 4. What the LLM is not allowed to decide

- Whether any schedule or booking is valid
- Approvals, rejections or any status change
- A request's priority category (always capped by role in code)
- Anything written to the database (the LLM has no write access and calls no mutation API)

Every parser output is checked against a Zod schema, then by the deterministic constraint engine, then shown to the user as an editable draft before it can be submitted. Explanation text is shown only if every number in it appears in the engine's facts; otherwise the engine's own reason is shown. The manual booking form never calls the LLM and works with `LLM_ENABLED=false`.
