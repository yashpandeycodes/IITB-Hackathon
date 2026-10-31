# AI Usage

## 1. AI inside the product

Google Gemini API, accessed through one adapter in `src/lib/ai/`. Model ids come from env, so they can be swapped without code changes. _Being integrated in a later build._

| Model (env)          | Used for                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `GEMINI_MODEL_FAST`  | Turns English/Hinglish venue requests and faculty change requests into structured drafts (JSON) |
| `GEMINI_MODEL_SMART` | Words explanations and assistant replies from facts our code has already computed               |

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

Every LLM output is parsed against a Zod schema, then checked by the deterministic constraint engine, then shown to the user as an editable draft before it can be submitted. The manual booking form never calls the LLM and works with `LLM_ENABLED=false`.
