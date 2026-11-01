# AI Usage Declaration

This document declares all AI use within the CIT Campus Scheduling and Venue Management project, including in-product AI capabilities, development tooling, prompt repository locations, auditability, and strict safety boundaries.

---

## 1. AI Inside the Product

The application integrates with the **Google Gemini API** through the official `@google/genai` TypeScript SDK. All Gemini API access is routed through the modular adapter layer in `src/lib/ai/`.

Model IDs are configurable through environment variables, allowing models to be replaced without code changes. Both models default to `gemini-3.8-flash`.

AI execution is enabled only when all three conditions are satisfied:

- The `LLM_ENABLED` environment variable is enabled.
- The administrator's LLM toggle is enabled.
- `GEMINI_API_KEY` is configured.

If any condition is not satisfied, the application falls back to an offline deterministic rule-based parser supporting English and Hinglish, together with deterministic template explanations. Core functionality remains available with `LLM_ENABLED=false`.

### Models, Configuration, and Responsibilities

| Model / Configuration | In-Product Purpose | Fallback When AI Is Disabled |
| :--- | :--- | :--- |
| `GEMINI_MODEL_FAST` (default: `gemini-3.8-flash`) | Converts natural-language English and Hinglish venue booking requests into editable structured drafts using a JSON schema, including requested room features, capacity, dates, and time periods. Also extracts the intent and structured information from timetable-assistant messages. | Offline rule-based parsing using patterns and tokens, including `src/lib/ai/rules.ts`. |
| `GEMINI_MODEL_SMART` (default: `gemini-3.8-flash`) | Generates plain-language booking explanations, session explanations (including why a class is scheduled at a particular time), and timetable-assistant replies using facts already computed by application code and the constraint engine. | Deterministic templates generated from verified application facts and constraint-engine diagnostics, including `src/lib/ai/explain.ts`. |
| Change-request explanations | Explains timetable change requests using the facts computed by the application. These explanations do not depend on LLM-generated wording. | Deterministic template explanations. |

The two environment variables are independently configurable; they may use different model IDs without requiring application code changes.

### Auditability and Evaluation

- **AI logging:** Every parse, whether performed by Gemini or the offline rule parser, every timetable-assistant turn, and every Gemini-worded explanation or assistant reply is recorded in the MongoDB `ai_logs` collection.
- **Log retention:** AI logs are retained for 30 days using a Time-To-Live (TTL) index.
- **Parsing evaluation:** `npm run ai-eval` measures booking-request parsing accuracy against the project's benchmark dataset of campus requests.
- **Assistant intent evaluation:** The evaluation suite also measures the assistant's intent extraction accuracy against a dataset of 63 messages.

### Human Review and Validation

Every structured model output, including booking drafts and assistant intents, is parsed and validated using Zod and then checked against the deterministic application logic.

- **Booking requests:** Natural-language parsing produces an editable draft that the requester must review and confirm.
- **Timetable assistance:** The requester reviews and confirms an assistant-proposed option.
- **Timetable changes:** A proposed change requires administrator approval, and the administrator's approval workflow verifies the change again.
- **Generated explanations:** Model-generated wording is checked against facts computed by the application. If the wording fails verification, the application uses a deterministic template based on the same verified facts.

The manual booking form and change-request API do not call the LLM. The application remains functional with AI disabled.

---

## 2. AI Tools Used to Build the Project

AI-assisted development tools were used for scaffolding, implementation, integration, testing, debugging, code review, and documentation. Their use during development is separate from the AI capabilities available to end users in the deployed product.

| AI Tool / Assistant | Project Contributions |
| :--- | :--- |
| **Claude Code (Anthropic)** | Initial project scaffolding, database schema architecture, repository directory structure, core constraint-solver algorithms and mathematical engine design, initial backend API routes, unit-test suite setup, technical documentation, architecture blueprints, code generation, code review, and documentation drafts across the repository. |
| **Antigravity (Google DeepMind / Gemini)** | Frontend-to-backend integration across application routes and views; resolving Git merge conflicts between feature branches; eliminating legacy mock-data files such as `cit-data.ts`; removing fabricated statistical claims; end-to-end integration audits against contract schemas in `@/lib/contracts/`; implementing preview banners and defensive action gating for unbacked Phase 4 and Phase 5 screens; production build optimization; and debugging Vercel deployment and serverless environment configuration. |

These tools assisted development but do not replace the application's deterministic validation, authorization, constraint-solving, or approval mechanisms.

---

## 3. Where Prompts Are Kept

Application prompts are stored in the version-controlled `prompts/` directory at the project root. Prompt files follow the naming convention `<feature>.v<N>.md`, with versioned files maintained separately for individual features.

| File | Purpose |
| :--- | :--- |
| `prompts/parse_booking.v1.md` | System instructions, campus context constraints, and output JSON schemas for natural-language booking-request parsing. |
| `prompts/explain_booking.v1.md` | System instructions and structural rules for translating constraint-engine facts into human-readable explanations. |
| `prompts/README.md` | Prompt engineering conventions, versioning rules, and prompt security standards. |

Prompts are loaded dynamically at runtime through `src/lib/ai/prompts.ts`.

### Prompt Security Standards

- Prompts must not contain passwords, API tokens, session identifiers, or personally identifiable information (PII).
- User input is sanitized and enclosed in neutral delimiters (`<<<` and `>>>`) to reduce prompt-injection and boundary-confusion risks.
- Model output is treated as untrusted input and validated before being used by the application.
- Prompt instructions cannot grant the model additional permissions or bypass application-level authorization and validation.

---

## 4. What the LLM Is Not Allowed to Decide

The LLM is treated as an **untrusted input translator and language-generation component, never as an authoritative decision-maker**. All consequential decisions remain under deterministic application logic, authorization checks, and human review where required.

### 4.1 Schedule Validity and Conflict Resolution

- The LLM cannot determine whether a timetable, room booking, or schedule change is feasible or valid.
- It cannot invent timetable options or decide how many sessions should move.
- All feasibility checks, scheduling options, and constraint violations are computed by the deterministic constraint engine and mathematical solver in `src/lib/engine/`.

### 4.2 Booking Decisions, Approvals, and State Transitions

- The LLM cannot approve, reject, cancel, or modify the status of a booking or examination slot.
- It cannot independently authorize a timetable change.
- Booking drafts must be confirmed by the requester, while timetable changes require administrator approval and subsequent verification.
- State transitions are controlled by the application's authenticated workflows and deterministic processing, including the scheduling and allocation engine where applicable.

### 4.3 Priority Categorization and Privilege Escalation

- The LLM cannot assign or elevate a request's priority category, including Academic, Administrative, or Club categories.
- Priority is enforced and capped by server-side application code according to the authenticated user's role.
- The model cannot override permissions, roles, or access-control rules.

### 4.4 Session, Room, and Faculty Identification

- The LLM cannot independently determine which session, room, or faculty member a request refers to.
- Application code resolves identifiers against the authoritative dataset and, for timetable-assistant requests, the requester's own sessions.
- References that cannot be resolved or are outside the requester's permitted scope are refused rather than accepted solely on the model's interpretation.

### 4.5 Database Write Permissions

- The LLM has no direct database write access and cannot invoke mutation APIs or internal services to alter application state.
- Parsing outputs are returned as editable drafts rather than being committed directly to the database.
- The requester must inspect and confirm a booking draft before submission.
- Database mutations and state transitions are performed through the application's authorized server-side workflows.

### 4.6 Factual Accuracy of Explanations

- The LLM may describe facts already computed by the application, but it cannot create authoritative scheduling facts.
- Generated explanations are checked against the deterministic engine's output.
- If generated wording fails verification, the application falls back to a deterministic explanation based on the verified facts.
- Change-request explanations use templates rather than LLM-generated wording.

---

## 5. Deterministic Safety and Validation Pipeline

All structured model outputs, including booking drafts and assistant intents, pass through schema validation and application-level checks before they can influence a user workflow.

The overall processing model is:

1. **Input interpretation:** Gemini or the offline rule parser extracts structured information from the user's request.
2. **Schema validation:** Zod validates the resulting structured output.
3. **Application validation:** Deterministic code resolves identifiers, enforces authorization, and checks the relevant constraints.
4. **Human review:** The requester confirms a booking draft or assistant-proposed option; timetable changes require administrator approval.
5. **Authorized execution:** The application processes approved actions through its normal server-side workflows.
6. **Explanation verification:** Any LLM-generated explanation is checked against computed facts; deterministic templates are used when verification fails.

The LLM cannot bypass this pipeline, alter the constraint engine's decisions, or write directly to the database.

**Core principle:** AI assists with natural-language interpretation and communication. Scheduling feasibility, permissions, priorities, authoritative identifiers, approvals, and database mutations remain controlled by deterministic application logic and authorized human workflows.
