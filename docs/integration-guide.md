# Integration guide (frontend ↔ backend)

> **For:** Lakshay, who owns wiring the screens to the API.
>
> **Goal:** every screen shows real data from the backend, and nothing on screen is invented.
>
> **Related docs:**
> - what's fake today and why it matters: [project-status.md](./project-status.md) §5
> - every endpoint with real example responses: [api.md](./api.md)
> - data shapes: `src/lib/contracts` (`import type { … } from "@/lib/contracts"`)
>
> **Who changes what:** backend code (`src/lib/**` except `src/lib/contracts/ui.ts` and `src/lib/dataset/`, and `src/app/api/**`) stays with Aryan. If you need a new endpoint or field, ask him rather than adding it.

---

## 0. Set up

1. **Start from the latest `main`** once the backend pull request is merged. It has everything built so far: Phases 2–5 (generation, exams, Spectra, bookings and the AI booking parser, change requests and rescheduling, the assistant, explanations, both exports).
   ```bash
   git fetch origin && git switch lakshay && git merge origin/main
   ```
   Or start a fresh branch from `origin/main`.
2. **Run it against a local database.**
   ```bash
   npm run db:start
   MONGODB_URI=mongodb://127.0.0.1:27017 npm run seed
   MONGODB_URI=mongodb://127.0.0.1:27017 npm run dev
   ```
   `npm run seed` loads the data, the demo users, a generated timetable, exams and Spectra decisions.
   > **Careful:** `.env.local` points at the team's shared Atlas cluster. Override `MONGODB_URI` as above, or `npm run seed` resets the shared database.
3. **Sign in with the demo accounts** listed in the README (one per role). The admin account can do everything.

## 1. Foundation (do these once, first)

### 1.1 Mount the providers

`src/components/providers/providers.tsx` already sets up TanStack Query, nuqs and the toast `Toaster`, but nothing renders it. In `src/app/layout.tsx`, wrap the body:

```tsx
<body …>
  <Providers>{children}</Providers>
</body>
```

### 1.2 Know who is signed in (fixes "everyone sees Admin")

`getSessionUser()` (from `@/lib/auth/server-session`) is a server-only helper, cached per request so a layout and its page share one lookup:
- it reads the session cookie, rejects logged-out tokens and re-reads the user;
- it returns a `User` (`{ id, email, name, role, department, faculty_id, club }`) or `null`.

Steps:

1. **Group the signed-in pages.** Create the route group `src/app/(app)/` (URLs don't change) and move the app pages into it:
   ```bash
   git mv src/app/{dashboard,admin,coordinator,faculty,club,timetable,rooms,bookings,spectra,approvals,changes,assistant,exams} "src/app/(app)/"
   ```
2. **Read the user in that group's layout.** In `src/app/(app)/layout.tsx` (a server component):
   ```tsx
   import { redirect } from "next/navigation";
   import { getSessionUser, SESSION_EXPIRED_PATH } from "@/lib/auth/server-session";

   export default async function AppLayout({ children }: { children: React.ReactNode }) {
     const user = await getSessionUser();
     if (!user) redirect(SESSION_EXPIRED_PATH); // not "/login": see the note below
     return <SessionProvider user={user}>{children}</SessionProvider>;
   }
   ```
   Keeping this out of the root layout means the landing and login pages stay static, and they keep working if the database is down.
3. **Share it with a context.** Add a small client context, e.g. `src/components/providers/session-provider.tsx`, holding `user` and exposing a `useSessionUser()` hook.
4. **Use it in the shell.** `AppShell` reads `useSessionUser()` instead of its props. Delete the defaults (`'Admin'`, `'Dr. Rajesh Verma'`).
5. **Compare role *values*** (`admin`, `department_coordinator`, `faculty`, `club`), never labels:
   - labels: `ROLE_META[user.role].label` from `src/config/roles.ts`;
   - menu: `getNavForRole(user.role)` from `src/config/nav.ts`.
6. **Approvals badge:** use `pending_approvals.total` from `GET /api/dashboard`, not `"3"`.
7. **Retire the old check.** The four role pages (`dashboard`, `faculty`, `coordinator`, `club`) still call `verifySessionToken` from `@/lib/auth/jwt`. It checks the signature only and returns label roles. Use the layout's user instead, then tell Aryan so he can delete `src/lib/auth/jwt.ts`.

> **Why `SESSION_EXPIRED_PATH`, not `/login`:** a cookie can keep a valid signature after the session is rejected (logged out elsewhere, account deleted, or a different database). The proxy bounces such a cookie away from `/login`, which would loop. `GET /api/auth/session-expired` clears the cookie first, then goes to `/login`. Add `?redirect=<path>` to come back afterwards.

> **After sign-in, honour `redirect` safely.** The proxy sends signed-out visits to `/login?redirect=…`. Pass that value through `safeRedirectPath(value)` from `@/lib/redirect` before navigating:
> - it accepts only same-site paths;
> - it rejects other sites, `//…`, `javascript:`, `/login`, `/signup` and `/api/…`;
> - it falls back to `/dashboard`.
>
> Never assign the raw query value to `location.href`: that's an open redirect, and with `javascript:` it's script injection.

### 1.3 How to fetch

In client components, use TanStack Query with the typed helpers from `@/lib/api-client`. They validate the response against the contract and throw `ApiClientError` (`code`, `status`, `details`) on errors.

```tsx
const { data, isPending, error } = useQuery({
  queryKey: ["dashboard"],
  queryFn: () => apiGet("/api/dashboard", DashboardSchema),
});
```

- **Loading:** `PageSkeleton` (`src/components/states/page-skeleton.tsx`). Never show a number before the data arrives.
- **Error:** `ErrorState` (`src/components/states/error-state.tsx`) with a Retry. On `status === 401`, send the user to `` `${SESSION_EXPIRED_PATH}?redirect=${encodeURIComponent(pathname)}` `` (the path is `/api/auth/session-expired`). Branch on `error.code` where you can: streamed errors from the generate helper carry the same `code` and status as JSON ones.
- **Nothing yet:** `EmptyState` (`src/components/states/empty-state.tsx`). For example, before a timetable exists `version_id` is `null`: show "No timetable yet", plus a "Generate" button for admins.
- **After a mutation:** call `queryClient.invalidateQueries(...)` and `toast.success(...)`.

### 1.4 Names come from `GET /api/reference`

The schedule endpoints return ids (`LH-1`, `F06`, `CS202-L1`). `GET /api/reference` returns, for the active dataset (in dataset order):
- calendar, with period clock times;
- rooms (name, type, capacity, features, accessible) and room maintenance;
- faculty names, the student groups (`student_groups`), course titles, sessions and exams;
- the Week-7 requests, with `effective_category`, `category_capped`, `submitted_at` and `cancelled`.

Fetch it once and build lookup maps:

```tsx
const reference = useQuery({
  queryKey: ["reference"],
  queryFn: () => apiGet("/api/reference", ReferenceDataSchema),
  staleTime: Infinity,
});
```

After a reset or a dataset import, invalidate `["reference"]` along with everything else.

It replaces the **names and lists** in `cit-data.ts` (`CAMPUS_ROOMS`, `TIMETABLE_SESSIONS`, …). Placements, exams, Spectra decisions, change requests and the validator report come from their own endpoints (§2). `MOCK_CHANGE_REQUESTS` can go now: change requests come from `GET /api/changes`.

## 2. Screen by screen

| Screen | Call | Contract (`@/lib/contracts`) | Notes |
|---|---|---|---|
| **Admin › Generate** | `streamTimetableGeneration(body, onProgress)` from `@/lib/api-client` (wraps `POST /api/timetable/generate` with the progress stream) | `GenerateTimetableRequest`, `SolverProgress`, `GenerateTimetableResult` | Show `phase`, `hard`, `soft`, `fest`, `iteration`, `ms` live, then the result. Send `{ activate: true }` to make it live. Handle errors (see §3). |
| **Admin › Versions** | `GET /api/timetable/versions`, `POST /api/timetable/versions/{id}/activate` | `TimetableVersionSummary`, `ActivateTimetableResult` | `409 STALE_VERSION` = built for another dataset; `409 HARD_CONSTRAINT` = breaks a rule now; `409 CONFLICT` on a change request's draft (approve the request instead). Activating rejects every pending change request built on another version: warn in the confirm dialog and refetch `["changes"]`. |
| **Admin › Reset / Load dataset** | `POST /api/admin/reset` (optional `{"from":"stored"}`), `POST /api/admin/dataset` (send the file's text as the body) | `ResetReport`, `ImportReport` | Confirm dialog plus spinner (about 1 s). On `400`, list `error.details.issues` (`{ path, message }`). |
| **Admin › Exams / Spectra buttons** | `POST /api/exams/generate`, `POST /api/spectra/run` | `ExamSchedule`, `SpectraRunResult` | Disable while running. All schedule runs share a quota (30 per 10 minutes). |
| **Admin › Validator panel** | `GET /api/validate` (`?file=schedule_after` after a change) | `ValidatorReport` | `hard_violation_count`, `hard_by_rule`, `hard_violations[]` (`rule`, `where`, `detail`), `soft_penalties` S1–S6, `soft_total`, `bookings`, `exam_soft_penalty`, `warnings`. Rule names come from the report; don't hard-code them. |
| **Admin › Export** | `EXPORT_SCHEDULE_URL` as `<a href={EXPORT_SCHEDULE_URL} download>`; after a change, `EXPORT_SCHEDULE_AFTER_URL` and `EXPORT_DISRUPTION_URL` | — | Enable each only when `canExport()` / `canExport("schedule_after")` / `canExport("disruption")` says `ok`: no hard violation, and a decision for every Spectra request (`missing_decisions` lists the request ids without one; `POST /api/spectra/run` fixes them). `schedule_after` and `disruption` exist only after an applied change (`canExport("schedule_after")` rejects with `409 CONFLICT` before that: hide the button). Delete the fake JSON builders, including the fake `schedule_after.json`. |
| **Admin › Settings** | `GET /api/settings`, `PATCH /api/settings` | `Settings`, `SettingsPatch` | Show `details.fieldErrors` inline on `400`. |
| **Dashboard** (all roles) | `GET /api/dashboard` | `Dashboard` | Role-aware already. `bookings.booking_score` / `booking_score_max_if_all_approved` give the Spectra score (`null` before decisions exist). `utilisation.rooms[].busy[d][p]` drives the heat map. |
| **Timetable** | `GET /api/timetable?view=group\|faculty\|room&id=…&week=regular\|spectra` | `TimetableView` (`cells[]`, `bookings[]`) | Picker over `reference.student_groups`, `reference.faculty` and `reference.rooms`. A faculty user's default is `/timetable/faculty/{user.faculty_id}`. `404` → `notFound()`. The grid must take `TimetableCell[]`, span `duration` periods and stack cells that share a slot (basket electives run in parallel). Week 7 marks moved classes with `override.displaced_by`. |
| **Drag-and-drop check** (optional) | `POST /api/timetable/check` | `TimetableCheckResult` | Shows violations and `soft_delta`; nothing is saved. |
| **Find a room** | `GET /api/rooms/available?day=…&from_period=…&to_period=…&min_capacity=…&needs=…&types=…&accessible=…` | `RoomAvailability[]` | Busy reasons come in `busy_with[].label`. Names and features from `reference.rooms`. |
| **Exams** | `GET /api/exams` | `ExamSchedule` (`exams[]: {exam_id, day, session, rooms[]}`) | Groups and size from `reference.exams`; AM/PM times from `reference.calendar.exam_week.sessions`. `null` → "No exam schedule yet". |
| **Spectra** | `GET /api/spectra` (every role); admins also `POST /api/spectra/run` | `SpectraState` (`summary`, `decisions[]`, `overrides[]`) | Always show the decision's `reason`. Title, requester and windows from `reference.booking_requests`. Show a "category capped" badge when `decision.category_capped` (or `reference.booking_requests[].category_capped`, the same rule). Week-7 room grid: `GET /api/timetable?view=room&id=…&week=spectra`. |
| **Login** | `POST /api/auth/demo-login` `{ role }` | `User` | Build the cards from `DEMO_ACCOUNTS` (`src/config/demo-accounts.ts`), not the sample file. Error text: `data.error?.message ?? data.error`. Add `method="post"` to forms. |
| **Sign-up** | `POST /api/auth/signup` → `verify-otp` / `resend-otp` | — | Offer Club Representative only. Landing "Get started" → `/login`. "Resend code" must call `POST /api/auth/resend-otp`. |

**Generate + export, as a starting point** (a client component; the helpers come from `@/lib/api-client`):

```tsx
"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { SolverProgress } from "@/lib/contracts";
import { canExport, EXPORT_SCHEDULE_URL, isApiClientError, streamTimetableGeneration } from "@/lib/api-client";

export function GeneratePanel() {
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [exportOk, setExportOk] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    abort.current = new AbortController();
    try {
      await streamTimetableGeneration({ activate: true }, setProgress, { signal: abort.current.signal });
      setExportOk((await canExport()).ok); // re-check after the run
    } catch (e) {
      if (isApiClientError(e)) toast.error(e.message); // 409 busy, 422 infeasible, 429 too many runs…
    }
  }

  return (
    <>
      <button onClick={run}>Generate</button>
      {progress && <p>{progress.phase} · iteration {progress.iteration} · hard {progress.hard} · soft {progress.soft} · {progress.ms} ms</p>}
      <a href={EXPORT_SCHEDULE_URL} download aria-disabled={!exportOk} onClick={(e) => !exportOk && e.preventDefault()}>
        Download schedule.json
      </a>
    </>
  );
}
```

If the user leaves mid-run, the server still finishes and saves the run (and releases the lock), so refetch `GET /api/timetable/versions` rather than generating again.

**Bookings (live since Phase 4):**

| Screen | Call | Contract | Notes |
|---|---|---|---|
| **New booking › Describe it** | `POST /api/bookings/parse` `{ text }` | `ParseBookingResult` | Fill the form from `draft`; show `assumptions` as chips and `follow_up` as the question; show `category` (capped notice when `capped`), `requested_room.note`, `problems` next to their fields, and `preview` ("If you submit now: approved in LH-1 …", plus "needs the CSE coordinator's approval" from `preview.approval`). Works with AI off (`source: "rules"`). Never show a decision from the preview as final. |
| **New booking › Form + Submit** | `POST /api/bookings` | `CreateBookingRequest` → `CreateBookingResult` | Build the form on `BookingDraftSchema` (react-hook-form + zod). Send `source: "nl"` and `ai_log_id: log_id` when the draft came from the parser. Show each booking's decision and reason; `bumped` lists earlier bookings this one moved. `400` field errors come in `error.details.fieldErrors` (+ `suggestion`). Hide the compulsory-groups field for clubs (they may name none). `409` with `details.limit`: 20 open requests already. |
| **My bookings** | `GET /api/bookings` (`scope=mine`) | `BookingView[]` | Show state (`submitted`, `pending_approval` "waiting for approval by …", `decided`, `cancelled`), decision and reason. Cancel: `POST /api/bookings/{id}/cancel`. |
| **Booking detail** | `GET /api/bookings/{id}` | `BookingDetail` | `explanation.text` ("why this room / why not"). `404` also means "not yours to see". |
| **Week-7 views** | `GET /api/timetable?week=spectra`, `GET /api/rooms/available` | `TimetableView`, `RoomAvailability[]` | Show `pending_approval` bookings and moved classes as tentative. Another user's live booking arrives titled "Booked". |
| **Approvals › Bookings** | `GET /api/bookings?scope=approvals`; `POST /api/bookings/{id}/decide` `{ decision, comment? }` | `BookingView` | Admin: class moves and labs; coordinator: their department's labs. Never the user's own (`403 SELF_APPROVAL`). |

**Changes, approvals, assistant and explanations (live since Phase 5).** Helpers from `@/lib/api-client`: `listChanges`, `getChange`, `proposeChange`, `previewChange`, `approveChange`, `rejectChange`, `placeManually`, `askAssistant`, `explain`. Each validates the response against its contract and throws `ApiClientError` like `apiGet`.

| Screen | Call | Contract | Notes |
|---|---|---|---|
| **Changes › list** | `listChanges({ scope, status })` → `GET /api/changes` | `ChangeRequest[]` | Admin, coordinator, faculty (hide the page for clubs). Tabs: `scope: "pending"` (waiting for approval), `"mine"`, `"all"`. Show `title`, `status`, `moved_count` ("9 moved: 0 time, 9 room only"), `requested_by_role`, `created_at`. The server returns the newest 100 the user may see. |
| **Changes › detail / diff view** | `getChange(id)` → `GET /api/changes/{id}` | `ChangeRequest` | One row per `diff[]` item: `session_id`, `from` → `to` (`null` = added / removed), a chip for `move` (`room_only`, `time_only`, `time_and_room`, `added`, `removed`) and `cause` (`broken`, `evicted` + `displaced_by`, `requested`), and `reason`. Header: `moved_count`, `time_changed`, `room_only_changed` (against the timetable it was built on), `soft_delta` (negative is better), `warnings`. Once a change has been applied, also show `baseline_stability` (`sessions_moved`, `time_changed`, `room_only_changed`): the counts against `schedule.json` that the validator will report for `schedule_after.json`; it is `null` before the first applied change (then `moved_count` is that number) and when infeasible. `nl_prompt` is `null` unless you filed it or are an admin. `infeasible`: show `conflicts[]` (`summary`, `contradictions`, and the `blocking` tallies as "H3 × 20: CSE-2 already in class"). `404` = unknown or not visible. |
| **Changes › load a change file** | `proposeChange(file)` → `POST /api/changes` | `ChangeProposalRequestInput` → `ChangeRequest` (201) | `const file = JSON.parse(await upload.text())` and send it as it is: `kind` defaults to `disruption` and the file's `id` is ignored (any other extra key is a `400`, the body is strict). Admin, or a coordinator for their department. Then open the detail view. `400`: list `error.details` as `PathIssue[]` (`[{ path, message }]`, e.g. `changes[0].faculty_id`: "Unknown faculty F99."; at most 20, then one with an empty `path`: "… and N more problems like these.") for unknown ids, the wrong kind or the [request limits](./api.md#request-limits) (ids ≤ 64 characters, text ≤ 500, …); only a malformed body is Zod's flattened error (`fieldErrors`, `formErrors`). `403`: `error.details.issues`. `409`: no timetable yet, 20 open (pending or infeasible) requests already, or busy. |
| **Changes › preview** | `previewChange(body)` → `POST /api/changes/preview` | `ChangePreview` | Same body; nothing stored. Use it for a "Check" button before "File request". |
| **Approvals › changes** | `approveChange(id, { comment })` / `rejectChange(id, { comment })` | `ChangeApplyResult` / `ChangeRequest` | Approve: admins only. On the admin's own request, show Approve only when `kind` is `disruption` or `manual_edit` and `requested_by_role` is `admin` (a change file or manual edit); their own `faculty_request` or `unavailability` is `403 SELF_APPROVAL`. Reject: admins; the requester sees "Withdraw" (same call). After approve, invalidate `["changes"]`, the timetable, dashboard, Spectra and export queries: a new version is active and `superseded` lists requests that were closed. `409 STALE_VERSION`: "The timetable changed; file the change again" (the request is already rejected). `409 HARD_CONSTRAINT`: show `details` (it stays pending). `409 CONFLICT` "Make schedule.json exportable first …" on the first approval: generate exams / run Spectra, then approve again (it stays pending). Activating another version from the versions list rejects every pending change request ("The timetable changed (…); file it again."): refetch `["changes"]` after an activation too. |
| **Manual placement** | `placeManually({ session_id, day, start_period, room_id, repair })` → `POST /api/manual/place` | `ManualPlacementInput` → `ChangeRequest` (201) | Admin, coordinator (own department). Without `repair`, a busy slot is `409 HARD_CONSTRAINT` with `details` = violations (use `POST /api/timetable/check` for live hints while dragging); offer "Move what's in the way" = the same call with `repair: true`. The result is a pending `manual_edit` request, not a live change. |
| **Assistant** | `askAssistant({ message, session_id? })` → `POST /api/assistant` | `AssistantRequest` → `AssistantReply` | Admin, coordinator, faculty. Render `text`, `assumptions` (chips), `follow_up` (question). `options[]` → cards with `label`, the counts and `diff`; **Submit** = `proposeChange(option.proposal)` (send it unchanged; the server recomputes it), then show the stored request. `candidates[]` → buttons; on click resend the same `message` with `session_id`. `conflicts[]` → "why not". Show "Verified by constraint engine" only when `verified` is true, and "AI phrased" only when `text_source === "llm"`. Nothing is stored by a turn. |
| **"Why?" buttons** | `explain({ subject, id })` → `POST /api/explain` | `ExplainRequest` → `ExplainResult` | `subject`: `"session"` (timetable cell), `"booking"` (Spectra or booking row), `"change"` (change detail). Show `text`; `facts` holds the numbers and is typed by `subject` (narrow on it: `SessionFacts`, the booking's facts or `{}`, `ChangeFacts`; for a session: `alternatives.blocked` tallies, `alternatives.best` free slots, `room.fill_percent`). A change's text is always the template (`source: "template"`). `404` = not visible to you (dataset booking requests are admin-only). |

Never show an "applied" or "verified" message the server didn't send: a filed change is `pending` until an admin approves it.

## 3. Errors you'll meet

| Status / code | Meaning | Show |
|---|---|---|
| `401 UNAUTHENTICATED` | Signed out or token revoked | Go to `/api/auth/session-expired?redirect=…` (`SESSION_EXPIRED_PATH`) |
| `403 FORBIDDEN` | Role not allowed | Hide the action for that role |
| `404 NOT_FOUND` | Unknown id; no active timetable for Spectra runs | Empty state or `notFound()` |
| `403 SELF_APPROVAL` | Approving your own booking, or your own change request (the one exception: an admin's own change file or manual edit filed as admin) | Hide Approve on the user's own requests; for an admin's own request, show it only when `kind` is `disruption` or `manual_edit` |
| `409 CONFLICT` | Another reset, import, run, booking or timetable change is in progress; (export) Spectra decisions missing, or `schedule_after` / `disruption` before any applied change; a booking write that can't apply (20 open requests already, cancelling a dataset request, deciding one that isn't pending); a change that isn't pending, 20 open change requests already, no timetable yet, the first change approval while `schedule.json` isn't exportable; activating a change request's draft from the versions list | "Busy, try again"; run Spectra; show the message |
| `409 HARD_CONSTRAINT` | Export, activation, a manual placement without `repair` or a change approval would break a rule; `details` = violations | List them (`rule`, `detail`) |
| `409 STALE_VERSION` | Version built for another dataset; a change approved after another timetable became active (the request is rejected) | "Generate a new timetable" / "File the change again" |
| `422 INFEASIBLE` | Can't place everything; `details.unplaced`, `details.violations` | Say what couldn't be placed |
| `429 RATE_LIMITED` | Too many runs, parses, booking changes, change requests, assistant turns or explanations; `details.retry_after_seconds` | Disable the button for that long |

## 4. Remove the fakes (checklist)

- [ ] `git grep -n "cit-data" src` returns nothing: `MOCK_CHANGE_REQUESTS` is replaced by `GET /api/changes`, so `src/lib/dataset/cit-data.ts` can be deleted.
- [ ] No `alert(`/`confirm(` and no `setTimeout` pretending to work: `git grep -nE "alert\(|confirm\(|setTimeout\(" src/app src/components`.
- [ ] No invented results or claims. Search for:
  - `64 / 70`, `soft 48`, `48 pts`, `91.4`;
  - `CP-SAT`, `Optimal`, `Verified by constraint engine`;
  - `Dr. Rajesh Verma`, `68 Campus`, `No production databases`.
- [ ] Types: use `@/lib/contracts` types (`TimetableCell`, `ExamPlacement`, `SpectraDecisionView`…) and shrink `src/lib/contracts/ui.ts` to view-only helpers.
- [ ] Pick one shell and one chip set; delete the unused one. The token-based `AppSidebar` / `AppTopbar` / `MobileTabBar` and `StatusBadge` / `CategoryChip` / `KindChip` already use the API's values (`alternative_offered`, `regular_session`).

## 5. Done means

1. `npm run lint` (0 errors), `npm run typecheck`, `npm test` and `npm run build` pass.
2. **Remove each fixed file from the temporary lint override** (the last two blocks in `eslint.config.mjs`) and from the Phase-3 list in `.prettierignore`, then run `npx prettier --write` on it. Removing your own files from those lists is fine; anything else in those files goes through Aryan.
3. **Manual run:**
   1. Sign in as each demo role and check the menu and name.
   2. As admin: Reset → Generate (watch the live progress) → Validator panel shows 0 hard violations → Export downloads `schedule.json`.
   3. `npm run validate` on that file prints `Hard violations: 0`.
   4. Timetable, rooms, exams and Spectra show the same numbers as `GET /api/validate` and the dashboard.
   5. As admin after a reset: Changes › load `data/sample_disruption.json` → the diff shows 9 moved (0 time, 9 room only) and CS202-T2 added → Approve → the timetable shows CS202-T2 at MON P7 in CR-103 → the `schedule_after.json` download is enabled; `npm run export -- --after && npm run validate -- --after` prints `Hard violations: 0` and "Stability: 9 sessions moved (0 changed time, 9 room only)".
   6. As faculty: the assistant answers "Can I move my Friday CS202 lecture to Thursday morning?" with verified options; Submit one → it appears as pending under Changes; Approve is not offered to the faculty user. As admin, approve it.
   7. Signing in from `/login?redirect=https://evil.example` (or `//evil.example`, `javascript:alert(1)`) lands on `/dashboard`; from `/login?redirect=/rooms` it lands on `/rooms`.
   8. Log out in one tab, then reload an app page in another: you reach `/login`, not a redirect loop.
4. Tell Aryan when a batch lands on `main`. He re-runs the reviews and updates [project-status.md](./project-status.md).
