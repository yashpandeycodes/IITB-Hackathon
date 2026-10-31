# Frontend Handoff

> For the frontend teammates. The backend is being built phase by phase on the `Aryan` branch. Phases 2–3 are done (engine checker, data layer, auth, read APIs; timetable generation, exams, Spectra decisions, export and the validator report); bookings, the AI layer and rescheduling come in Phases 4–5. This page lists what the backend provides now and the items found in review that live in frontend files. The end-of-Phase-3 review of the merged frontend (what's wired, what's fake, what to fix first) is in [project-status.md](./project-status.md). API details: [api.md](./api.md). Data shapes: `src/lib/contracts` (import types from `@/lib/contracts`).

## Working on the shared layout

- All code lives under `src/` (`src/app`, `src/components`, `src/lib`). A root-level `app/` folder makes Next.js ignore `src/app` entirely, so please don't recreate `app/`, `components/` or `lib/` at the repo root; branch from the latest `Aryan`/`main` that has the `src/` layout.
- Style changes go in the top (CIT Nexus) block of `src/app/globals.css`. The block at the bottom maps the app-area component tokens (shadcn + status/category colours) onto the palette; it still uses the previous navy/cyan values and should be re-mapped to the current purple/neon palette.
- `src/lib/utils.ts` exports a class-merging `cn` (a superset of a plain string joiner) — please don't recreate a separate one.
- Merged files are excluded from Prettier (`.prettierignore`) so they keep merging cleanly; format them together once the branches converge.

## Backend endpoints you can use now

_As of Phase 3 (auth, data, read views, generation, exams, Spectra, export). Request/response shapes and examples: [api.md](./api.md)._

| UI | Endpoint | Notes |
|---|---|---|
| Demo-account cards on `/login` | `POST /api/auth/demo-login` `{"role":"admin"}` | Role value or label (`"Faculty"`). Sets the session cookie; then go to `/dashboard`. |
| Email + password sign-in | `POST /api/auth/login` | `403` with `requiresOtp: true` → show the OTP step on the same page (a code was just sent and this browser now holds the verification cookie). |
| Sign-up + OTP | `POST /api/auth/signup` → `/verify-otp` (`/resend-otp`) | Club Representative only. The OTP step must stay in the same browser. In local dev without a mail key the code is printed to the server console (`[dev] OTP for …`); responses never contain it. |
| Current user (app shell, user menu, role badge) | `GET /api/auth/me` | `data` = `User`; `401` when signed out. |
| Sign out | `POST /api/auth/logout` | POST only (`logout-button.tsx` already does this). |
| Dashboard KPIs, pending approvals, room-utilisation heat map | `GET /api/dashboard` | Role-aware. Counts are 0 and version fields `null` before a timetable is generated. |
| Timetable grids (group / faculty / room; Regular / Spectra) | `GET /api/timetable?view=group&id=CSE-2&week=regular` | `version_id: null` + empty `cells` until a timetable is generated (a reset generates and activates one): show the empty state, not an error. Unknown id → `404`. |
| Live check while dragging a session | `POST /api/timetable/check` `{"assignments":[…]}` | Returns `violations` + `soft_penalty` for the merged timetable and `soft_delta` against the active one (`null` until there is one); nothing is saved. |
| Find a room | `GET /api/rooms/available?day=THU&from_period=10&to_period=12&min_capacity=150&needs=stage` | Week-7 picture. `use` defaults to `event` (pass `use=lab` etc. for other purposes). Free rooms first; `busy_with` says what holds each busy one. |
| Admin › Reset demo data | `POST /api/admin/reset` (optional `{"from":"stored"}` to keep the last upload) | Admin only. Loads the bundled dataset by default; returns counts per collection. `409 CONFLICT` while another reset, import or schedule run holds the lock. |
| Admin › Load dataset | `POST /api/admin/dataset` with the file's text as the JSON body | Admin only, ≤ 2 MB. On `400`, list `error.details.issues` (`{ path, message }`, incl. unknown ids); `409` while a reset, import or schedule run holds the lock. |
| Admin › Settings (priority order, LLM toggle, reference date, seed) | `GET /api/settings` · `PATCH /api/settings` | GET for any role; PATCH admin only, any subset of fields. |
| Status indicator | `GET /api/health` | Public; `db: "up" \| "down"`. |
| Admin › **Generate timetable** (with a live progress bar) | `POST /api/timetable/generate` `{"activate":true}` with `Accept: text/event-stream` | Admin only. Read the body with `fetch` + `response.body.getReader()` (not `EventSource`, which can't POST). Frames: `event: progress` (`SolverProgress`: `phase`, `iteration`, `hard`, `soft`, `fest`, `best`, `ms`) many times, then one `event: result` (`GenerateTimetableResult`) or `event: error` (`{code, message}`). Without the header it returns the normal JSON envelope. `409` while another run/reset holds the lock; `422 INFEASIBLE` if sessions can't all be placed. Takes a few seconds. |
| Admin › Timetable versions (history, activate) | `GET /api/timetable/versions` · `POST /api/timetable/versions/{id}/activate` | Admin only. The list has no assignments (`assignment_count` instead). Activation re-checks the version and re-runs Spectra decisions; it returns `{version, spectra}` (booking score, approved/alternatives/rejected counts). `409 STALE_VERSION` if the version belongs to another dataset. |
| Exams page | `GET /api/exams` (any role) · `POST /api/exams/generate` (admin) | `data` = the active `ExamSchedule` (`exams[]`: `{exam_id, day, session: "AM"\|"PM", rooms[]}`, `penalty`) or `null` before one exists. Reset generates one automatically. |
| Spectra › **Run decisions** | `POST /api/spectra/run` | Admin only. Re-decides every Week-7 request against the active timetable. `data` = summary (`booking_score` / `booking_score_max_if_all_approved`, counts, `priority_inversions`) + `decisions[]` (each with `status`, slot, `reason`, `reason_code`, `effective_category`, `category_capped` → show a "category capped" badge, `requires_admin_approval`) + `overrides[]` (sessions moved for Week 7). `404` before a timetable exists. The Spectra-week timetable view (`week=spectra`) already shows the results. |
| Admin › **Export schedule.json** | `GET /api/export?file=schedule` | Admin only. The response is the file (`content-disposition: attachment`). Check `GET /api/validate` first and only enable the download link when `hard_violation_count === 0`; otherwise the export answers `409 HARD_CONSTRAINT` (or `409 CONFLICT` if Spectra decisions are missing) and you should show the validator panel. |
| Admin › **Validator report** panel | `GET /api/validate` | Admin only. `data` = `ValidatorReport`, the same sections as the official `validator.py`: `hard_violation_count`, `hard_by_rule`, `hard_violations[]` (`rule`, `where`, `detail`), `soft_penalties` S1–S6 + `soft_total`, `bookings` (score, max, approved/alternatives/rejected, `priority_inversions`), `exam_soft_penalty`, `warnings[]`. |

**Auth notes for the UI**

- **Role values vs labels.** `data.role` is always the value (`admin`, `department_coordinator`, `faculty`, `club`); compare on that. The legacy `user.role` field in login / verify-otp / me is the label (`Admin`, `Department Coordinator`, `Faculty`, `Club Representative`). Show labels from one place (`src/config/roles.ts`).
- **`me` shape.** `{ ok: true, data: User, authenticated: true, user: { id, name, email, role: label, isVerified } }`; signed out: `401 { ok: false, error: { code, message }, authenticated: false, user: null }`.
- **Two error shapes.** Login, signup, verify-otp and resend-otp return `{ ok: false, error: "message", code }` (the forms already read `data.error`). Every other route returns `{ ok: false, error: { code, message, details? } }`; use `apiGet` / `apiPost` / `apiPatch` from `src/lib/api-client.ts`, which throws `ApiClientError` with `code`, `status` and `details`.
- **Sessions last 12 h** and logout revokes the token. Any `401` from `/api/*` means the session is gone: send the user to `/login?redirect=<current path>`.
- **Pages are gated.** Signed-out visits to the role pages and the 8 app pages (`/timetable`, `/rooms`, `/bookings`, `/spectra`, `/approvals`, `/changes`, `/assistant`, `/exams`) redirect to `/login?redirect=…`, so the app shell can rely on a session being present.
- **Same origin only.** The backend rejects cross-origin POST / PATCH / DELETE (`403`), so always call relative `/api/...` paths.
- **Sign-up is Club Representative only.** Faculty gets `403` ("Faculty accounts are set up by the Dean's office…"), Admin and Department Coordinator too. Hide all three in the role picker (`signup-form.tsx` currently defaults to Faculty).
- **Keep the OTP step in the same browser.** Sign-up (and sign-in to an unverified account) sets an httpOnly verification cookie that `verify-otp` and `resend-otp` require; another browser gets `400`, and a second sign-up for the same email from elsewhere gets `409 CONFLICT` while the code is active.
- **Google sign-in isn't available.** `/api/auth/google` always redirects to `/login?error=google_unavailable`. Hide the button (`login-form.tsx` links to it) or show a message when that query parameter is present.
- **Downloads.** A plain `<a href="/api/export?file=schedule" download>` works (the browser sends the session cookie), but it can't see an error status: call `GET /api/validate` first and enable the link only when `hard_violation_count === 0`, or `fetch` the export and save the blob.
- **Schedule runs are rate-limited.** Generate, activate, exam generation and Spectra share a quota (30 per admin per 10 minutes): show the `429` message and disable the buttons while a run is in progress.
- **After a reset the app has data.** `POST /api/admin/reset` now generates and activates a timetable, schedules exams and runs Spectra (a few seconds), so the timetable grids, dashboard and Spectra views are populated straight away. Show a spinner on the reset button.
- **App shell role.** `src/components/layout/app-shell.tsx` defaults to role "Admin" and the name "Dr. Rajesh Verma", and most pages pass nothing; read the user once from `GET /api/auth/me` (or the session on the server, in one shared layout) and pass it down. Full review: [project-status.md](./project-status.md).

## Items in frontend files (found in review)

> Also from the Phase 2 architecture review: `src/lib/validation.ts` imports `./db/models/user.model` by relative path (a type-only shim kept for it) — import the label type from `@/lib/auth/roles` or the `Role` value from `@/lib/contracts`, and reuse the auth request schemas in `src/lib/contracts/auth.ts` instead of duplicating sign-up/login rules. The role pages (`src/app/{admin,club,coordinator,dashboard,faculty}/page.tsx`) only verify the cookie's signature, so a signed-out (revoked) token still renders them — fetch `GET /api/auth/me` (which checks revocation) before showing user data; all data stays behind the API guards either way.

| Priority | Where | What to change |
|---|---|---|
| **Must (judges)** | `src/components/auth/login-form.tsx`, `src/app/login/page.tsx` | Add **one-click demo-account cards** for the 4 roles (Admin, Dept coordinator, Faculty, Club rep) calling `POST /api/auth/demo-login {"role": …}`; after success go to `/dashboard`. The hackathon requires demo accounts for all four roles on the deployed link. Copy: "Sign in" (not "Validate & Sign In (Demo)"), placeholder `admin@cit.demo`, footer "Demo accounts are listed in the README". |
| **Must (security)** | `login-form.tsx`, `signup-form.tsx` | Add `method="post"` to the `<form>` elements so a submit before hydration can't put the password in the URL. |
| **Must (compliance)** | `src/app/signup/*`, landing "Get started" links (hero, navbar, final CTA, footer) | Judges use the demo accounts. Point "Get started" to `/login`. Sign-up may only request Club Representative accounts (the API rejects Faculty, Admin and Coordinator); consider turning the page into "Use a demo account". Role picker: `role="radiogroup"` with `aria-checked` on options. |
| **Must (disqualification risk)** | landing hero, product preview, `src/lib/mock-data.ts` | Hard-coded figures (e.g. "68 campus spaces", "1420 sessions", "0 clashes", "99.8%", "1.4s", "+24.5%") contradict the dataset (27 rooms, 189 sessions) and could look like results. Compute them from real data (the backend exposes dataset/engine numbers) or label them "Illustrative". Never present them as results in the video. |
| Should | landing AI copy (`validation-principle.tsx`, `platform-modules.tsx`) | "AI suggests venues" → the constraint engine assigns venues; the AI only drafts the request. Trim claims the system doesn't make (fire codes, door locks, unsourced percentages). |
| Should | user menu / logout | Sign out must be a POST (`POST /api/auth/logout`), not a link to `/login`. |
| Should | role labels | Store/compare the contracts `Role` values (`admin`, `department_coordinator`, `faculty`, `club`); show labels from one place (`src/config/roles.ts`). |
| Should | `src/lib/mock-data.ts` | Rename exported types with a `Landing*` prefix (its `BookingRequest` clashes with the contracts type) and keep it landing-only (ESLint already blocks it elsewhere). |
| Should | login inputs | `text-base sm:text-xs` (stops iOS zoom), placeholder/footer contrast ≥ 4.5:1, input borders ≥ 3:1. |
| Could | `PROGRESS.md` | Update the "no backend" scope note and replace `file:///c:/…` links with relative `src/…` paths. |
| Team | `AI_USAGE.md` | If an AI tool helped build the landing/auth UI, add it to §2 (undeclared AI use costs 10 marks). |
