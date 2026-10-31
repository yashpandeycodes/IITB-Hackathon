# API reference

> The routes that exist today (end of Phase 3: auth, data, read views, timetable generation, exams, Spectra decisions, export and the validator report). Planned routes and their shapes are in [architecture.md §6](./architecture.md#6-api-catalogue). Types come from `src/lib/contracts` (`import type { User, Dashboard } from "@/lib/contracts"`). Example responses below were captured from a local server on the bundled dataset; long arrays are trimmed.

## Contents

- [Basics](#basics)
- [Signing in](#signing-in)
- [Response shapes](#response-shapes)
- [Error codes](#error-codes)
- [Rate limits](#rate-limits)
- [Endpoints](#endpoints)
- [Coming in later phases](#coming-in-later-phases)

---

## Basics

| Topic | Rule |
|---|---|
| Base path | `/api` on the app's own origin, e.g. `http://localhost:3000/api`. Call relative paths (`/api/dashboard`). |
| Format | JSON in, JSON out. A request with a body must send `Content-Type: application/json`, otherwise `400 VALIDATION_ERROR` ("Content-Type must be application/json."). |
| Body size | 1 MB by default; 2 MB for `POST /api/admin/dataset`; 16 KB for the account forms (login, signup, OTP); 1 KB for demo-login. Too large → `400 VALIDATION_ERROR` with `details.max_bytes`. |
| Session cookie | `cit_nexus_session`: an HS256 JWT with a random `jti`. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age=43200` (12 h from sign-in, not extended by activity). Set by demo-login, login and verify-otp. Logout revokes that token only; other browsers stay signed in. |
| Pending sign-up cookie | `cit_pending_signup`: `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, 24 h. Set by signup, by login to an unverified account and by resend-otp; required by verify-otp and resend-otp; cleared by a successful verification. The OTP step therefore has to run in the same browser. |
| Sending the cookies | Same-origin `fetch` sends them by default. `src/lib/api-client.ts` sets `credentials: "same-origin"`. |
| Who needs a session | Every `/api` route except `/api/auth/*` and `/api/health`. The proxy checks only the token's signature and answers `401 UNAUTHENTICATED` without one. Each route then re-reads the user: a logged-out (revoked) token, a deleted or unverified account → `401`; a changed role applies on the next request. |
| CSRF | `POST`, `PUT`, `PATCH` and `DELETE` to any `/api` route are rejected with `403 FORBIDDEN` ("Cross-origin requests are not allowed.") when the `Origin` header names another host or `Sec-Fetch-Site` is `cross-site`. Requests without those headers (curl, server code) pass. |
| Caching | Auth routes and health send `Cache-Control: no-store`; data routes are dynamic. |
| Timestamps | Stored times are ISO-8601 with the IST offset (`2026-10-31T17:08:08+05:30`). `/api/health` `time` is UTC. |
| Wrong method / path | Next.js answers `405` (wrong method, empty body) or its default HTML `404` (unknown path, signed in). A signed-out call to an unknown path gets the proxy's `401` envelope. |

## Signing in

| Way | Call | Result |
|---|---|---|
| Demo account (one click) | `POST /api/auth/demo-login` `{"role":"admin"}` | `User` + session cookie |
| Email + password | `POST /api/auth/login` `{"email","password"}` | `User` + session cookie, or `403 requiresOtp` for an unverified sign-up |
| New Club Representative account | `POST /api/auth/signup` → `POST /api/auth/verify-otp` (same browser) | session cookie after the emailed code is verified |

```bash
curl -s -c jar -X POST -H 'content-type: application/json' \
  -d '{"role":"admin"}' localhost:3000/api/auth/demo-login
curl -s -b jar localhost:3000/api/dashboard
```

**Roles.** The API stores, signs and returns the role **value**. Display labels exist only at the UI boundary (`src/lib/auth/roles.ts`; short badge labels in `src/config/roles.ts`).

| Value (`data.role`) | Label (legacy `user.role`) | Demo account | Password |
|---|---|---|---|
| `admin` | `Admin` | `admin@cit.demo` | `Admin@123` |
| `department_coordinator` | `Department Coordinator` | `coord.cse@cit.demo` | `Coord@123` |
| `faculty` | `Faculty` | `faculty@cit.demo` | `Faculty@123` |
| `club` | `Club Representative` | `club@cit.demo` | `Club@123` |

## Response shapes

**Standard envelope** (every route except the four account-form routes):

```ts
type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
```

`message` is safe to show to users. For a bad body or query, `details` is Zod's flattened error: `{ formErrors: string[], fieldErrors: { [field]: string[] } }`.

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "The query parameters are invalid.",
  "details": { "formErrors": [], "fieldErrors": { "to_period": ["to_period must not be before from_period"] } } } }
```

**Account-form shape** (`/api/auth/login`, `/signup`, `/verify-otp`, `/resend-otp`), kept for the CIT Nexus forms, which show `data.error` as one line:

```ts
// success: the envelope plus the fields the forms read
{ ok: true, data: T, success: true, message: string, /* route extras */ }
// error: `error` is a string; the first validation issue becomes the message
{ ok: false, error: string, code: ErrorCode, details?: unknown, /* route extras */ }
```

- `api-client.ts` (`apiGet` / `apiPost` / `apiPatch`) parses the standard envelope and throws `ApiClientError { code, status, message, details }`. For the account-form routes it reads successes fine, but an error comes back as `BAD_RESPONSE`; call those four with `fetch` and read `data.error`, as the forms do.
- A cross-origin rejection from the proxy uses the standard envelope on every route, account forms included.

## Error codes

All codes are in `src/lib/contracts/api.ts` (`ErrorCode`, `ERROR_HTTP_STATUS`).

| `code` | HTTP | Meaning | Returned today by |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Body or query failed validation, wrong content type, body too large, bad dataset file (incl. dangling references), wrong/expired OTP, OTP step from another browser | every route with input |
| `UNAUTHENTICATED` | 401 | No valid session (missing, expired, logged out, account gone), or wrong email/password | proxy, every data route, `me`, `login` |
| `FORBIDDEN` | 403 | Role not allowed (`details: { role, allowed }`); Faculty or staff role at sign-up; unverified account at login (`requiresOtp`); demo sign-in turned off; cross-origin mutation | admin routes, `PATCH /settings`, `signup`, `login`, `demo-login`, proxy |
| `SELF_APPROVAL` | 403 | Approver is the requester | not yet (Phase 5 approvals) |
| `NOT_FOUND` | 404 | Unknown id; no active timetable yet | `GET /timetable`, `versions/:id/activate`, `spectra/run` |
| `HARD_CONSTRAINT` | 409 | Engine found violations (`details` = `Violation[]`) | `export`, `versions/:id/activate`, `generate` with `activate` |
| `STALE_VERSION` | 409 | Timetable built for another dataset; later also a proposal built on a timetable that is no longer active | `versions/:id/activate` (Phase 5: approvals) |
| `EMAIL_TAKEN` | 409 | A verified account already uses this email | `signup` |
| `CONFLICT` | 409 | Another reset, import or schedule run holds the dataset lock; a sign-up for this email is waiting for verification in another browser | `admin/reset`, `admin/dataset`, `timetable/generate`, `versions/:id/activate`, `exams/generate`, `spectra/run`, `signup` |
| `INFEASIBLE` | 422 | No valid schedule exists (`details`: unplaced items + blocking violations) | `timetable/generate`, `exams/generate` |
| `RATE_LIMITED` | 429 | Too many attempts; `details.retry_after_seconds` and a `Retry-After` header | `login`, `signup`, `verify-otp`, `resend-otp`, `demo-login`, schedule runs (`generate`, `activate`, `exams/generate`, `spectra/run`) |
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic message, details never exposed | any |
| `LLM_UNAVAILABLE` | 503 | Gemini failed; switch to the manual form | not yet (Phase 4) |
| `MAIL_UNAVAILABLE` | 503 | The verification email can't be sent: mail not configured (production), Brevo failed, or the global hourly cap is reached (with `Retry-After`) | `signup`, `resend-otp`, `login` (unverified) |

## Rate limits

Fixed windows held in memory per server instance (they reset on restart, and each serverless instance counts on its own). "IP" comes from `X-Forwarded-For` only on Vercel; anywhere else that header could be forged, so all callers share one key.

| Limit | Key | Applies to |
|---|---|---|
| 10 failed sign-ins / 10 min | IP + email | `login` (only failures count; a successful sign-in resets it) |
| 20 failed sign-ins / 10 min | email | `login` (only failures count) |
| 10 sign-ups / 10 min | IP | `signup` |
| 5 sign-ups / 10 min | email | `signup` |
| 30 verification requests / 10 min | IP | `verify-otp` |
| 10 verification requests / 10 min | email | `verify-otp` |
| 5 wrong codes | per code | `verify-otp` (the code is then cleared; request a new one) |
| 10 code requests / 10 min | IP | `resend-otp` |
| 5 verification emails / 10 min | email | `signup`, `resend-otp` and unverified `login` share it |
| 60 verification emails / hour | all addresses | same routes; answers `503 MAIL_UNAVAILABLE`, not 429 |
| 30 demo sign-ins / 10 min | IP | `demo-login` (standard envelope) |
| 30 schedule runs / 10 min | admin user | `timetable/generate`, `versions/:id/activate`, `exams/generate`, `spectra/run` together (standard envelope). The demo admin is shared, so this caps the public deployment as a whole. |
| 60 schedule runs / 10 min | IP | same routes |

Example `429` (account-form shape):

```json
{ "ok": false, "error": "Too many sign-in attempts. Try again in 10 minutes.", "code": "RATE_LIMITED",
  "details": { "retry_after_seconds": 600 } }
```

---

## Endpoints

| Method | Path | Who | Request → `data` |
|---|---|---|---|
| POST | [`/api/auth/demo-login`](#post-apiauthdemo-login) | public | `{ role }` → `User` |
| POST | [`/api/auth/login`](#post-apiauthlogin) | public | `{ email, password }` → `User` (account-form shape) |
| POST | [`/api/auth/logout`](#post-apiauthlogout) | anyone | → `null` |
| GET | [`/api/auth/me`](#get-apiauthme) | anyone (401 when signed out) | → `User` |
| POST | [`/api/auth/signup`](#post-apiauthsignup) | public | sign-up form (Club only) → `{ email }` (account-form shape) |
| POST | [`/api/auth/verify-otp`](#post-apiauthverify-otp) | public, sign-up browser | `{ email, otp }` → `User` (account-form shape) |
| POST | [`/api/auth/resend-otp`](#post-apiauthresend-otp) | public, sign-up browser | `{ email }` → `null` (account-form shape) |
| GET | [`/api/auth/google`](#get-apiauthgoogle) | public | always `302` → `/login?error=google_unavailable` |
| GET | [`/api/health`](#get-apihealth) | public | → `{ status, db, dataset_id, time }` |
| GET | [`/api/dashboard`](#get-apidashboard) | any signed-in | → `Dashboard` |
| GET | [`/api/timetable`](#get-apitimetable) | any signed-in | `TimetableViewQuery` → `TimetableView` |
| POST | [`/api/timetable/check`](#post-apitimetablecheck) | any signed-in | `TimetableCheckRequest` → `TimetableCheckResult` |
| GET | [`/api/rooms/available`](#get-apiroomsavailable) | any signed-in | `RoomAvailabilityQuery` → `RoomAvailability[]` |
| GET | [`/api/settings`](#get-apisettings) | any signed-in | → `Settings` |
| PATCH | [`/api/settings`](#patch-apisettings) | admin | `SettingsPatch` → `Settings` |
| POST | [`/api/admin/reset`](#post-apiadminreset) | admin | `{ from? }` → `ResetReport` |
| POST | [`/api/admin/dataset`](#post-apiadmindataset) | admin | `Dataset` JSON → `ImportReport` |
| POST | [`/api/timetable/generate`](#post-apitimetablegenerate) | admin | `GenerateTimetableRequest` → `GenerateTimetableResult` (or an SSE stream) |
| GET | [`/api/timetable/versions`](#get-apitimetableversions) | admin | → `TimetableVersionSummary[]` |
| POST | [`/api/timetable/versions/:id/activate`](#post-apitimetableversionsidactivate) | admin | → `ActivateTimetableResult` |
| POST | [`/api/exams/generate`](#post-apiexamsgenerate) | admin | → `ExamSchedule` |
| GET | [`/api/exams`](#get-apiexams) | any signed-in | → `ExamSchedule \| null` |
| POST | [`/api/spectra/run`](#post-apispectrarun) | admin | → `SpectraRunResult` |
| GET | [`/api/export`](#get-apiexport) | admin | `?file=schedule` → `schedule.json` (file download) |
| GET | [`/api/validate`](#get-apivalidate) | admin | → `ValidatorReport` |

`User` = `{ id, email, name, role, department, faculty_id, club }` (`UserSchema`, `contracts/user.ts`); the last three are `null` when not linked.

---

### POST /api/auth/demo-login

Signs in one of the four demo accounts. Standard envelope.

| | |
|---|---|
| Who | public |
| Body | `{ "role": string }`: a role value (`"faculty"`) or its label (`"Faculty"`, `"Club Representative"`). ≤ 1 KB. |
| `data` | `User`, plus the session cookie |
| Errors | `400 VALIDATION_ERROR` (unknown role) · `403 FORBIDDEN` ("Demo sign-in is turned off on this deployment.", when `DEMO_LOGIN_ENABLED=false`) · `429 RATE_LIMITED` (30 per IP in 10 minutes; `details.retry_after_seconds` + `Retry-After`) · `500 INTERNAL_ERROR` (account could not be prepared) |

```json
{ "ok": true, "data": { "id": "u_admin", "email": "admin@cit.demo", "name": "Dean's Office", "role": "admin",
  "department": null, "faculty_id": null, "club": null } }
```

Notes: the passwords stay on the server. If a demo account is missing, unverified or its password was changed, the route re-seeds the demo accounts first, so it works on a fresh database. `DEMO_LOGIN_ENABLED` defaults to `true` (the judges need it).

### POST /api/auth/login

Email + password sign-in. Account-form shape.

| | |
|---|---|
| Who | public |
| Body | `{ email: string, password: string }`. Email is trimmed and lower-cased (≤ 254 chars); password 1–128 chars. |
| `data` | `User`, plus the session cookie. Extras: `success`, `message`, `user: { id, name, email, role: label }`. |

```json
{ "ok": true, "data": { "id": "u_faculty_f06", "email": "faculty@cit.demo", "name": "Dr. Arjun Mehta", "role": "faculty",
  "department": "CSE", "faculty_id": "F06", "club": null },
  "success": true, "message": "Signed in successfully.",
  "user": { "id": "u_faculty_f06", "name": "Dr. Arjun Mehta", "email": "faculty@cit.demo", "role": "Faculty" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid email, missing password, not JSON |
| 401 | `UNAUTHENTICATED` | "Invalid institutional email or password." (same message for an unknown email) |
| 403 | `FORBIDDEN` | Account not verified yet. Body adds `requiresOtp: true, email, message`, and a new `cit_pending_signup` cookie is set: a fresh code was just sent, so show the OTP step in this browser and call `verify-otp`. |
| 429 | `RATE_LIMITED` | 10 failed attempts per IP + email, or 20 per email, in 10 minutes |
| 503 | `MAIL_UNAVAILABLE` | Unverified account and the new code couldn't be emailed |

### POST /api/auth/logout

| | |
|---|---|
| Who | anyone (works without a session) |
| Body | none |
| Response | `{ "ok": true, "data": null, "success": true, "message": "Logged out successfully." }` and an expired cookie |
| Errors | `405` for `GET`: sign-out must be a POST, so a link can't sign anyone out |

Notes: the token's `jti` is recorded as revoked until it would have expired, so a copied cookie stops working everywhere. Other sessions of the same account are unaffected.

### GET /api/auth/me

The signed-in user as stored now. Standard envelope plus legacy fields.

```json
{ "ok": true, "data": { "id": "u_admin", "email": "admin@cit.demo", "name": "Dean's Office", "role": "admin",
  "department": null, "faculty_id": null, "club": null },
  "authenticated": true,
  "user": { "id": "u_admin", "name": "Dean's Office", "email": "admin@cit.demo", "role": "Admin", "isVerified": true } }
```

Signed out, expired, logged out, or the account is gone or unverified → `401`, and the cookie is cleared:

```json
{ "ok": false, "error": { "code": "UNAUTHENTICATED", "message": "Please sign in to continue." }, "authenticated": false, "user": null }
```

Use `data.role` (the value) for logic; `user.role` is the display label.

### POST /api/auth/signup

Self-service sign-up for **Club Representative** only. Account-form shape. The account stays unverified (no session cookie) until `verify-otp`.

| Field | Type | Rule |
|---|---|---|
| `fullName` | string | 2–80 chars, trimmed |
| `email` | string | valid email, ≤ 254 chars, lower-cased |
| `role` | string | `Club Representative` (or `club`) |
| `password` | string | 8–128 chars with an uppercase letter, a lowercase letter, a digit and a special character |
| `confirmPassword` | string | must equal `password` |
| `agreedToTerms` | `true` | required |

`data` = `{ email }`; `email` is repeated at the top level with `success` and `message`. The response sets the `cit_pending_signup` cookie.

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | First failing rule as `error`, all of them in `details.fieldErrors`; unknown role |
| 403 | `FORBIDDEN` | Faculty: "Faculty accounts are set up by the Dean's office. Use a demo account." · Admin or Department Coordinator: "…can't be created by sign-up. Sign in with the demo accounts…" |
| 409 | `EMAIL_TAKEN` | A verified account already uses this email |
| 409 | `CONFLICT` | A code for this email is still active and was requested from another browser ("…Enter the emailed code in the browser you signed up in, or try again in N minutes."), or a concurrent sign-up changed it |
| 429 | `RATE_LIMITED` | 10 sign-ups per IP or 5 per email in 10 minutes, or 5 verification emails per address |
| 503 | `MAIL_UNAVAILABLE` | Mail isn't configured (production), Brevo rejected the email, or the global hourly email cap is reached |

Notes:
- Re-submitting from the same browser (or from any browser once the 10-minute code has expired) replaces the pending details and sends a new code.
- Unverified accounts are deleted after 24 hours.
- The code is never returned. In development without a mail key it is printed to the server console (`[dev] OTP for <email>: <code>`); in production without a key the route answers `503 MAIL_UNAVAILABLE`. Mail transport: a `BREVO_API_KEY` starting with `xsmtpsib-` uses the Brevo SMTP relay (`BREVO_SMTP_LOGIN` — or its alias `BREVO_SMTP_USER` — required; `BREVO_SMTP_HOST`/`BREVO_SMTP_PORT` optional), any other key uses the Brevo REST API.

### POST /api/auth/verify-otp

| | |
|---|---|
| Who | public, from the browser holding the `cit_pending_signup` cookie |
| Body | `{ email: string, otp: string }` (`otp` is exactly 6 digits) |
| `data` | `User`, plus the session cookie; the pending cookie is cleared. Same extras as login; `message` is "Email verified successfully! Session established." |

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | No pending cookie, or another browser's: "Finish verification in the browser where you signed up, or sign in again to get a new code." · no pending code · code expired (10 minutes) · wrong code ("Incorrect code. 3 attempts left.") |
| 429 | `RATE_LIMITED` | 30 requests per IP or 10 per email in 10 minutes, or 5 wrong codes (the code is cleared; request a new one) |

### POST /api/auth/resend-otp

| | |
|---|---|
| Who | public, from the browser holding the `cit_pending_signup` cookie |
| Body | `{ email: string }` |
| `data` | `null`, with `success` and `message` at the top level; the pending cookie is refreshed |
| Errors | `400 VALIDATION_ERROR` ("No pending verification for this email in this browser. Sign up or sign in again.") · `429 RATE_LIMITED` (10 per IP in 10 minutes, or 5 emails per address) · `503 MAIL_UNAVAILABLE` |

### GET /api/auth/google

**Not available yet.** Always answers `302` to `/login?error=google_unavailable`, whatever `GOOGLE_CLIENT_ID` says; the callback (with `state` and PKCE) isn't built. Hide the Google button or show a message for that query parameter.

### GET /api/health

Liveness probe. Public, always `200` while the app runs.

```json
{ "ok": true, "data": { "status": "ok", "db": "up", "dataset_id": "cit-public-v1", "time": "2026-10-31T11:35:41.558Z" } }
```

`db` is `"up"` or `"down"`. `dataset_id` is the loaded dataset's, or the bundled file's when the database is down or empty.

### GET /api/dashboard

| | |
|---|---|
| Who | any signed-in user; the numbers depend on the role |
| `data` | `Dashboard` (`DashboardSchema`, `contracts/dashboard.ts`) |
| Errors | `401` |

```json
{ "ok": true, "data": {
  "role": "admin", "dataset_id": "cit-public-v1",
  "timetable": { "version_id": null, "sessions_total": 189, "sessions_scheduled": 0, "hard_violation_count": null, "soft_penalty": null },
  "exams": { "schedule_id": null, "exams_total": 41, "exams_scheduled": 0, "penalty": null },
  "bookings": { "requests_total": 25, "cancelled": 1, "undecided": 24,
    "by_status": { "approved": 0, "alternative_offered": 0, "rejected": 0 }, "session_overrides": 0 },
  "pending_approvals": { "booking_requests": 0, "change_requests": 0, "total": 0 },
  "mine": { "booking_requests": 0, "booking_requests_open": 0, "change_requests": 0, "change_requests_pending": 0,
    "sessions_total": null, "sessions_scheduled": null },
  "utilisation": { "days": ["MON", "TUE", "WED", "THU", "FRI"], "periods": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    "rooms": [ { "room_id": "AUD", "busy": [[0,0,0,0,0,0,0,0,0], "…4 more days"], "fraction": 0 }, "…26 more rooms" ],
    "overall": 0 } } }
```

| Block | What it holds |
|---|---|
| `timetable` | Active version's coverage and quality. `version_id`, `hard_violation_count`, `soft_penalty` are `null` before a timetable is generated. |
| `exams` | Active exam schedule's coverage; `schedule_id` and `penalty` `null` before one exists. |
| `bookings` | Spectra-week requests (drafts excluded): total, cancelled, still undecided, decisions per status, Week-7 session overrides. |
| `pending_approvals` | What this user may act on now. Admin: requests in `pending_approval` + `pending` change requests. Coordinator: `pending_approval` requests for their department's labs. Faculty and club: 0. Never the user's own requests. |
| `mine` | The user's own requests (created by them, or dataset requests whose requester is their club or faculty name). `sessions_total` / `sessions_scheduled` for a faculty login only, else `null` (the faculty demo has 7 sessions; the club demo has 1 request). |
| `utilisation` | Regular-week room use from the active timetable. `busy[d][p]` is 1 when the room is in use on `days[d]` at `periods[p]`; `fraction` per room; `overall` across all rooms. All zeros before generation. |

### GET /api/timetable

One student group's, faculty member's or room's week. Every role can read every view.

| Query | Type | |
|---|---|---|
| `view` | `group` \| `faculty` \| `room` | required |
| `id` | string | required: a group (`Y1-A`, `CSE-2`), faculty (`F06`) or room (`LH-1`) id, matching `view` |
| `week` | `regular` \| `spectra` | default `regular` |

`data` is `TimetableView` (`contracts/timetable.ts`):

```ts
{ view, id, week, version_id: string | null,
  cells: TimetableCell[],          // { session_id, course_id, kind, groups, faculty_id, room_id, day, start_period,
                                   //   duration, basket_slot, size, override: { displaced_by } | null }
  bookings: TimetableBookingCell[] // { request_id, title, room_id, day, start_period, end_period (inclusive),
                                   //   status, effective_category }
}
```

```json
{ "ok": true, "data": { "view": "faculty", "id": "F06", "week": "spectra", "version_id": null, "cells": [], "bookings": [] } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid `view` / `id` / `week` |
| 404 | `NOT_FOUND` | Unknown id, e.g. "No room with id NOPE." |

Notes:
- **No timetable yet is not an error:** `version_id: null` with empty `cells` (and `bookings`), e.g. right after a dataset import (a reset generates one). Show an empty state.
- `week=spectra` applies the Week-7 session overrides (a moved cell has `override.displaced_by`) and adds bookings that hold a room (`approved` or `alternative_offered`; cancelled requests skipped). Room view matches bookings by room, group view by the request's `mandatory_for_groups`, faculty view by requester name.
- Cells and bookings are sorted by day, then start period.

### POST /api/timetable/check

What-if check: the given placements replace those sessions' placements in the active timetable; everything else stays put. Nothing is saved.

| | |
|---|---|
| Who | any signed-in user |
| Body | `TimetableCheckRequest`: `{ "assignments": Assignment[] }`, `Assignment` = `{ session_id, day: "MON"…"FRI", start_period: 1–9, room_id }` |
| `data` | `TimetableCheckResult`: `{ violations: Violation[], soft_penalty: { S1…S6, total }, soft_delta: number \| null }`. `violations` and `soft_penalty` are totals for the whole merged timetable; `soft_delta` is the merged total minus the active timetable's (negative is better), `null` without an active timetable. |
| Errors | `400 VALIDATION_ERROR` · `401` |

Example: two sessions placed in `LH-1`, Monday P1, with no active timetable:

```json
{ "ok": true, "data": {
  "violations": [
    { "rule": "H1", "where": "timetable", "detail": "Session MA101-AB-L1 is not scheduled" },
    "…186 more H1",
    { "rule": "H4", "where": "timetable", "detail": "LH-1 double-booked MON P1: CS202-L1, CS303-L1" },
    { "rule": "H2", "where": "timetable", "detail": "F06 double-booked MON P1: CS202-L1, CS303-L1" } ],
  "soft_penalty": { "S1": 0, "S2": 0, "S3": 0, "S4": 0, "S5": 1, "S6": 0, "total": 1 },
  "soft_delta": null } }
```

Notes: `Violation` = `{ rule, where, detail, refs? }` (`contracts/violation.ts`), worded exactly as `validator.py`. With no active timetable, every session you don't send is reported as `H1 … is not scheduled`.

### GET /api/rooms/available

Rooms that match the filters, with what occupies each one in the period range. This is the **Week-7 picture**: the active timetable with Week-7 session overrides, bookings that hold a room (`approved`, `alternative_offered`) and room unavailability.

| Query | Type | |
|---|---|---|
| `day` | `MON`…`FRI` | required |
| `from_period`, `to_period` | integers 1–13, inclusive, `to_period ≥ from_period` | required |
| `use` | `lecture`, `tutorial`, `lab`, `exam`, `event` | default `event`; rooms whose `allowed_uses` lack it are left out |
| `min_capacity` | integer ≥ 0 | optional |
| `needs` | comma list or repeated key: `projector`, `ac`, `pa_system`, `stage`, `power_benches`, `computers`, `accessible` | optional; the room must have all |
| `types` | comma list or repeated key: `classroom`, `lecture_hall`, `auditorium`, `seminar_hall`, `outdoor`, `lab_cs`, `lab_elec`, `lab_phy`, `workshop`, `lab_civil` | optional; any of them |
| `accessible` | `true` / `false` | optional |

`data` is `RoomAvailability[]`: `{ room_id, free, busy_with: [{ kind: "session" | "booking" | "unavailable", id, label }] }`.

```json
// ?day=THU&from_period=10&to_period=12&min_capacity=150&needs=stage,pa_system
{ "ok": true, "data": [
  { "room_id": "SH-1", "free": true, "busy_with": [] },
  { "room_id": "AUD", "free": true, "busy_with": [] },
  { "room_id": "OAT", "free": true, "busy_with": [] } ] }

// ?day=THU&from_period=1&to_period=2&types=lecture_hall (trimmed)
[ { "room_id": "LH-3", "free": true, "busy_with": [] }, "…",
  { "room_id": "LH-4", "free": false,
    "busy_with": [{ "kind": "unavailable", "id": "LH-4", "label": "Ceiling repair (whole of Thursday)" }] } ]

// ?day=MON&from_period=1&to_period=2&use=lab&min_capacity=85
[ "CS-LAB-1", "CS-LAB-2", "MECH-WS", "PHY-LAB" ]   // room_ids only; all free
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/invalid `day`, periods or `use`; `to_period` before `from_period` |

Notes:
- Every matching room is returned: free rooms first, then by capacity (smallest first), then id.
- In the bundled dataset every room allows `event`, so the default lists all 27; `use=lab` lists only the labs and the workshop.
- `busy_with` ids: a session id (label like `CS202 lecture · CSE-2`, with `(moved for <request>)` when overridden), a booking request id (label = request title), or the room id for maintenance (label = reason).
- Unknown `needs` / `types` values aren't rejected; they simply match no room.
- Before any timetable is active (e.g. right after an import), only room unavailability shows up as busy.

### GET /api/settings

| | |
|---|---|
| Who | any signed-in user |
| `data` | `Settings` (`contracts/settings.ts`). Defaults until an admin saves: `team` from `TEAM_NAME`, the dataset's priority order, `LLM_ENABLED`, `APP_REFERENCE_DATE`, `SOLVER_SEED`. |

```json
{ "ok": true, "data": { "team": "CIT Crunch Week",
  "priority_order": ["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
  "llm_enabled": true, "reference_date": "2027-02-08", "solver_seed": 42 } }
```

### PATCH /api/settings

| | |
|---|---|
| Who | admin |
| Body | `SettingsPatch`: any subset of `team` (1–100 chars), `priority_order`, `llm_enabled`, `reference_date` (`YYYY-MM-DD`), `solver_seed` (integer ≥ 0); at least one; unknown fields rejected |
| `data` | the updated `Settings` (the change is written to the audit log) |
| Errors | `400 VALIDATION_ERROR` ("Nothing to update"; `priority_order` must list all six categories exactly once) · `401` · `403` (`details: { role, allowed: ["admin"] }`) |

### POST /api/admin/reset

Resets the demo data. Same as `npm run seed`.

| | |
|---|---|
| Who | admin |
| Body | optional. None, or `{ "from": "bundled" \| "stored" }` (no other fields). `bundled` (default) loads `data/cit_public.json`, a clean state; `stored` re-imports the last uploaded dataset (or the bundled file when nothing was uploaded). |
| `data` | `ResetReport` (`src/lib/contracts/admin.ts`) |
| Errors | `400 VALIDATION_ERROR` · `401` · `403` · `409 CONFLICT` ("Another reset, import or schedule run is in progress. Try again in a moment.") |

What it does, under the dataset lock, in order: deletes timetable versions, exam schedules, booking decisions, session overrides, change requests and settings; ensures indexes; imports the dataset; re-seeds the four demo users (existing sessions keep working); writes default settings; then **generates a timetable** with `settings.solver_seed`, **activates** it (which runs Spectra decisions) and **schedules exams**; writes an audit entry. Users, the audit log and AI logs survive. An infeasible step reports `null` for its id instead of failing the reset. About 1 s on the bundled dataset.

```json
{ "ok": true, "data": {
  "timetable_version": "TT-0001", "exam_schedule_id": "EXS-0001", "decisions": 25,
  "dataset": { "dataset_id": "cit-public-v1", "source": "bundled", "loaded_at": "2026-10-31T17:08:08+05:30",
    "counts": { "rooms": 27, "room_unavailability": 2, "faculty": 40, "student_groups": 14, "courses": 62,
      "sessions": 189, "exams": 41, "booking_requests": 25, "cancellations": 1 },
    "duplicate_cancellations": [], "cleared": { "timetable_versions": 0, "…": 0 } },
  "cleared": { "timetable_versions": 0, "exam_schedules": 0, "booking_decisions": 0, "session_overrides": 0,
    "change_requests": 0, "settings": 1 },
  "indexes": 29, "users": { "inserted": 0, "updated": 0 },
  "settings": { "team": "CIT Crunch Week", "…": "…" }, "ms": 759 } }
```

`decisions` is the number of Week-7 requests decided (every dataset request, including the cancelled one).

### POST /api/admin/dataset

Replaces the dataset with an uploaded file.

| | |
|---|---|
| Who | admin |
| Body | the file's JSON itself (`cit_public.json` shape, `Dataset` contract). `Content-Type: application/json`, ≤ 2 MB (the public file is about 140 KB). No multipart: read the file with `await file.text()` and send that as the body. |
| `data` | `ImportReport` (`src/lib/contracts/admin.ts`) |

```json
{ "ok": true, "data": { "dataset_id": "cit-public-v1", "source": "upload", "loaded_at": "2026-10-31T17:08:08+05:30",
  "counts": { "rooms": 27, "room_unavailability": 2, "faculty": 40, "student_groups": 14, "courses": 62,
    "sessions": 189, "exams": 41, "booking_requests": 25, "cancellations": 1 },
  "duplicate_cancellations": [],
  "cleared": { "timetable_versions": 0, "exam_schedules": 0, "booking_decisions": 0, "session_overrides": 0, "change_requests": 0 } } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid file: `details = { issue_count, issues: [{ path, message }] }` (first 50 issues, dotted paths like `sessions.12.duration`) · body over 2 MB (`details.max_bytes`) · not JSON |
| 401 / 403 | | not signed in / not admin |
| 409 | `CONFLICT` | Another reset, import or schedule run holds the dataset lock |

The whole file is checked before anything is written, so a rejected file leaves the database untouched. Besides the field rules, the check rejects duplicate ids, role caps missing from `priority_order`, and **dangling references**: a session's `faculty_id`, `groups` or `course_id` (when the file lists courses), an exam's `groups`, a room-unavailability `room_id`, a request's `mandatory_for_groups` and a cancellation's `request_id` must all name entries in the file. An unknown `requested_room` is allowed (it's only a wish).

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "The dataset file is invalid.",
  "details": { "issue_count": 2, "issues": [
    { "path": "sessions.0.faculty_id", "message": "Unknown faculty \"F99\"" },
    { "path": "cancellations.0.request_id", "message": "Unknown booking request \"R-NOPE\"" } ] } } }
```

What an import does: replaces every reference collection (rooms, faculty, groups, courses, sessions, exams, booking requests, cancellations, room unavailability); **clears** timetable versions, exam schedules, booking decisions, session overrides and change requests (they belong to the old data); **resets** the saved settings' `priority_order` to the new dataset's; stores requests named in `cancellations` as cancelled (repeats are listed in `duplicate_cancellations`); keeps the raw file so `reset` with `{"from":"stored"}` reloads it; writes an audit entry. If the database fails part-way through the writes, recover with `POST /api/admin/reset`.


### POST /api/timetable/generate

Generates a timetable for the active dataset: greedy construction, min-conflicts repair, then simulated annealing on the soft penalties with hard constraints held at 0, then an independent re-check with the validator port. Deterministic for a given seed whenever the run ends on its iteration budget or converges (`solver_meta.stopped_by` is `iterations` or `converged`); `time` means the safety cap cut it short, which can differ between machines. Fest-aware: it keeps rooms and compulsory groups free where Week-7 booking requests need them.

| | |
|---|---|
| Who | admin |
| Body | optional, strict: `{ "seed"?: 0…4294967295, "time_budget_ms"?: 200…30000, "activate"?: boolean }`. `seed` defaults to `settings.solver_seed`, `time_budget_ms` to `SOLVER_TIME_BUDGET_MS` (8000, at most 30000; a safety cap on active solver time: the iteration budget normally ends the run first), `activate` to `false`. |
| `data` | `GenerateTimetableResult` = `{ version: TimetableVersion, activated: boolean, spectra: SpectraRunSummary \| null }`. Without `activate` the version is a `draft` and `spectra` is `null`; with it, the version becomes active and Spectra decisions are re-run (`spectra` = their summary). |
| Errors | `400 VALIDATION_ERROR` (incl. a body over 1 KB or without a JSON content type) · `401` · `403` · `409 CONFLICT` (dataset lock busy) · `409 HARD_CONSTRAINT` (activation re-check) · `422 INFEASIBLE` (`details: { unplaced, unplaced_total, violations, violations_total, issues }`, lists capped at 50; nothing is saved) · `429 RATE_LIMITED` (schedule-run quota) |

```json
{ "ok": true, "data": {
  "version": { "id": "TT-0003", "dataset_id": "cit-public-v1", "status": "active", "source": "generate",
    "parent_version": "TT-0002", "change_request_id": null,
    "assignments": [ { "session_id": "MA101-AB-L1", "day": "WED", "start_period": 5, "room_id": "LH-1" }, "…189 total" ],
    "hard_violation_count": 0,
    "soft_penalty": { "S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0, "total": 3 },
    "solver_meta": { "seed": 42, "ms": 23, "iterations": 183, "algorithm": "greedy+repair+SA", "stopped_by": "converged" },
    "created_by": "u_admin", "created_at": "2026-10-31T20:37:53+05:30" },
  "activated": true,
  "spectra": { "timetable_version": "TT-0003", "approved": 22, "alternatives": 1, "rejected": 2,
    "session_overrides": 0, "booking_score": 67, "booking_score_max_if_all_approved": 70, "priority_inversions": [] } } }
```

**Live progress (SSE).** Send `Accept: text/event-stream` and the same body. The dataset lock is taken before the stream opens, so a busy lock is still a plain JSON `409`. Then the response is `200` with `content-type: text/event-stream; charset=utf-8` and `cache-control: no-store, no-transform`, and frames like:

```text
event: progress
data: {"phase":"construct","iteration":183,"hard":0,"soft":4,"fest":0,"best":4,"temperature":null,"ms":30}

event: progress
data: {"phase":"anneal","iteration":5000,"hard":0,"soft":113,"fest":0,"best":4,"temperature":2.976424440835708,"ms":54}

event: progress
data: {"phase":"verify","iteration":1583697,"hard":0,"soft":3,"fest":0,"best":3,"temperature":null,"ms":2086}

event: result
data: { …GenerateTimetableResult… }
```

(Seed 1, captured; trimmed to three of the progress frames.)

- `progress` (`SolverProgress`): about one every 100 ms of solver time, plus the first of each phase and the final `verify`. `hard` = sessions not yet placed, `soft` = current S1–S6 total, `fest` = current fest cost, `best` = best soft + fest so far, `temperature` only while annealing, `ms` = solver time so far.
- Then exactly one `result` (as `data` above) or `error` (`{ "code", "message", "details"? }`, the same fields as the error envelope; an unexpected failure is `INTERNAL_ERROR` with a generic message).
- Read it with `fetch` and `response.body.getReader()`; `EventSource` can't send a POST. If the client disconnects, the run still finishes, is saved and releases the lock.
- Most seeds finish in well under a second on the bundled dataset (seed 42: 23 ms, straight from construction); harder seeds anneal for a few seconds.

### GET /api/timetable/versions

| | |
|---|---|
| Who | admin |
| `data` | `TimetableVersionSummary[]`: newest first (up to 50), each version without `assignments` and with `assignment_count`. Only the active version and the 20 newest drafts/superseded versions are kept; older ones are deleted after each run. |

```json
{ "ok": true, "data": [ { "id": "TT-0002", "dataset_id": "cit-public-v1", "status": "draft", "source": "generate",
  "parent_version": "TT-0001", "change_request_id": null, "hard_violation_count": 0,
  "soft_penalty": { "S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0, "total": 3 },
  "solver_meta": { "seed": 1, "ms": 2086, "iterations": 1583697, "algorithm": "greedy+repair+SA" },
  "created_by": "u_admin", "created_at": "2026-10-31T20:35:56+05:30", "assignment_count": 189 }, "…" ] }
```

### POST /api/timetable/versions/:id/activate

Makes a version the active timetable (the previous one becomes `superseded`) and re-runs Spectra decisions for it, because decisions and Week-7 overrides belong to the active version.

| | |
|---|---|
| Who | admin |
| Body | none |
| `data` | `ActivateTimetableResult` = `{ version: TimetableVersion, spectra: SpectraRunSummary }` |
| Errors | `401` · `403` · `404 NOT_FOUND` (unknown or malformed id; ids look like `TT-0003`) · `409 STALE_VERSION` (built for another dataset) · `409 HARD_CONSTRAINT` (`details` = violations against the current data, first 50) · `409 CONFLICT` (lock busy) · `429 RATE_LIMITED` · `500` if the booking engine's self-check fails or the decisions can't be saved (the previous version stays active) |

```json
{ "ok": true, "data": {
  "version": { "id": "TT-0002", "status": "active", "…": "…" },
  "spectra": { "timetable_version": "TT-0002", "approved": 22, "alternatives": 1, "rejected": 2,
    "session_overrides": 0, "booking_score": 67, "booking_score_max_if_all_approved": 70, "priority_inversions": [] } } }
```

### POST /api/exams/generate

Schedules the midsem exams into the exam week (days × AM/PM): DSATUR colouring of the shared-group conflict graph, rooms packed best-fit-decreasing at half capacity. The new schedule is activated straight away (exams don't depend on the timetable).

| | |
|---|---|
| Who | admin |
| Body | none |
| `data` | the active `ExamSchedule` (`solver_meta.algorithm: "dsatur+bfd"`) |
| Errors | `401` · `403` · `409 CONFLICT` · `422 INFEASIBLE` (`details: { unplaced, unplaced_total, violations, violations_total }`) · `429 RATE_LIMITED` |

### GET /api/exams

| | |
|---|---|
| Who | any signed-in user |
| `data` | the active `ExamSchedule`, or `null` before one exists |

```json
{ "ok": true, "data": { "id": "EXS-0001", "dataset_id": "cit-public-v1", "status": "active",
  "exams": [ { "exam_id": "EX-MA101", "day": "WED", "session": "AM", "rooms": ["AUD", "LH-2", "CR-205"] }, "…41 total" ],
  "penalty": 0, "solver_meta": { "seed": 0, "ms": 4, "iterations": 41, "algorithm": "dsatur+bfd" },
  "created_by": "u_admin", "created_at": "2026-10-31T20:35:29+05:30" } }
```

`penalty` is the exam soft penalty (5 per extra exam a group sits on the same day).

### POST /api/spectra/run

Re-decides every Week-7 booking request against the active timetable: priority order (effective category, then submission time), best-fit rooms inside the window (a different room inside the window is still `approved`), institute events may move sessions for Week 7 only, then an alternative outside the window, else a rejection with a specific reason. Self-checked with the validator port before anything is stored.

| | |
|---|---|
| Who | admin |
| Body | none |
| `data` | `SpectraRunResult` = the summary (`timetable_version, approved, alternatives, rejected, session_overrides, booking_score, booking_score_max_if_all_approved, priority_inversions`) + `decisions: StoredBookingDecision[]` (dataset order) + `overrides: StoredSessionOverride[]` |
| Errors | `401` · `403` · `404 NOT_FOUND` ("No active timetable — generate one first.") · `409 CONFLICT` · `429 RATE_LIMITED` · `500` if the self-check fails (nothing is stored) |

```json
{ "ok": true, "data": { "timetable_version": "TT-0002", "approved": 22, "alternatives": 1, "rejected": 2,
  "session_overrides": 0, "booking_score": 67, "booking_score_max_if_all_approved": 70, "priority_inversions": [],
  "decisions": [
    { "request_id": "BR-07", "status": "approved", "day": "THU", "start_period": 10, "end_period": 12, "room_id": "AUD",
      "reason": "SH-1 is held by BR-06 (club event, submitted earlier). AUD has stage and pa_system and is free inside your window, THU P10–P12 (18:00–21:00).",
      "reason_code": "ROOM_SWAPPED_IN_WINDOW", "effective_category": "club_event", "category_capped": false,
      "requires_admin_approval": false, "auto": true, "decided_by": "engine", "approved_by": null,
      "timetable_version": "TT-0002", "decided_at": "2026-10-31T20:37:52+05:30" },
    { "request_id": "BR-09", "status": "rejected",
      "reason": "No auditorium/outdoor venue seats 1,200. The largest is OAT (800).", "reason_code": "REJ_NO_CAPACITY", "…": "…" },
    { "request_id": "BR-17", "status": "alternative_offered", "day": "WED", "start_period": 9, "end_period": 10, "room_id": "OAT",
      "reason": "WED P13–P14 is outside 08:00–22:00; events end at 22:00 (P13). Offered OAT WED P9–P10 (17:00–19:00) instead (outside your window).",
      "reason_code": "ALT_OUTSIDE_WINDOW", "…": "…" },
    "…25 total" ],
  "overrides": [] } }
```

Notes:
- `reason_code` is one of `ReasonCode` (`src/lib/contracts/booking.ts`); `category_capped` is true when the claimed category was lowered to the requester's role cap (show a "category capped" badge); `requires_admin_approval` is true when the decision moves sessions (`overrides` then lists them, with `displaced_by`).
- `approved_by` is `null` for plain engine decisions; for a decision that moves sessions it is the admin whose run applied the Week-7 moves (the overrides carry the same `approved_by`).
- The summary fields are the validator's booking stats, with the same names as `ValidatorReport.bookings`.
- Only dataset requests are decided in Phase 3, with the dataset's own `priority_order` (the editable `settings.priority_order` doesn't change exported decisions).
- Rejected decisions carry no slot fields.

### GET /api/export

Downloads `schedule.json` in the official format: the active timetable, its Spectra decisions and Week-7 overrides, the active exam schedule, and `settings.team`. Refuses to produce a file that the validator port finds any hard violation in.

| | |
|---|---|
| Who | admin |
| Query | `file=schedule` (the default; any other value is `400`). `schedule_after` arrives with rescheduling in Phase 5. |
| Response | **the file itself, not an envelope**: pretty-printed JSON, `content-type: application/json; charset=utf-8`, `content-disposition: attachment; filename="schedule.json"`, `cache-control: no-store` |
| Errors | `400 VALIDATION_ERROR` · `401` · `403` · `409 HARD_CONSTRAINT` (`details` = the violations, first 50; no file) · `409 CONFLICT` (a dataset request has no decision for the active timetable, `details.missing`; run `POST /api/spectra/run`) |

In the UI, call `GET /api/validate` first and enable a plain `<a href="/api/export?file=schedule" download>` only when `hard_violation_count === 0` (a download link can't see a `409`); or `fetch` it and save the blob. From a shell, `npm run export` (below) does the same and writes `exports/schedule.json`.

### GET /api/validate

The in-app validator report for what an export would contain right now (no gate).

| | |
|---|---|
| Who | admin |
| `data` | `ValidatorReport` (`src/lib/contracts/violation.ts`): the same sections as `validator.py` |

```json
{ "ok": true, "data": { "dataset_id": "cit-public-v1", "schedule_dataset_id": "cit-public-v1", "team": "CIT Crunch Week",
  "soft_penalties": { "S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0 }, "soft_total": 3,
  "bookings": { "booking_score": 67, "booking_score_max_if_all_approved": 70, "approved": 22, "alternatives": 1,
    "rejected": 2, "session_overrides": 0, "priority_inversions": [] },
  "exam_soft_penalty": 0, "hard_violations": [], "hard_violation_count": 0, "hard_by_rule": {}, "warnings": [] } }
```

### `npm run export`

Not a route: `npm run export [-- --url <base>]` (or `APP_URL`; default `http://localhost:3000`) signs in over HTTP with `EXPORT_EMAIL` / `EXPORT_PASSWORD` (an admin account) when both are set, otherwise as the demo admin; downloads `GET /api/export?file=schedule` into `exports/schedule.json` exactly as served; prints the validator summary; and signs out (the token is revoked). Plain `http:` is only accepted for localhost, and redirects are never followed. It exits `1` on any error (on a `409` it prints the first 10 violations). Check the file with `npm run validate` (the official `validator.py`).

---

## Coming in later phases

Planned routes, with their request/response shapes, are listed in [architecture.md §6](./architecture.md#6-api-catalogue). Phases may shift; this page is updated as each one lands.

| Phase | Routes |
|---|---|
| 4: bookings and AI | `POST /api/bookings/parse`, `GET` / `POST /api/bookings`, `POST /api/bookings/:id/cancel` |
| 5: changes and approvals | `GET` / `POST /api/changes`, `POST /api/changes/:id/approve` · `/reject`, `POST /api/bookings/:id/decide`, `POST /api/manual/place`, `POST /api/assistant`, `POST /api/explain` |
