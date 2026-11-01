# CIT Nexus: Campus Scheduling & Venue Management (CIT Crunch Week)

A web platform for Chilika Institute of Technology that generates a clash-free weekly timetable, schedules midsem exams, decides Spectra-week (Week 7) venue requests by priority and repairs the timetable after disruptions with minimal moves and admin approval.
Venue requests can be typed in plain English or Hinglish. Every decision comes with a reason, and validity is always checked by a deterministic constraint engine.

 Live at <https://iitb-hackathon-ten.vercel.app>.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI<br/>RSC + client components]
    WW[Engine Web Worker, planned<br/>live drag-drop checks]
  end

  subgraph App["Next.js app (Vercel)"]
    RH[Route Handlers /api/*<br/>Zod-validated I/O]
    SV[Services<br/>orchestration + RBAC]
    EN[Engine: pure TS, no I/O<br/>checker · solver · exams<br/>bookings · reschedule · explain]
    AI[AI adapter<br/>Gemini + rule fallback]
    RP[Repositories<br/>typed Mongo collections]
  end

  DB[(MongoDB)]
  GM[[Gemini API]]
  CI[[CI<br/>official validator.py]]

  UI -- typed fetch + TanStack Query --> RH
  UI -. same engine bundle .-> WW
  RH --> SV
  SV --> EN
  SV --> AI
  SV --> RP --> DB
  AI --> GM
  CI -. checks exports/ .-> RH
```

**LLM trust boundary:** user text → Gemini (parse or phrase only) → Zod schema check → engine hard-constraint check → human reviews an editable form → service writes to the DB. Gemini never reaches the database, changes a status, picks a priority category or approves anything. Details: [docs/architecture.md §2](docs/architecture.md#2-system-diagram) and [AI_USAGE.md](AI_USAGE.md).

## Tech stack

| Layer           | Choice                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Route Handlers, `proxy.ts`), React 19          |
| Language        | TypeScript (strict)                                                    |
| UI              | Tailwind CSS v4, shadcn/ui (Radix UI primitives), lucide-react, sonner |
| Client state    | TanStack Query v5, nuqs (URL state), react-hook-form                   |
| Contracts       | Zod 4: one schema per shape, shared by DB, API, forms and export       |
| Database        | MongoDB (Atlas in production, local `mongod` or Docker in development) |
| Auth            | bcryptjs password hashes, `jose`-signed JWT in an httpOnly cookie      |
| AI              | Google Gemini (`@google/genai`), Zod-validated, rule-parser fallback   |
| Testing / tools | Vitest, ESLint, Prettier, `tsx`, organisers' `validator.py` (Python 3) |
| Hosting         | Vercel + MongoDB Atlas                                                 |

## Setup

Requirements: **Node.js ≥ 20.9** (see `.nvmrc`), npm, and either a local `mongod` binary or Docker. Python 3.8+ is needed only for `npm run validate`.

```bash
# 1. Install dependencies
npm ci

# 2. Start MongoDB (pick one)
npm run db:start          # local mongod on 127.0.0.1:27017, data in .data/
docker compose up -d      # mongo:7 container on 127.0.0.1:27017

# 3. Configure environment
cp .env.example .env.local   # then fill in AUTH_SECRET (and GEMINI_API_KEY if using AI)

# 4. Load the bundled dataset and demo accounts into MONGODB_DB (safe to re-run; it resets the demo data)
npm run seed

# 5. Run the app
npm run dev
```

Open http://localhost:3000 and sign in with a [demo account](#demo-accounts). Health check:

```bash
curl localhost:3000/api/health
```

API reference for the routes that exist today: [docs/api.md](docs/api.md).

### Scripts

| Script              | What it does                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server on port 3000                                                                                                                                                                                                                                                |
| `npm run build`     | Production build                                                                                                                                                                                                                                                                 |
| `npm start`         | Serve the production build                                                                                                                                                                                                                                                       |
| `npm run lint`      | ESLint                                                                                                                                                                                                                                                                           |
| `npm run typecheck` | `tsc --noEmit`                                                                                                                                                                                                                                                                   |
| `npm test`          | Vitest (single run); `npm run test:watch` for watch mode                                                                                                                                                                                                                         |
| `npm run format`    | Prettier write; `npm run format:check` to check only                                                                                                                                                                                                                             |
| `npm run db:start`  | Start a local `mongod` in the background (data in `.data/mongo`)                                                                                                                                                                                                                 |
| `npm run seed`      | Reset the demo database to `data/cit_public.json` (dataset, demo users, settings), then generate the timetable, exams and Spectra decisions; `-- --stored` keeps the last uploaded dataset                                                                                       |
| `npm run ai-eval`   | Score the booking parser on the dataset's 20 distinct request texts (25 requests) and 48 sample/adversarial cases, and the assistant's intent reading on 63 messages (rule parser; `-- --llm` adds Gemini when a key is set)                                                     |
| `npm run export`    | Download `exports/schedule.json` from a running app (`-- --url http://localhost:3000`) as the demo admin; once a change is applied, `-- --after` downloads `exports/schedule_after.json` and `-- --disruption` writes `exports/disruption.json` (every applied change, in order) |
| `npm run parity`    | Check our engine against the organisers' `validator.py` (78 cases)                                                                                                                                                                                                               |
| `npm run validate`  | Run the organisers' `validator.py` on `exports/schedule.json`; `-- --after` checks `exports/schedule_after.json` against the sample change file and the baseline                                                                                                                 |

## Demo accounts

Sign in on `/login` with the email and password below. One-click sign-in: the demo-account cards on `/login`, or the API directly, `POST /api/auth/demo-login` with `{"role":"admin"}` (or `department_coordinator`, `faculty`, `club`). Run `npm run seed` first on a new database (demo-login also re-creates a missing demo account). Demo sign-in is on by default; `DEMO_LOGIN_ENABLED=false` turns it off.

```bash
curl -c /tmp/cit.jar -X POST -H 'content-type: application/json' -d '{"role":"admin"}' localhost:3000/api/auth/demo-login
```

| Role                   | Email                | Password      | Linked to                                          |
| ---------------------- | -------------------- | ------------- | -------------------------------------------------- |
| Admin                  | `admin@cit.demo`     | `Admin@123`   | Dean's office                                      |
| Department coordinator | `coord.cse@cit.demo` | `Coord@123`   | Department `CSE`                                   |
| Faculty                | `faculty@cit.demo`   | `Faculty@123` | `F06` Dr. Arjun Mehta (CSE, teaches CS202 / CS303) |
| Club representative    | `club@cit.demo`      | `Club@123`    | Dramatics Society                                  |

**Reset demo data:** signed in as Admin, `POST /api/admin/reset` restores the bundled starter-pack dataset and the demo accounts, so every judge can start from a clean state (the same as the **Reset** button under Admin → Data & Datasets).

Requests (bookings; faculty, coordinator and assistant change requests) are never approved by their requester. Change files and manual edits are the Admin's own actions (problem statement §2.5, §2.9, §2.10): they still stop at `pending` until the Admin confirms the engine's diff. Only admins approve timetable changes. Self-service sign-up (`/signup`) creates Club Representative accounts only, verified by an emailed code in the same browser; faculty and staff accounts are provisioned. Role permissions: [docs/architecture.md §9](docs/architecture.md#9-auth-and-rbac).

## Validating

Exports are produced only by the app (`GET /api/export`, which `npm run export` and the Admin → Export JSON downloads call) and committed exactly as downloaded. The export endpoint refuses to serve a file our validator port finds a hard violation in.

**Current results** (`exports/schedule.json`, produced by the app from the bundled dataset with seed 42; output of `npm run validate`, which runs the unmodified `validator.py`):

```text
Validating exports/schedule.json

Dataset: cit-public-v1   Schedule says: cit-public-v1   Team: CIT Crunch Week
Hard violations: 0  {}
Soft penalty: 3  {'S1': 0, 'S2': 0, 'S3': 0, 'S4': 3, 'S5': 0, 'S6': 0}
Bookings: score 67.0 | approved 22, alternatives 1, rejected 2, session overrides 0, priority inversions 0
Exam soft penalty: 0

PASS: 0 hard violations.
```

| Metric          | Result                                                    | Why it can't be better                                                                                                                                                          |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard violations | **0**                                                     |                                                                                                                                                                                 |
| Soft penalty    | **3** (S4)                                                | Proven lower bound: F08 can't teach MON/WED/FRI and teaches all three CS204 lectures of CSE-2, so two of them share a day (S4 = 3)                                              |
| Booking score   | **67 / 70**                                               | BR-09 (1,200 people) is larger than every venue (the OAT seats 800), so it is rejected; BR-17's window ends at P14, past the last event period (P13), so it gets an alternative |
| Exam penalty    | **0**                                                     |                                                                                                                                                                                 |
| Generation time | about 25 ms (seed 42); never more than the 8 s safety cap | Deterministic: the same seed gives the same timetable (`solver_meta.stopped_by` shows whether the iteration budget or the time cap ended a run)                                 |

The generator is fest-aware: it keeps the auditorium, the CS labs and the compulsory groups free where Week-7 requests need them, so all 22 approvals fit without moving a single class.

| Command                       | Checks                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run parity`              | Our engine against `validator.py` on 78 cases (see below); exits 1 on any difference                                                                                                                      |
| `npm run validate`            | `exports/schedule.json` against `data/cit_public.json`                                                                                                                                                    |
| `npm run validate -- --after` | `exports/schedule_after.json` with `data/sample_disruption.json` (or `--disruption <file>`, e.g. `exports/disruption.json` from `npm run export -- --disruption`) and `exports/schedule.json` as baseline |

All three run the unmodified `CrunchWeek_StarterPack/validator.py` (Python 3). `parity` scores the same schedules with our TypeScript engine and the official validator and requires identical reports (violations in order, soft penalties, booking stats, exam penalty, stability, warnings). Its 78 cases: the starter-pack example, a synthetic full schedule with and without the fest week, edge cases, 50 seeded mutations, 10 disruption runs (the sample change file and one covering all five change types) and 13 runs on a dataset variant. `--verbose` prints every mismatch. `validate` prints hard violations by rule, soft penalty, booking score, priority inversions and moved sessions. CI runs `parity` on every push and `validate` whenever the export files exist.

### Rescheduling: apply a change file

Every timetable change is a **change request**: the rescheduler proposes the fewest moves (every class whose slot still works stays put; the broken ones change room first, then time, then through short chains of up to 3 moves), shows the exact diff, and nothing changes until an Admin approves it. Approval re-checks the proposal from scratch, writes the change into the data and activates the new timetable in one step.

**As a judge, in the app** (signed in as Admin): **Changes → New Change Request → Upload Change File (JSON)**, load the change file, review the diff on the proposal page, then **Approve & Apply to Schedule**. The frontend team is wiring these screens to the API: they exist today but still show sample data, so use the commands below until they are connected.

**The same steps with curl** (run from the repo root; the cookie jars stay in `/tmp`):

1. **Admin loads the change file.** A starter-pack change file is posted exactly as it is (`kind` defaults to `disruption`; the file's own `id` is ignored):
   ```bash
   APP_URL=${APP_URL:-http://localhost:3000}
   curl -s -c /tmp/cit.jar -X POST -H 'content-type: application/json' -d '{"role":"admin"}' "$APP_URL/api/auth/demo-login"
   curl -s -b /tmp/cit.jar -H 'content-type: application/json' --data-binary @data/sample_disruption.json "$APP_URL/api/changes"
   ```
   For your own file, use `--data-binary @your_change_file.json`. The answer is a `pending` request with its `diff` (each session's from → to and why), `moved_count` / `time_changed` / `room_only_changed` and the soft-penalty change; or `infeasible` with a report naming the rules that conflict. Use the `id` from the response (`CR-0001` right after a reset). `POST /api/changes/preview` shows the same without storing anything.
2. **Admin reviews the diff and approves:**
   ```bash
   curl -s -b /tmp/cit.jar -H 'content-type: application/json' -d '{}' "$APP_URL/api/changes/CR-0001/approve"
   ```
   Any other pending request built on the old timetable is closed as superseded. The approval is all or nothing: if a step fails, everything is put back and the request stays pending. The first approval needs an exportable `schedule.json` (a reset gives one), because it becomes the validator's baseline.
3. **Export and check:** `npm run export -- --after` then `npm run validate -- --after`. `npm run export -- --disruption` writes `exports/disruption.json`, every applied change in order as one change file, for `npm run validate -- --after --disruption exports/disruption.json`. After an applied change, `schedule.json` stays the timetable from before it (the validator's `--baseline`).
4. **Separation of duties:** the coordinator files a change for their department, their own approve attempt gets `403`, and the admin approves it. (Faculty work the same way, e.g. with their own unavailability.)
   ```bash
   curl -s -c /tmp/cit-coord.jar -X POST -H 'content-type: application/json' -d '{"role":"department_coordinator"}' "$APP_URL/api/auth/demo-login"
   curl -s -b /tmp/cit-coord.jar -H 'content-type: application/json' \
     -d '{"kind":"unavailability","changes":[{"type":"faculty_unavailable","faculty_id":"F06","days":["TUE"],"periods":[1,2,3,4,5,6,7,8,9],"reason":"Department workshop"}]}' \
     "$APP_URL/api/changes"   # pending: CS303-L1 moves; note its id (CR-0002 after steps 1-2)
   curl -s -b /tmp/cit-coord.jar -H 'content-type: application/json' -d '{}' "$APP_URL/api/changes/CR-0002/approve"   # 403 FORBIDDEN
   curl -s -b /tmp/cit.jar -H 'content-type: application/json' -d '{}' "$APP_URL/api/changes/CR-0002/approve"   # applied
   ```
   This applies a second change, so check against every applied change: `npm run export -- --after`, `npm run export -- --disruption`, then `npm run validate -- --after --disruption exports/disruption.json`.

**Faculty and coordinators** file requests the Admin approves: faculty for their own unavailability, moving one of their sessions or an extra session they teach; coordinators for their department (including change files and manual placement). They can withdraw their own requests but never approve them. **The assistant** (`POST /api/assistant`, faculty, coordinator, admin) reads requests like "Can I move my Friday CS202 lecture to Thursday morning?" or "mujhe Monday ko chutti chahiye", and answers with options the constraint engine has checked; submitting one files a normal change request. **"Why?"** (`POST /api/explain`) explains any session ("why is CS202 at 8 AM?"), booking or change from the engine's facts. Details: [docs/api.md](docs/api.md#change-requests-and-rescheduling).

**Results after the sample disruption** (`exports/schedule_after.json`, produced by the app after `CR-0001` was approved; output of `npm run validate -- --after`):

```text
Validating exports/schedule_after.json against data/sample_disruption.json

Dataset: cit-public-v1   Schedule says: cit-public-v1   Team: CIT Crunch Week
Hard violations: 0  {}
Soft penalty: 3  {'S1': 0, 'S2': 0, 'S3': 0, 'S4': 3, 'S5': 0, 'S6': 0}
Bookings: score 67.0 | approved 22, alternatives 1, rejected 2, session overrides 0, priority inversions 0
Exam soft penalty: 0
Stability: 9 sessions moved (0 changed time, 9 room only)

PASS: 0 hard violations.
```

| Metric          | Result                                         | Why it can't be better                                                                                                     |
| --------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hard violations | **0**                                          |                                                                                                                            |
| Sessions moved  | **9** (0 changed time, 9 room only)            | All 9 classes held in CR-102 must leave it; each keeps its time. F07 teaches nothing on Mondays, so that change moves none |
| New session     | `CS202-T2` at MON P7 in CR-103                 | Added sessions aren't counted as moves                                                                                     |
| Soft penalty    | **3**, unchanged                               | Same proven lower bound as before the change                                                                               |
| Booking score   | **67 / 70**; exam penalty **0**                | Unchanged                                                                                                                  |
| Rescheduler     | tens of milliseconds (38 ms in the live smoke) | Deterministic; 200,000-node search budget with a 4 s safety cap                                                            |

## Project structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx  login/  signup/  unauthorized/   # CIT Nexus landing, sign-in, sign-up, access denied
│   │   ├── dashboard/  admin/  coordinator/  faculty/  club/   # CIT Nexus role pages (role-gated)
│   │   ├── timetable/ rooms/ bookings/ spectra/ approvals/ changes/ assistant/ exams/
│   │   │                            # app screens (to move into an (app)/ route group; see docs/integration-guide.md)
│   │   └── api/                     # Route Handlers: auth, admin, settings, timetable (+ generate,
│   │                                # versions), rooms, exams, spectra, bookings (+ parse), changes
│   │                                # (+ preview, approve, reject), manual/place, assistant, explain,
│   │                                # export, validate, reference, dashboard, health (docs/api.md)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui primitives
│   │   ├── landing/ auth/ brand/    # CIT Nexus landing sections, auth forms, logo
│   │   ├── layout/ providers/ states/ semantic/   # app shell, providers, empty/error/loading states, chips
│   │   └── {timetable,booking,approvals,dashboard,assistant}/   # (planned)
│   ├── lib/
│   │   ├── contracts/               # Zod schemas: single source of truth
│   │   ├── api/                     # route helpers: withHandler, parseJsonBody, parseSearchParams, ok/fail
│   │   ├── engine/                  # pure TS port of validator.py (checker, soft score, bookings, exams,
│   │   │                            # disruption); solver, fest costs, exam scheduler, Spectra decisions;
│   │   │                            # rescheduler (minimal-move repair, conflict reports, move
│   │   │                            # suggestions), placement checks, session explanations
│   │   ├── db/                      # native MongoDB driver (no Mongoose): client, collections, indexes, repos/
│   │   ├── services/                # dataset import, reset (+ generation pipeline), settings, timetable
│   │   │                            # generation + versions, view + what-if check, exams, Spectra, bookings,
│   │   │                            # change requests (+ scope, approval), manual placement, assistant,
│   │   │                            # explanations, exports + validator report, reference data, room
│   │   │                            # availability, dashboard, OTP email
│   │   ├── ai/                      # Gemini client, prompt loader, English/Hinglish rule parsers (bookings,
│   │   │                            # assistant intents), fact-checked phrasing of explanations and replies
│   │   ├── auth/                    # JWT session cookie, guards, server-session (getSessionUser), proxy
│   │   │                            # rules, accounts + OTP, rate limits, role labels, demo-user seed
│   │   ├── errors.ts                # ApiError, shared by services and route handlers
│   │   ├── env.ts  dataset.ts  format.ts  redirect.ts (safe post-login redirects)
│   │   └── api-client.ts            # typed fetch wrapper used by the UI
│   ├── config/                      # nav, roles, demo accounts, semantic chip mapping
│   └── proxy.ts                     # auth gate (Next.js 16): page redirects, API 401, cross-origin 403
├── prompts/                         # versioned prompt files
├── scripts/                         # seed.ts, parity.ts, validate.ts, export.ts, ai-eval.ts
├── data/                            # starter-pack cit_public.json + sample_disruption.json
├── exports/                         # schedule.json, schedule_after.json (from the app)
├── CrunchWeek_StarterPack/          # organisers' starter pack (unmodified)
├── docs/
└── AI_USAGE.md  THIRD_PARTY.md  README.md  .env.example
```

Dependency rule: `app → services → (engine | ai | db) → contracts`. The engine imports only `contracts`. ESLint enforces this (`no-restricted-imports` in `eslint.config.mjs`).

Scripts that import server-only modules (database, env) run with `npx tsx --conditions=react-server scripts/<name>.ts`.

## Documentation

| Doc                                                    | Contents                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)           | System design, data contracts, MongoDB schema, API catalogue, RBAC                 |
| [docs/project-status.md](docs/project-status.md)       | Plain-language status: what works, what to fix, what's next (frontend and backend) |
| [docs/integration-guide.md](docs/integration-guide.md) | Step-by-step guide for wiring the screens to the API                               |
| [docs/api.md](docs/api.md)                             | API reference for the implemented routes, with example responses                   |
| [docs/backend.md](docs/backend.md)                     | Features, algorithms, dataset traps, AI layer                                      |
| [docs/frontend.md](docs/frontend.md)                   | Design system, screens, components, responsive and state handling                  |
| [AI_USAGE.md](AI_USAGE.md)                             | AI in the product, AI tools used, prompts, what the LLM may not do                 |
| [THIRD_PARTY.md](THIRD_PARTY.md)                       | Libraries, components, fonts, services and data used                               |

## Known limitations

- Deployment: <https://iitb-hackathon-ten.vercel.app>.
- Done so far (backend): sign-in, sign-up and roles; dataset import and reset; timetable and room views; what-if checks; dashboard; settings; timetable generation (with live progress), version activation, exam scheduling, Spectra decisions, the `schedule.json` export and the in-app validator report; plain-language booking (English/Hinglish), booking submit/list/cancel and approvals; change requests with rescheduling and approval, manual placement, the assistant, explanations and the `schedule_after.json` / `disruption.json` exports ([docs/api.md](docs/api.md)). Every one of these is wired into the app's screens.
- A club account can't open its own society's request from the dataset file (e.g. Dramatics Society's BR-07) in the booking detail or its "why?" explanation: dataset requests are visible to admins only. Its live requests work, and the Spectra board shows every dataset decision with its reason.
- After a dataset **import**, no timetable is generated automatically: run `POST /api/timetable/generate` with `{"activate": true}` and `POST /api/exams/generate` (a reset does all of this).
- AI features run only with a `GEMINI_API_KEY` (plus `LLM_ENABLED` and the admin's toggle); without one, the rule parsers and template explanations are used, and `npm run ai-eval` measures the rule parsers only: 97.5 % of booking fields on the dataset's texts (the 3 misses are values the text doesn't state, BR-04 and BR-09; 92.5 % if room types must match the dataset's list exactly rather than overlap), 48/48 booking sample and adversarial cases, and 63/63 assistant messages (208/208 field checks; these were written alongside the rule parser, so they aren't an independent measure); Gemini is not measured ([docs/backend.md §5](docs/backend.md)).
- A booking write re-runs Spectra; if saving the decisions fails midway, they can be left half-saved (`POST /api/spectra/run` fixes it). The very first timetable activation, with no earlier version to go back to, can likewise leave the new version without decisions if its save fails; the export refuses until Spectra is re-run. Change approvals and later activations restore everything they changed.
- Live booking requests are decided together with the dataset's, so they can change which rooms dataset requests get in `schedule.json`; reset before producing the final export (a reset clears live requests).
- Live drag-and-drop checks run on the server (`POST /api/timetable/check`); the in-browser Web Worker copy of the engine shown in the diagram is planned.
- Google sign-in isn't available: `/api/auth/google` always redirects back to `/login?error=google_unavailable` (no callback yet). Use the demo accounts.
- Sign-up email needs `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`. Without them, local development prints the code in the server console (it never appears in a response) and production answers 503.
- Rate limits (sign-in, demo sign-in, sign-up, verification codes, schedule runs, booking and change requests, the assistant and explanations) and the explanation cache are kept in memory per server instance: they reset on restart and each serverless instance counts separately. Client IPs are read from `X-Forwarded-For` only on Vercel; elsewhere all callers share one per-IP counter.

## Team

| Area                  | Owns                                                               | Member           |
| --------------------- | ------------------------------------------------------------------ | ------           |
| Engine                | Constraint checker, solver, exam scheduler, rescheduler, optimiser | Lakshay Sudhera  |
| Backend and AI        | Database, auth and RBAC, services, API, booking engine, AI layer   | Aryan Sinha      |
| Frontend and delivery | UI, design system, deployment, docs, demo video                    | Yash Pandey      |
