# Prompts

Versioned prompt files used by the in-product AI layer (`src/lib/ai/`), loaded at runtime.

- Naming: `<feature>.v<N>.md`, e.g. `parse_booking.v1.md`. A change in behaviour gets a new version file; old versions stay for comparison.
- Prompts never contain secrets, API keys or personal data.
- Boundary: the LLM only extracts fields or phrases text from facts our code computes; validity, approvals and priority are decided by the deterministic engine, never by the LLM.

| File                     | Used by                                                                          | What the model does                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse_booking.v1.md`    | `POST /api/bookings/parse` (`GEMINI_MODEL_FAST`)                                 | Extracts booking fields from an English/Hinglish request as JSON (no status, no priority decision)                                                                  |
| `explain_booking.v1.md`  | `GET /api/bookings/:id`, `POST /api/explain` (`GEMINI_MODEL_SMART`)              | Words a booking decision from the engine's reason and facts (2–4 sentences)                                                                                         |
| `assistant_intent.v1.md` | `POST /api/assistant` (`GEMINI_MODEL_FAST`)                                      | Extracts what a timetable-assistant message asks for (move, unavailability, extra session, why?) as JSON; ids are hints only                                        |
| `assistant_reply.v1.md`  | `POST /api/assistant` (`GEMINI_MODEL_SMART`)                                     | Words the assistant's reply from the template and the engine's options or conflicts (1–4 sentences)                                                                 |
| `explain_schedule.v1.md` | `POST /api/explain` for a session, the assistant's "why?" (`GEMINI_MODEL_SMART`) | Words why a session is where it is (2–4 sentences). Change-request explanations never reach the model (template only), although the prompt still has rules for them |

User text and computed facts reach the model fenced as data (`<<<REQUEST_TEXT … REQUEST_TEXT>>>`, `<<<MESSAGE …`, `<<<FACTS …`); instructions inside them are ignored. Without a key, or when the model fails, the rule parsers and templates do the same jobs. Phrasing prompts over 16,000 characters are never sent, and every call caps output at 8192 tokens (a reply cut off there is discarded).

See [AI_USAGE.md](../AI_USAGE.md).
