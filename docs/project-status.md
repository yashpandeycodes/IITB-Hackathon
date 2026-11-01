# Project status

> **Written:** 31 Oct 2026, at the end of backend Phase 3, right after merging the frontend team's latest `main` into `Aryan`. **Updated:** after the integration-support step (B1–B4, client helpers, [integration-guide.md](./integration-guide.md)), after Phase 4 (AI booking parser, bookings API) and after Phase 5 (rescheduling, change requests and approvals, assistant, explanations, `schedule_after.json`, and the fixes from its review; 1 Nov 2026). The frontend review in §5 is from the end of Phase 3.
>
> **For:** the whole team (Aryan on backend; Yash and Lakshay on frontend; **Lakshay owns wiring the screens to the API**).
>
> **What it covers:** what works, what is broken, and what is left to build, in plain words.
>
> **Where the details live:**
> - endpoints: [api.md](./api.md)
> - frontend checklist: [frontend-handoff.md](./frontend-handoff.md)
> - design: [architecture.md](./architecture.md)
>
> **Legend:**
> - ✅ done and works
> - 🟡 partly done, or looks done but isn't connected
> - ❌ not started
> - **Must** = could cost marks or get us disqualified
> - **Should** = clearly better
> - **Could** = nice to have

---

## 1. The short version

- **The backend works and proves it.**
  - The app generates the full timetable, the midsem exam schedule and every Spectra (Week-7) venue decision.
  - It also exports `schedule.json`.
  - The organisers' own `validator.py` gives that file **0 hard violations**, a **soft penalty of 3** (the lowest possible for this data), a **booking score of 67/70** (the highest possible) and an **exam penalty of 0**.
  - **Phase 5:** after the sample disruption is applied, the app's `schedule_after.json` also gets 0 hard violations, soft 3, 67/70 and exam 0, with **9 sessions moved, all room-only** (the fewest possible).
- **The frontend looks great but is mostly a mock-up.**
  - Only sign-in, sign-up and sign-out talk to the backend. No screen uses the API client (`src/lib/api-client.ts`).
  - Instead they show hand-written sample data from `src/lib/dataset/cit-data.ts`, which doesn't match the real dataset:
    - 9 of its 27 room ids don't exist;
    - it has 12 sessions instead of 189 and 7 exams instead of 41.
  - The Generate, Reset and Export buttons are animations or `alert()` boxes.
  - **The Export button downloads a made-up file that would fail the validator.**
- **The screens show numbers that contradict our real results.** For example soft penalty 48 (real: 3) and booking score 64/70 (real: 67/70). The hackathon rules treat hard-coded "results" as a disqualification risk, so this is the most urgent fix.
- **Everyone sees the Admin menu:** most pages don't pass the signed-in user to the app shell.
- **Who does the wiring:** Lakshay, with [integration-guide.md](./integration-guide.md).
- **Top jobs for the next session:**
  1. **Frontend:** connect the admin page (generate, reset, export, validator report), the timetable, rooms, exams and Spectra screens to the API.
  2. **Frontend:** delete every invented number and claim.
  3. **Frontend:** make the app shell use the real signed-in user.
  4. **Backend:** ✅ done since this review: the four small endpoints the frontend needs (§4.2), the booking API (Phase 4), and change requests, the assistant and explanations (Phase 5).
- **Team chores:**
  - Change a leaked database password (in git history).
  - Confirm our team name.
  - Declare AI tool use.
  - Decide whether the organiser zip/PDF/image stay in git.

---

## 2. Where each feature stands

| Feature | Backend | Frontend | In one line |
|---|:-:|:-:|---|
| Sign in, sign out, demo accounts (4 roles) | ✅ | 🟡 | Login and demo cards work. The app shell then ignores who you are and shows Admin. |
| Club sign-up with emailed code | ✅ | 🟡 | Works. The page still offers Faculty/Admin/Coordinator, which the API refuses, and "Resend code" doesn't call the API. |
| Reset demo data | ✅ | 🟡 | The API resets and regenerates everything in about 1 s. The button only shows `alert()`. |
| Generate timetable (with live progress) | ✅ | 🟡 | The API streams real progress. The screen plays a scripted animation. |
| Timetable views (group / faculty / room, regular / Week 7) | ✅ | 🟡 | The API serves every view. The screen shows the same ~20 sample cells for every choice and has no faculty view. |
| Find a room | ✅ | 🟡 | The API filters by day, time, size and features. The screen filters sample rooms. |
| Midsem exams | ✅ | 🟡 | The API schedules all 41 exams with penalty 0. The screen shows sample exams. |
| Spectra (Week-7) decisions | ✅ | 🟡 | The API decides all 25 requests with reasons. The screen shows sample decisions and wrong totals. |
| Export `schedule.json` + validator report | ✅ | 🟡 | The API export passes `validator.py`. **The button builds a fake file.** |
| Dashboard | ✅ | 🟡 | The API returns real counts and utilisation. The screen shows invented numbers. |
| Plain-language (English/Hinglish) booking + manual form | ✅ | 🟡 | `POST /api/bookings/parse` + the bookings API work (AI off too). The screen still fakes parsing and always says "Approved". |
| Change requests, approvals, rescheduling | ✅ | 🟡 | The API files change files and requests, shows the diff (fewest moves) or why no fix exists, and applies on an admin's approval. The screens still flip local state and claim "applied, everyone notified". |
| Manual placement | ✅ | 🟡 | `POST /api/manual/place` checks the slot (or moves what's in the way) and files it for approval. |
| Faculty assistant and "why?" explanations | ✅ | 🟡 | The API answers with engine-verified options (AI off too). The screens show canned replies marked "Verified by constraint engine". |
| `schedule_after.json` (after the sample disruption) | ✅ | 🟡 | The API export passes `validator.py` (9 moved, 0 hard). The button downloads `{updated: true}`. |
| Deployment (Vercel + Atlas) and final docs | ❌ (Phase 6) | — | |

---

## 3. Results we can show the judges

Produced by the app (`npm run export`) and checked with the organisers' unmodified `validator.py` (`npm run validate`):

```text
Hard violations: 0
Soft penalty: 3   (S4 = 3; S1, S2, S3, S5, S6 = 0)
Bookings: score 67 / 70 | approved 22, alternatives 1, rejected 2, session moves 0, priority inversions 0
Exam soft penalty: 0
```

**What the numbers mean:**

- **Hard violations = 0.** No clashes, no room too small, nobody teaching when unavailable. This is what "valid timetable" means.
- **Soft penalty = 3.** The lowest possible: one teacher (F08) can only teach on Tuesday and Thursday but has three CS204 lectures, so two of them must share a day.
- **Booking score = 67/70.** The highest possible:
  - BR-09 asks for 1,200 seats, but the biggest venue holds 800.
  - BR-17 asks for a slot that ends after 10 pm, so it can only be offered another time.
- **Exam penalty = 0.** No group has two exams on the same day.

Generating takes about 25 ms, and the same seed always gives the same timetable.

**After the sample disruption** (`data/sample_disruption.json`: F07 away on Mondays, room CR-102 closed all week, one extra CS202 tutorial), filed and approved in the app, then exported with `npm run export -- --after` and checked with `npm run validate -- --after`:

```text
Hard violations: 0
Soft penalty: 3   (unchanged)
Bookings: score 67 / 70 | approved 22, alternatives 1, rejected 2, session moves 0, priority inversions 0
Exam soft penalty: 0
Stability: 9 sessions moved (0 changed time, 9 room only)
```

- **9 moved is the fewest possible:** all 9 classes held in CR-102 have to leave it, and each one keeps its time and only changes room. F07 has no Monday class, so that change moves nothing. The new tutorial goes to Monday P7 in CR-103.
- `schedule.json` stays exactly the file from before the change (the "baseline" the validator compares with); `schedule_after.json` is the timetable after it.
- The rescheduler takes tens of milliseconds (38 ms in the live test).

---

## 4. Backend (Aryan)

### 4.1 Done

- **Constraint checker.** A line-by-line TypeScript copy of `validator.py`, proved identical on 78 test schedules (`npm run parity`).
- **Timetable generator.**
  - How it works: it places every class, repairs clashes, then polishes the soft penalty.
  - It is "fest-aware": it keeps the auditorium, labs and compulsory groups free where Week-7 events need them, so no class has to move for Spectra.
- **Exam scheduler.** All 41 exams, at most one per group per day, rooms filled at half capacity.
- **Spectra decision engine.**
  - Order: requests are ranked by priority, then by submission time.
  - Rooms: it picks the best-fitting room inside the requested window.
  - Displacement: institute events may move a class for Week 7 only.
  - Fallbacks: it offers an alternative time outside the window, or rejects with a specific reason.
  - It double-checks itself with the validator copy.
- **API.**
  - Auth and roles.
  - Dataset import and reset.
  - Timetable views and what-if check.
  - Room finder and dashboard.
  - Generate (with a live progress stream), version history and activation.
  - Exams, Spectra run, export (refuses invalid files) and the in-app validator report.
- **Safety.**
  - Every admin action is admin-only.
  - Schedule runs are rate-limited and can't overlap (dataset lock).
  - Old versions are pruned.
  - Every action is written to an audit log.
- **Plain-language booking (Phase 4).** English and Hinglish requests become an editable draft with assumption chips and one follow-up question. Gemini does it when switched on (with a key); otherwise an offline rule parser does, scoring 97.5 % on the dataset's own request texts. The category always comes from the requester's role, never from the text. Every parse is logged (`ai_logs`).
- **Bookings API (Phase 4).** Submit, list, detail with an explanation, cancel, and approve or reject. Department-lab bookings wait for that department's coordinator; bookings that move a class wait for an admin; nobody approves their own request. A higher-priority booking can move an earlier one, and the move is reported.
- **Rescheduling and change requests (Phase 5).**
  - Change files, faculty unavailability, faculty requests (move a session, an extra session) and manual placements all become change requests.
  - The rescheduler keeps every class whose slot still works and moves only the broken ones, with the fewest moves: another room at the same time first, then another time, then short chains that move one class out of the way (up to 3 deep).
  - Each request shows its exact diff (what moved, from where to where, and why) and the validator's moved / time / room-only counts; an impossible change gets a report saying which rules conflict.
  - An admin approves: the server checks it again from scratch, writes the change into the data and switches to the new timetable in one step. It is all or nothing: if any step fails, everything is put back and the request stays pending. Other pending requests are then closed as "superseded" (they were built on the old timetable), and so are all pending requests when an admin switches timetables by hand; a request built on an old timetable is refused ("stale").
  - The first approval saves `schedule.json` as the "before" file, so it is refused until that file is exportable (exams scheduled, every Spectra request decided).
  - After the first applied change, each new proposal also shows `baseline_stability`: its moves counted against `schedule.json`, which is what the validator reports for `schedule_after.json`.
  - Only an admin approves, and requests (faculty, coordinator and assistant requests) are never approved by their requester; coordinators and faculty can file and withdraw. Change files and manual edits are the Admin's own actions, so the admin approves those after reviewing the diff; they still stop at `pending` until then.
  - Tested by a seeded fuzz of 150 random change lists (148 fixable, 2 impossible with a report; each under 100 ms), a basket fuzz against a small exhaustive search, and an audit script that compared it with the official validator on 70 random cases: 0 mismatches in the moved counts. The audit's three basket cases now take the fewest possible moves (2, 4 and 6 instead of 3, 6 and 7).
  - Requests are size-checked before anything runs (ids, text, list lengths, nesting, field names), so nobody can store huge or odd values; each user may have at most 20 open (pending or infeasible) requests.
- **Assistant and explanations (Phase 5).**
  - Faculty, coordinators and admins can ask in English or Hinglish to move a session, mark when they're away, add an extra session, or ask why a session is where it is.
  - The AI (or the offline rule parser) only reads the request; code finds the session among the asker's own, and the engine computes every option. Submitting an option files a normal change request for the admin.
  - "Why?" explanations for any session, booking or change, built from the engine's facts (AI can only reword session and booking explanations, and only if every id and number checks out; a change's explanation is always the template).
  - The offline rule parser reads Hinglish times like "2 baje ke baad" and "12 baje tak", short Hindi day names ("mangal ko"), "le jao", someone else's absence ("F07 kal nahi aayenge") and lists of periods.
  - 63/63 test messages (208/208 field checks) read correctly by the rule parser (written alongside it, so not an independent measure).
- **Exports (Phase 5).** `schedule_after.json`, and `disruption.json` (all applied changes in order). `npm run export -- --after` downloads the first, `npm run export -- --disruption` the second.
- **Quality.**
  - 1297 automated tests pass (1 skipped); the parity check matches the official validator on all 78 cases.
  - CI runs lint, typecheck, tests, build, the parity check and the validator.

### 4.2 Needs fixing

**Done right after this review (integration support):** the four small additions the frontend review asked for are built, tested and documented in [api.md](./api.md); the step-by-step wiring guide is [integration-guide.md](./integration-guide.md).

| # | Added | What the frontend gets |
|---|---|---|
| B1 ✅ | `GET /api/reference`: calendar, rooms (name, type, capacity, features, accessible), room maintenance, faculty names, student groups, course titles, sessions, exams, Week-7 request details | Labels, pickers and request details for every screen (replaces the sample file). |
| B2 ✅ | `GET /api/spectra`: stored decisions, overrides and the booking score, readable by every role | The Spectra board for clubs, faculty and coordinators too. |
| B3 ✅ | Booking score on `GET /api/dashboard` | A real number for the dashboard's Spectra card. |
| B4 ✅ | `getSessionUser()` (`@/lib/auth/server-session`): the signed-in user for server layouts, with the logout check; plus `GET /api/auth/session-expired` for rejected sessions | One server layout fixes the "everyone sees Admin" bug without redirect loops. |

**Then, small and known, none urgent:**

- **Done in Phase 4 (was listed here):** live requests are decided together with the dataset's (decisions are re-computed for all requests each run), an admin's own request is never auto-approved by their run, and request states update on every run.
- **Tidy-ups found in review:**
  - a few duplicated helpers;
  - the progress-stream code could be shared for Phase 5;
  - one shared "seed" schema;
  - `GET /api/exams` shows internal fields to every role;
  - the audit log has no size cap (the rate limit keeps it small for now).
- **Carried over:**
  - Role checks should refuse a faculty/coordinator account whose link is missing (done for change requests and the assistant).
  - The import report should warn when a demo account's link isn't in an uploaded dataset.
- **Open after Phase 5:**
  - A club account can't open its own society's request from the dataset file (e.g. Dramatics Society's BR-07) through `GET /api/bookings/:id` or the "why?" button: dataset requests are admin-only since Phase 4. Its own live requests work.
  - The assistant's 63 test messages were written alongside the rule parser, and Gemini isn't measured (no key), so the assistant's accuracy isn't independently measured yet.
  - `ChangeStatus` still lists `proposing` and `approved`, which are never stored (a proposal is computed before it is saved; approval applies it at once).
  - Rate limits and the explanation cache live in memory per server instance (reset on restart, counted per serverless instance).
  - A booking write re-runs Spectra; if the save fails midway, the decisions can be left half-saved (Phase 4 leftover; re-run Spectra to fix). Timetable activation and change approval already restore what they changed.
  - The very first activation (no previous version to go back to) can leave the new version active without decisions if its save fails; the export refuses until Spectra is re-run (`POST /api/spectra/run`).

### 4.3 Still to build

| Phase | What | What it means for the frontend |
|---|---|---|
| **4: AI + bookings** ✅ done | Gemini adapter with a rule-based fallback (English + Hinglish; 97.5 % on the dataset texts without AI), `POST /api/bookings/parse`, bookings submit/list/detail/cancel/decide with approvals and bump notices, `ai_logs`, `npm run ai-eval` | The booking page and the booking approvals can be wired now ([integration-guide.md](./integration-guide.md) §2). |
| **5: Changes + assistant** ✅ done | Rescheduler (fewest moves; says *why* when impossible), change requests, approve/reject, manual placement, faculty unavailability, assistant (`POST /api/assistant`), "why?" explanations (`POST /api/explain`), `schedule_after.json` and `disruption.json` | The approvals, changes and assistant pages can be wired now ([integration-guide.md](./integration-guide.md) §2); the validator panel gets a "moved sessions" count (`GET /api/validate?file=schedule_after`). |
| **6: Hardening + delivery** | Load and time tuning for Vercel, end-to-end smoke script, deployment guide, final README and docs | The deployed link with all 4 demo accounts. |

---

## 5. Frontend (Yash and Lakshay)

### 5.1 What's good

- **Design and coverage:** a strong visual identity, every planned screen exists, and the navigation matches the design doc.
- **Judge paths:** each judge path is at most 3 clicks (demo card → dashboard → task).
- **Mobile timetable:** day tabs plus an agenda list with a lunch divider.
- **Status chips:** they always pair colour with an icon and text.
- **Auth:** demo-account cards, sign-in, OTP and sign-out talk to the real API.
- **Ready but unused:** the token-based shell (`AppSidebar` / `AppTopbar` / `MobileTabBar`) and chips (`StatusBadge` / `CategoryChip` / `KindChip`).

### 5.2 Must fix before judging

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | **Export downloads a fake file** (sample sessions + a timestamp; `schedule_after.json` is `{updated:true}`) | `src/app/admin/page.tsx` (~327–362) | Use `<a href={EXPORT_SCHEDULE_URL} download>` and enable it only when `canExport()` (both in `@/lib/api-client`) returns `ok`. For `schedule_after.json` use `EXPORT_SCHEDULE_AFTER_URL` with `canExport("schedule_after")` (available once an admin has approved a change; Phase 5). |
| 2 | **Admin buttons are fake.** Generate is three `setTimeout`s. Reset, exams and Spectra are `alert()`/`confirm()`. The validator tab always shows "0 violations ✓", with the wrong rule names (the real H1 is "not scheduled", H5 is "capacity"). The page claims a "CP-SAT … Optimal" solver we don't use. | `src/app/admin/page.tsx` | Call `POST /api/timetable/generate` (read the progress stream), `POST /api/admin/reset`, `POST /api/exams/generate`, `POST /api/spectra/run` and `GET /api/validate`. Describe the solver as "greedy + repair + simulated annealing". |
| 3 | **Invented numbers that contradict our results**: soft 48, 64/70, 21/2/2, "91.4%", "verified 4 mins ago", a random heat map, "48 pts (Optimal)" on login | `src/app/dashboard/page.tsx`, `src/app/spectra/page.tsx`, `src/components/auth/auth-side-panel.tsx` | Read `GET /api/dashboard`, `GET /api/validate` and the Spectra summary. Show "—" or a skeleton until loaded, never a made-up number. |
| 4 | **Everyone sees the Admin menu** and the name "Dr. Rajesh Verma": most pages don't pass the user to the shell; the approvals badge is always "3" | `src/components/layout/app-shell.tsx` | One `(app)` route-group layout that calls `getSessionUser()` and passes the user down (integration guide §1.2). Delete the defaults. Compare role *values* (`admin`, `faculty`…); show labels from `src/config/roles.ts`. |
| 4b | **Demo-account cards use the sample file**: wrong emails and names; an error shows "[object Object]"; after login the `?redirect=` target is ignored | `src/components/auth/login-form.tsx` | Use `DEMO_ACCOUNTS` from `src/config/demo-accounts.ts`. Show `data.error?.message ?? data.error`. Go to `redirect` when present. |
| 5 | **Timetable ignores what you pick**: same sample cells for every group or room, no faculty option, faculty don't land on their own timetable | `src/app/timetable/[view]/[id]/page.tsx` | `GET /api/timetable?view=…&id=…&week=…`. Add a picker over all groups, faculty and rooms; faculty go to `/timetable/faculty/<their id>`. Show an empty state when `version_id` is null. |
| 6 | **Rooms, exams, Spectra read sample data** | `src/app/{rooms,exams,spectra}/page.tsx` | `GET /api/rooms/available`, `GET /api/exams`, `GET /api/spectra` (every role; admins re-run with `POST /api/spectra/run`) plus the `week=spectra` timetable view; names from `GET /api/reference`. |
| 7 | **Screens for features that don't exist yet claim success**: booking always "Approved", approvals say "applied… notified", the assistant says "Verified by constraint engine" | `src/app/bookings/new`, `src/app/approvals/[id]`, `src/app/assistant` | Wire them to the real endpoints (bookings since Phase 4; changes, approvals and the assistant since Phase 5; integration guide §2). Until a screen is wired: a visible "Preview, not connected yet" banner, and no fake decisions or claims. |
| 8 | **Marketing claims that are false**: "no databases/solver/sessions active", "68 campus spaces" (we have 27), "TLS 1.3 secure enclave", unsourced percentages | `src/components/landing/{footer,hero,problem-section}.tsx`, `src/app/login/page.tsx` | Delete them, or replace with dataset facts (189 sessions · 27 rooms · 25 requests). Label demo sections "Illustrative". |
| 9 | **No loading, empty or error states; toasts never appear** (`Providers` isn't mounted) | `src/app/layout.tsx`, every page | Wrap the app in `<Providers>`. Add `loading.tsx`, plus the existing `EmptyState` / `ErrorState` / `PageSkeleton`. |
| 10 | **Keyboard users can't open anything**: cards and rows are clickable `div`/`tr`; drawers and menus aren't real dialogs | `src/components/timetable/*`, `src/app/spectra`, `app-shell.tsx` | Use `<button>` with an `aria-label`. Use the existing `ui/sheet`, `ui/tabs` and `ui/command`. |
| 11 | **Forms**: no focus rings, labels not linked, unnamed icon buttons; forms lack `method="post"` (a submit before the page loads would put the password in the URL) | `rooms`, `bookings/new`, `admin`, `login-form.tsx`, `signup-form.tsx` | Use the `ui/input`, `ui/select` and `ui/label` components. Add `method="post"`. |
| 12 | **Sign-up offers roles the API refuses** (defaults to Faculty); every landing "Get started" goes to `/signup` | `src/components/auth/signup-form.tsx`, landing links | Club only (or a "use a demo account" page). Point "Get started" to `/login`. |

### 5.3 Should fix

- **One palette and the design tokens.**
  - Pages use 666 hard-coded hex colours, so re-mapping tokens in `globals.css` changes nothing.
  - Switch pages to the token classes and the semantic chips. Pick the purple palette for the app, as planned.
- **Colour meaning.** One colour shouldn't mean two things: green is currently both "approved" and "department event", red both "rejected" and "exam".
- **Accessibility.**
  - Respect "reduce motion" (`<MotionConfig reducedMotion="user">`).
  - Fix the measured low-contrast spots: empty slots, input borders, white text on pink/violet buttons.
  - Use 16 px form text on phones (`text-base sm:text-xs`) so iOS doesn't zoom.
- **Phones.** Bigger bottom-tab targets, and card layouts instead of 6-column tables on Bookings and Spectra.
- **One of each.** There are two app shells and two sets of status chips; pick one of each and delete the other.
  - The unused token-based ones already use the API's values.
  - The live `badges.tsx` says `alternative` and `regular_class`, where the API says `alternative_offered` and `regular_session`.
- **Timetable grid.**
  - It shows one class per slot, so parallel basket electives disappear.
  - It should take the API's `TimetableCell[]` and span by `duration`.
- **⌘K palette.** The shortcut doesn't open it, and it lists admin pages for every role.
- **Sign-up and dashboard.**
  - Sign-up should offer Club only.
  - The landing "Create account" should go to `/login`.
  - The dashboard should be role-aware (a Club rep shouldn't see admin approvals).
- **AI wording.** Use one sentence everywhere: *"AI drafts your request; the constraint engine checks it and picks the room."*
- **Code health.**
  - About 86 lint warnings: unused imports, `any`.
  - A `Date.now()` call during render in the assistant.
  - Very large page files.
  - Two lint rules are temporarily warnings for the merged files (`eslint.config.mjs`); fix them and remove the override.
  - The new pages are excluded from Prettier (`.prettierignore`); format them once the branches settle.

### 5.4 Checklist from the Phase 2 handoff

Of the 11 rows in [frontend-handoff.md](./frontend-handoff.md) › "Items in frontend files", **1 is done** (sign-out is a POST), **3 are partly done** (demo cards, landing figures, `mock-data.ts`), **6 are not done** (`method="post"`, sign-up, AI copy, role values, login input size and contrast, `PROGRESS.md`), and 1 is a team check (`AI_USAGE.md`).

### 5.5 Wire-up list (page → endpoint), available now

| Page | Replace sample data with |
|---|---|
| Admin › Generate | `POST /api/timetable/generate` with `Accept: text/event-stream` (progress frames, then `result`); `{"activate": true}` to make it live |
| Admin › Versions | `GET /api/timetable/versions`, `POST /api/timetable/versions/{id}/activate` |
| Admin › Reset / Load dataset / Settings | `POST /api/admin/reset`, `POST /api/admin/dataset`, `GET`/`PATCH /api/settings` |
| Admin › Validator + Export | `GET /api/validate`; `<a href={EXPORT_SCHEDULE_URL} download>` when `canExport()` is `ok` |
| Dashboard | `GET /api/dashboard` (role-aware) |
| Timetable | `GET /api/timetable?view=group\|faculty\|room&id=…&week=regular\|spectra`; drag-and-drop check `POST /api/timetable/check` |
| Find a room | `GET /api/rooms/available?day=…&from_period=…&to_period=…&min_capacity=…&needs=…` |
| Exams | `GET /api/exams` (admin: `POST /api/exams/generate`) |
| Spectra | `GET /api/spectra` (every role; admins re-run with `POST /api/spectra/run`) and the `week=spectra` timetable view; show `reason`, `reason_code`, and a badge when `category_capped` |
| App shell | `getSessionUser()` in an `(app)` route-group layout (integration guide §1.2); `GET /api/auth/me` from the browser if needed |

Room, faculty and course *names*, pickers and request details come from `GET /api/reference`; Spectra decisions for every role from `GET /api/spectra`.

Request and response shapes, with real examples: [api.md](./api.md). Types: `import type { … } from "@/lib/contracts"`. Mount `<Providers>` first (TanStack Query and toasts), then fetch with `apiGet` / `apiPost`.

### 5.6 Screens whose backend arrived after this review

- **Bookings (live now):** parse, submit, list, detail, cancel and approve: see [integration-guide.md](./integration-guide.md) §2. Keep the manual form working without AI. Never show a decision the server didn't make.
- **Approvals, changes, assistant, explanations (live since Phase 5):** see [integration-guide.md](./integration-guide.md) §2. Use `ChangeRequest`, `MoveDiff` and `ConflictEntry` from `@/lib/contracts` and the helpers in `@/lib/api-client` (`listChanges`, `proposeChange`, `approveChange`, `askAssistant`, `explain`, …). Hide Approve on the user's own requests (the server refuses with `SELF_APPROVAL`); for an admin's own request, show it only when `kind` is `disruption` or `manual_edit`. Show the server's "why not" conflict report when a change is impossible.

---

## 6. Team decisions and chores

| Who | What | Why |
|---|---|---|
| Whoever owns the database | **Change (rotate) the MongoDB Atlas password** whose connection string is in our git history: commit `89ca50c` (`PROGRESS.md`, host `cluster0.citnexus…`, redacted later in `b7be544`) | The repo is public on GitHub. Deleting the file doesn't remove it from history. |
| Team | Confirm our registered team name; set `TEAM_NAME` in `.env`, then reset, export and validate again | The export currently says "CIT Crunch Week" (the event name). Never edit `schedule.json` by hand. |
| Yash, Lakshay | If you used AI tools (ChatGPT, Copilot, Claude…), say so; Aryan adds it to `AI_USAGE.md` §2 | Undeclared AI use costs marks. |
| Team | Decide whether the organiser zip, problem PDF and WhatsApp image stay in git | They're large and not ours. |
| Team | Fill in the Team table in `README.md` | Required README section. |
| Aryan | Open a pull request from `Aryan` into `main` | So the frontend builds on the real backend. |

---

## 7. Suggested order

1. **Lakshay (integration):** items 1–4b of §5.2 (export, admin actions, no fake numbers, real user in the shell, demo cards), following [integration-guide.md](./integration-guide.md). Highest risk, mostly wiring. (The B1–B4 additions he needs are done.)
2. **Lakshay:** items 5–6 (timetable, rooms, exams, Spectra from the API), then 9 (loading/empty/error states). **Yash:** the design and accessibility items (§5.3) on screens Lakshay has wired.
3. **Aryan:** ✅ Phase 4 (AI booking parser + bookings API) is done; **Lakshay** wires the booking page and booking approvals (integration guide §2).
4. **Frontend:** the remaining Musts (preview banners, false claims, keyboard and forms).
5. **Aryan:** ✅ Phase 5 (rescheduling, approvals, assistant, explanations, `schedule_after.json`) is done; **Lakshay** connects those screens (integration guide §2). Aryan re-runs the frontend reviews at each sync and updates this page.
6. **Together:** Phase 6, i.e. deploy, run the smoke test with all 4 demo accounts, final docs and video. Then the §5.3 polish if time allows.

---

## 8. Words we use

| Word | Meaning |
|---|---|
| Hard violation | A rule that must never break (clash, room too small, teacher unavailable…). Must be 0. |
| Soft penalty | Points for things that are allowed but not ideal (gaps, late periods, a teacher's disliked slot). Lower is better. |
| Spectra / fest week / Week 7 | The fest week; clubs and departments book venues for events. |
| Booking score | Points for Spectra requests: full points when approved, half for an alternative time. |
| Displacement / override | Moving a class for Week 7 only, to make room for an institute event. |
| Seed | A number that fixes the solver's random choices, so the same seed gives the same timetable. |
| Validator | The organisers' `validator.py`, which scores our `schedule.json`. Our app has an exact copy built in. |
| Export | `exports/schedule.json`, the file the organisers check. It must come from the app, never edited by hand. |
| Change request | A proposed timetable change (a change file, unavailability, a move, a manual placement). Nothing changes until an admin approves it. |
| Moved sessions | How many classes end up at a different time or room after a change. Fewer is better; the validator counts them. |
| `schedule_after.json` | The timetable after the applied changes, checked against `schedule.json` as the "before". |

## 9. Check it yourself

```bash
npm run db:start     # local MongoDB (data in .data/)
npm run seed         # reset the local demo database: data, demo users, timetable, exams, decisions
npm run dev          # app on http://localhost:3000 (sign in with a demo account)
npm run export       # download exports/schedule.json from the running app
npm run validate     # score it with the organisers' validator.py
# after an admin has approved a change (e.g. the sample disruption):
npm run export -- --after     # download exports/schedule_after.json
npm run validate -- --after   # score it against data/sample_disruption.json and exports/schedule.json
npm run export -- --disruption   # download exports/disruption.json (every applied change, in order)
npm run validate -- --after --disruption exports/disruption.json   # score it against every applied change
npm test             # all automated tests
```

> **Careful:** if your `.env.local` points `MONGODB_URI` at the shared Atlas cluster, `npm run seed` resets **the team's** database. Use a local database for experiments.
