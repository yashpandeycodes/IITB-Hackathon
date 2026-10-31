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

1. **Start from the latest `main`** once the integration-support pull request is merged. It has everything built so far: Phases 2–3 plus this support work. Bookings, AI and rescheduling come later (see §2).
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

It replaces the **names and lists** in `cit-data.ts` (`CAMPUS_ROOMS`, `TIMETABLE_SESSIONS`, …). Placements, exams, Spectra decisions and the validator report come from their own endpoints (§2). `MOCK_CHANGE_REQUESTS` stays behind a "Preview" banner until Phase 5.

## 2. Screen by screen

| Screen | Call | Contract (`@/lib/contracts`) | Notes |
|---|---|---|---|
| **Admin › Generate** | `streamTimetableGeneration(body, onProgress)` from `@/lib/api-client` (wraps `POST /api/timetable/generate` with the progress stream) | `GenerateTimetableRequest`, `SolverProgress`, `GenerateTimetableResult` | Show `phase`, `hard`, `soft`, `fest`, `iteration`, `ms` live, then the result. Send `{ activate: true }` to make it live. Handle errors (see §3). |
| **Admin › Versions** | `GET /api/timetable/versions`, `POST /api/timetable/versions/{id}/activate` | `TimetableVersionSummary`, `ActivateTimetableResult` | `409 STALE_VERSION` = built for another dataset; `409 HARD_CONSTRAINT` = breaks a rule now. |
| **Admin › Reset / Load dataset** | `POST /api/admin/reset` (optional `{"from":"stored"}`), `POST /api/admin/dataset` (send the file's text as the body) | `ResetReport`, `ImportReport` | Confirm dialog plus spinner (about 1 s). On `400`, list `error.details.issues` (`{ path, message }`). |
| **Admin › Exams / Spectra buttons** | `POST /api/exams/generate`, `POST /api/spectra/run` | `ExamSchedule`, `SpectraRunResult` | Disable while running. All schedule runs share a quota (30 per 10 minutes). |
| **Admin › Validator panel** | `GET /api/validate` | `ValidatorReport` | `hard_violation_count`, `hard_by_rule`, `hard_violations[]` (`rule`, `where`, `detail`), `soft_penalties` S1–S6, `soft_total`, `bookings`, `exam_soft_penalty`, `warnings`. Rule names come from the report; don't hard-code them. |
| **Admin › Export** | `EXPORT_SCHEDULE_URL` as `<a href={EXPORT_SCHEDULE_URL} download>` | — | Enable only when `canExport()` says `ok`: no hard violation, and a decision for every Spectra request (`missing_decisions` lists the request ids without one; `POST /api/spectra/run` fixes them). Delete the fake JSON builders and the fake `schedule_after.json` (that one comes in Phase 5). |
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

**Screens whose backend isn't built yet** (bookings submit/list/parse in Phase 4; approvals, changes, assistant and explanations in Phase 5):
- Show a clear "Preview, not connected yet" banner.
- Never show a decision, "applied" or "verified" message the server didn't send.
- The manual booking form can already use `BookingDraftSchema` (react-hook-form + zod) and check room availability with `GET /api/rooms/available`.

## 3. Errors you'll meet

| Status / code | Meaning | Show |
|---|---|---|
| `401 UNAUTHENTICATED` | Signed out or token revoked | Go to `/api/auth/session-expired?redirect=…` (`SESSION_EXPIRED_PATH`) |
| `403 FORBIDDEN` | Role not allowed | Hide the action for that role |
| `404 NOT_FOUND` | Unknown id; no active timetable for Spectra runs | Empty state or `notFound()` |
| `409 CONFLICT` | Another reset, import or run is in progress; or (export) Spectra decisions missing | "Busy, try again"; run Spectra |
| `409 HARD_CONSTRAINT` | Export or activation would break a rule; `details` = violations | List them (`rule`, `detail`) |
| `409 STALE_VERSION` | Version built for another dataset | "Generate a new timetable" |
| `422 INFEASIBLE` | Can't place everything; `details.unplaced`, `details.violations` | Say what couldn't be placed |
| `429 RATE_LIMITED` | Too many runs; `details.retry_after_seconds` | Disable the button for that long |

## 4. Remove the fakes (checklist)

- [ ] `git grep -n "cit-data" src` returns only the Phase-5 preview data (`MOCK_CHANGE_REQUESTS`). Move that into the preview screens, then delete `src/lib/dataset/cit-data.ts`.
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
   5. Signing in from `/login?redirect=https://evil.example` (or `//evil.example`, `javascript:alert(1)`) lands on `/dashboard`; from `/login?redirect=/rooms` it lands on `/rooms`.
   6. Log out in one tab, then reload an app page in another: you reach `/login`, not a redirect loop.
4. Tell Aryan when a batch lands on `main`. He re-runs the reviews and updates [project-status.md](./project-status.md).
