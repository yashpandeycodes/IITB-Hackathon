# AI Usage Declaration

This document declares all AI use within the CIT Campus Scheduling and Venue Management project, including in-product AI capabilities, development tooling, prompt repository locations, and strict safety boundaries regarding what AI is not permitted to decide.

---

## 1. AI Models & APIs Called by the Product

The application integrates with the **Google Gemini API** using the official `@google/genai` TypeScript SDK via a modular adapter layer located in `src/lib/ai/`. 

AI execution is gated by the `LLM_ENABLED` environment variable, an administrative settings toggle in the database, and the presence of `GEMINI_API_KEY`. If any of these are inactive, the application automatically falls back to an offline deterministic rule-based parser (supporting English and Hinglish) and deterministic template explanations.

| Model / API | Environment Variable (Default) | In-Product Purpose | Fallback when AI is Disabled |
| :--- | :--- | :--- | :--- |
| **Google Gemini API** (`gemini-3.8-flash`) | `GEMINI_MODEL_FAST`<br>*(default: `gemini-3.8-flash`)* | **Natural Language Booking Request Parsing**: Parses free-form English and Hinglish venue booking descriptions into structured, validated JSON drafts (identifying requested room features, capacity, dates, and timeslot periods). | Deterministic offline pattern & token rule parser (`src/lib/ai/rules.ts`) covering English and Hinglish idioms. |
| **Google Gemini API** (`gemini-3.8-flash`) | `GEMINI_MODEL_SMART`<br>*(default: `gemini-3.8-flash`)* | **Decision & Conflict Explanation**: Translates low-level mathematical engine diagnostics and constraint violation facts into plain-language summaries for students, faculty, and administrators. | Pre-defined deterministic template strings generated directly from constraint engine violation codes (`src/lib/ai/explain.ts`). |

### Auditability & Evaluation
- **Logging**: Every LLM parse attempt and explanation generation is recorded in the MongoDB `ai_logs` collection with an automated 30-day Time-To-Live (TTL) index.
- **Evaluation**: The offline test suite `npm run ai-eval` benchmarks parsing accuracy directly against real campus request samples in the benchmark dataset.

---

## 2. AI Tools Used to Build the Project

| AI Tool / Assistant | Specific Project Parts & Contributions |
| :--- | :--- |
| **Claude Code** (Anthropic) | - Initial project scaffolding, database schema architecture, and repository directory structure.<br>- Core constraint solver algorithms and mathematical engine design.<br>- Initial backend API routes and unit test suite setup.<br>- Early technical documentation and architecture blueprints. |
| **Antigravity** (Google DeepMind / Gemini) | - Complete frontend-to-backend integration across all application routes and views.<br>- Resolving git merge conflicts between feature branches.<br>- Elimination of legacy mock data files (`cit-data.ts`) and removal of fabricated statistical claims.<br>- End-to-end integration audits against contract schemas in `@/lib/contracts/`.<br>- Implementation of preview banners and defensive action gating for unbacked Phase 4 & Phase 5 screens.<br>- Production build optimization and debugging Vercel deployment / serverless environment configuration. |

---

## 3. Where Prompts Are Kept

All prompts utilized by the application are centralized, version-controlled, and stored in the **`prompts/`** directory at the project root:

- **`prompts/parse_booking.v1.md`**: System instructions, campus context constraints, and output JSON schemas for natural-language booking parsing.
- **`prompts/explain_booking.v1.md`**: System instructions and structural rules for translating engine constraint facts into human explanations.
- **`prompts/README.md`**: Documentation on prompt engineering conventions, versioning rules (`<feature>.v<N>.md`), and security standards.

### Prompt Security Standards
- Prompts are loaded dynamically at runtime via `src/lib/ai/prompts.ts`.
- Prompts never contain passwords, API tokens, session identifiers, or personally identifiable information (PII).
- User input is sanitized and enclosed in neutral delimiters (`<<<` / `>>>`) to prevent prompt injection or boundary confusion.

---

## 4. What the LLM is Not Allowed to Decide

To guarantee institutional integrity, fairness, and safety, the AI is strictly bounded. **The LLM is treated as an untrusted input translator, never a decision-maker.**

1. **Schedule Validity & Conflict Resolution**:
   - The LLM **never** determines whether a timetable or room booking is feasible or valid.
   - Feasibility is determined exclusively by the deterministic constraint engine and mathematical solver (`src/lib/engine/`).
2. **Booking Decisions & State Transitions**:
   - The LLM **cannot** approve, reject, cancel, or modify the status of any venue booking or examination slot.
   - All approvals require authenticated human sign-off or deterministic processing through the Spectra allocation engine.
3. **Priority Categorization & Privilege Escalation**:
   - The LLM **cannot** assign or elevate a booking request's priority tier (e.g., Academic vs. Administrative vs. Club).
   - Priority categories are strictly enforced and capped in server-side application code based on the authenticated user's role.
4. **Database Write Permissions**:
   - The LLM has **zero database write access** and cannot invoke any mutating internal service or API.
   - Parsing outputs are returned exclusively as editable client-side drafts that must be inspected and confirmed by a human user before submission.
5. **Factual Verification in Explanations**:
   - Any text generated by the explanation LLM is verified against deterministic engine facts. If any numeric fact, date, or conflict code does not match the engine's computed output, the generated text is rejected and the system defaults to the engine's verified explanation string.
