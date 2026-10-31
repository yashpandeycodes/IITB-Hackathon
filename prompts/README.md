# Prompts

Versioned prompt files used by the in-product AI layer (`src/lib/ai/`), loaded at runtime.

- Naming: `<feature>.v<N>.md`, e.g. `parse_booking.v1.md`. A change in behaviour gets a new version file; old versions stay for comparison.
- Prompts never contain secrets, API keys or personal data.
- Boundary: the LLM only extracts fields or phrases text from facts our code computes; validity, approvals and priority are decided by the deterministic engine, never by the LLM.

See [AI_USAGE.md](../AI_USAGE.md).
