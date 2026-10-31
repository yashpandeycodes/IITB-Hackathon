# Project status

> **Written:** 31 Oct 2026, at the end of backend Phase 3, right after merging the frontend team's latest `main` into `Aryan`.
>
> **For:** the whole team (Aryan on backend; Yash and Lakshay on frontend).
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
- **The frontend looks great but is mostly a mock-up.**
  - Only sign-in, sign-up and sign-out talk to the backend. No screen uses the API client (`src/lib/api-client.ts`).
  - Instead they show hand-written sample data from `src/lib/dataset/cit-data.ts`, which doesn't match the real dataset:
    - 9 of its 27 room ids don't exist;
    - it has 12 sessions instead of 189 and 7 exams instead of 41.
  - The Generate, Reset and Export buttons are animations or `alert()` boxes.
  - **The Export button downloads a made-up file that would fail the validator.**
- **The screens show numbers that contradict our real results.** For example soft penalty 48 (real: 3) and booking score 64/70 (real: 67/70). The hackathon rules treat hard-coded "results" as a disqualification risk, so this is the most urgent fix.
- **Everyone sees the Admin menu:** most pages don't pass the signed-in user to the app shell.
- **Top jobs for the next session:**
  1. **Frontend:** connect the admin page (generate, reset, export, validator report), the timetable, rooms, exams and Spectra screens to the API.
  2. **Frontend:** delete every invented number and claim.
  3. **Frontend:** make the app shell use the real signed-in user.
  4. **Backend:** add the four small endpoints the frontend needs to label things (§4.2).
- **Team chores:**
  - Change two leaked database passwords.
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
| Plain-language (English/Hinglish) booking + manual form | ❌ (Phase 4) | 🟡 | The screen fakes parsing and always says "Approved". |
| Change requests, approvals, rescheduling | ❌ (Phase 5) | 🟡 | The screens flip local state and claim "applied, everyone notified". |
| Faculty assistant and "why?" explanations | ❌ (Phase 5) | 🟡 | Canned replies marked "Verified by constraint engine". |
| `schedule_after.json` (after the sample disruption) | ❌ (Phase 5) | 🟡 | The button downloads `{updated: true}`. |
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
- **Quality.**
  - 579 automated tests.
  - CI runs lint, typecheck, tests, build, the parity check and the validator.

### 4.2 Needs fixing

**First: small additions the frontend needs right away** (found in the frontend review; they block parts of the wiring):

| # | What's missing | Why the frontend needs it |
|---|---|---|
| B1 | A read endpoint for reference data: rooms (name, type, capacity, features, accessible), faculty names, the 14 groups, course titles, exams, booking request details | The new endpoints return ids only (`LH-1`, `F06`, `CS202-L1`). Without names the screens can't label anything, and the pickers can't list groups, faculty and rooms. |
| B2 | `GET /api/spectra`: stored decisions and the summary, readable by every role | Today only the admin's `POST /api/spectra/run` returns decisions, so clubs and faculty can't see the Spectra board. |
| B3 | Booking score on `GET /api/dashboard` | The dashboard's Spectra card has no real number to show. |
| B4 | A cookie-based "current user" helper for server layouts (with the logout check) | The cleanest fix for the app-shell role bug is one server layout that reads the user. |

**Then, small and known, none urgent:**

- **Phase 4: live booking requests.**
  - Saving decisions currently replaces *all* stored decisions. Once real users submit bookings, it must keep theirs.
  - An admin must never auto-approve their own request.
  - Request status should update after each Spectra run.
- **Tidy-ups found in review:**
  - a few duplicated helpers;
  - the progress-stream code could be shared for Phase 5;
  - one shared "seed" schema;
  - `GET /api/exams` shows internal fields to every role;
  - the audit log has no size cap (the rate limit keeps it small for now).
- **Carried over:**
  - Role checks should refuse a faculty/coordinator account whose link is missing.
  - The import report should warn when a demo account's link isn't in an uploaded dataset.

### 4.3 Still to build

| Phase | What | What it means for the frontend |
|---|---|---|
| **4: AI + bookings** | Gemini adapter with a rule-based fallback (English + Hinglish), `POST /api/bookings/parse`, booking submit/list/cancel, booking explanations, AI accuracy script, `AI_USAGE.md` update | The booking page can call the real parser and submit endpoint and show the engine's decision and reason. It must keep working with AI switched off. |
| **5: Changes + assistant** | Rescheduler (fewest moves; says *why* when impossible), change requests, approve/reject (never your own), manual placement, faculty unavailability, assistant (`POST /api/assistant`), "why?" explanations (`POST /api/explain`), `schedule_after.json` | The approvals, changes and assistant pages connect to real endpoints. The validator panel gets a "moved sessions" count. |
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
| 1 | **Export downloads a fake file** (sample sessions + a timestamp; `schedule_after.json` is `{updated:true}`) | `src/app/admin/page.tsx` (~327–362) | Link to `GET /api/export?file=schedule`. Enable it only when `GET /api/validate` says `hard_violation_count === 0`. Hide `schedule_after` until Phase 5. |
| 2 | **Admin buttons are fake.** Generate is three `setTimeout`s. Reset, exams and Spectra are `alert()`/`confirm()`. The validator tab always shows "0 violations ✓", with the wrong rule names (the real H1 is "not scheduled", H5 is "capacity"). The page claims a "CP-SAT … Optimal" solver we don't use. | `src/app/admin/page.tsx` | Call `POST /api/timetable/generate` (read the progress stream), `POST /api/admin/reset`, `POST /api/exams/generate`, `POST /api/spectra/run` and `GET /api/validate`. Describe the solver as "greedy + repair + simulated annealing". |
| 3 | **Invented numbers that contradict our results**: soft 48, 64/70, 21/2/2, "91.4%", "verified 4 mins ago", a random heat map, "48 pts (Optimal)" on login | `src/app/dashboard/page.tsx`, `src/app/spectra/page.tsx`, `src/components/auth/auth-side-panel.tsx` | Read `GET /api/dashboard`, `GET /api/validate` and the Spectra summary. Show "—" or a skeleton until loaded, never a made-up number. |
| 4 | **Everyone sees the Admin menu** and the name "Dr. Rajesh Verma": most pages don't pass the user to the shell; the approvals badge is always "3" | `src/components/layout/app-shell.tsx` | One server layout for the app pages that reads the session (or `GET /api/auth/me`) and passes role and user down. Delete the defaults. Compare role *values* (`admin`, `faculty`…); show labels from `src/config/roles.ts`. |
| 4b | **Demo-account cards use the sample file**: wrong emails and names; an error shows "[object Object]"; after login the `?redirect=` target is ignored | `src/components/auth/login-form.tsx` | Use `DEMO_ACCOUNTS` from `src/config/demo-accounts.ts`. Show `data.error?.message ?? data.error`. Go to `redirect` when present. |
| 5 | **Timetable ignores what you pick**: same sample cells for every group or room, no faculty option, faculty don't land on their own timetable | `src/app/timetable/[view]/[id]/page.tsx` | `GET /api/timetable?view=…&id=…&week=…`. Add a picker over all groups, faculty and rooms; faculty go to `/timetable/faculty/<their id>`. Show an empty state when `version_id` is null. |
| 6 | **Rooms, exams, Spectra read sample data** | `src/app/{rooms,exams,spectra}/page.tsx` | `GET /api/rooms/available`, `GET /api/exams`, `POST /api/spectra/run` plus the `week=spectra` timetable view. |
| 7 | **Screens for features that don't exist yet claim success**: booking always "Approved", approvals say "applied… notified", the assistant says "Verified by constraint engine" | `src/app/bookings/new`, `src/app/approvals/[id]`, `src/app/assistant` | Until Phases 4–5: a visible "Preview, not connected yet" banner, and no fake decisions or claims. |
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
| Admin › Validator + Export | `GET /api/validate`; `<a href="/api/export?file=schedule" download>` when valid |
| Dashboard | `GET /api/dashboard` (role-aware) |
| Timetable | `GET /api/timetable?view=group\|faculty\|room&id=…&week=regular\|spectra`; drag-and-drop check `POST /api/timetable/check` |
| Find a room | `GET /api/rooms/available?day=…&from_period=…&to_period=…&min_capacity=…&needs=…` |
| Exams | `GET /api/exams` (admin: `POST /api/exams/generate`) |
| Spectra | `POST /api/spectra/run` (admin) and the `week=spectra` timetable view; show `reason`, `reason_code`, the "category capped" badge |
| App shell | `GET /api/auth/me` (or the session on the server) |

Room, faculty and course *names* need the reference endpoint (B1 in §4.2). Until it lands, show ids.

Request and response shapes, with real examples: [api.md](./api.md). Types: `import type { … } from "@/lib/contracts"`. Mount `<Providers>` first (TanStack Query and toasts), then fetch with `apiGet` / `apiPost`.

### 5.6 Screens that must wait for the backend (build against the contracts meanwhile)

- **Bookings: parse + submit + list + cancel (Phase 4).** Use `BookingDraft` from `@/lib/contracts` (the API contract). Keep the manual form working without AI. Never show a decision the server didn't make.
- **Approvals, changes, assistant, explanations (Phase 5).** Use `ChangeRequest`, `MoveDiff` and `ConflictEntry` from `@/lib/contracts`. Hide approve/reject on your own requests (the server refuses with `SELF_APPROVAL`). Show the server's "why not" conflict report when a change is impossible.

---

## 6. Team decisions and chores

| Who | What | Why |
|---|---|---|
| Whoever owns the database | **Change (rotate) two MongoDB Atlas passwords** that are in our git history: commits `7d9d29d` and `89ca50c` | The repo is public on GitHub. Deleting the file doesn't remove it from history. |
| Team | Confirm our registered team name; set `TEAM_NAME` in `.env`, then reset, export and validate again | The export currently says "CIT Crunch Week" (the event name). Never edit `schedule.json` by hand. |
| Yash, Lakshay | If you used AI tools (ChatGPT, Copilot, Claude…), say so; Aryan adds it to `AI_USAGE.md` §2 | Undeclared AI use costs marks. |
| Team | Decide whether the organiser zip, problem PDF and WhatsApp image stay in git | They're large and not ours. |
| Team | Fill in the Team table in `README.md` | Required README section. |
| Aryan | Open a pull request from `Aryan` into `main` | So the frontend builds on the real backend. |

---

## 7. Suggested order

1. **Frontend:** items 1–4b of §5.2 (export, admin actions, no fake numbers, real user in the shell, demo cards). Highest risk, mostly wiring.
   **Backend, at the same time:** the B1–B4 endpoints from §4.2, so the screens can show names.
2. **Frontend:** items 5–6 (timetable, rooms, exams, Spectra from the API), then 9 (loading/empty/error states).
3. **Backend:** Phase 4 (AI booking parser + bookings API). **Frontend** connects the booking page as each endpoint lands.
4. **Frontend:** the remaining Musts (preview banners, false claims, keyboard and forms).
5. **Backend:** Phase 5 (rescheduling, approvals, assistant, explanations, `schedule_after.json`). **Frontend** connects those screens.
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

## 9. Check it yourself

```bash
npm run db:start     # local MongoDB (data in .data/)
npm run seed         # reset the local demo database: data, demo users, timetable, exams, decisions
npm run dev          # app on http://localhost:3000 (sign in with a demo account)
npm run export       # download exports/schedule.json from the running app
npm run validate     # score it with the organisers' validator.py
npm test             # all automated tests
```

> **Careful:** if your `.env.local` points `MONGODB_URI` at the shared Atlas cluster, `npm run seed` resets **the team's** database. Use a local database for experiments.
