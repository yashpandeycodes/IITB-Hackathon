# API reference

> The routes that exist today (end of Phase 5: auth, data, read views, timetable generation, exams, Spectra decisions, export, the validator report, plain-language booking parsing, the bookings API, change requests with approval and rescheduling, manual placement, the timetable assistant and explanations). The full catalogue is in [architecture.md §6](./architecture.md#6-api-catalogue). Types come from `src/lib/contracts` (`import type { User, Dashboard } from "@/lib/contracts"`). Example responses below were captured from a local server (or the same services on a local database) on the bundled dataset; long arrays are trimmed.

## Contents

- [Basics](#basics)
- [Signing in](#signing-in)
- [Response shapes](#response-shapes)
- [Error codes](#error-codes)
- [Rate limits](#rate-limits)
- [Endpoints](#endpoints)
  - [Change requests and rescheduling](#change-requests-and-rescheduling)
  - [Assistant and explanations](#assistant-and-explanations)
  - [Export and validator](#get-apiexport)
- [Coming in later phases](#coming-in-later-phases)

---

## Basics

| Topic | Rule |
|---|---|
| Base path | `/api` on the app's own origin, e.g. `http://localhost:3000/api`. Call relative paths (`/api/dashboard`). |
| Format | JSON in, JSON out. A request with a body must send `Content-Type: application/json`, otherwise `400 VALIDATION_ERROR` ("Content-Type must be application/json."). |
| Body size | 1 MB by default (incl. `POST /api/changes` and `/changes/preview`); 2 MB for `POST /api/admin/dataset`; 16 KB for the account forms (login, signup, OTP) and `POST /api/bookings`; 8 KB for `bookings/parse` and `assistant`; 4 KB for `manual/place`, `changes/:id/approve` · `/reject` and `explain`; 1 KB for demo-login. Too large → `400 VALIDATION_ERROR` with `details.max_bytes`. |
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
curl -s -c /tmp/cit.jar -X POST -H 'content-type: application/json' \
  -d '{"role":"admin"}' localhost:3000/api/auth/demo-login
curl -s -b /tmp/cit.jar localhost:3000/api/dashboard
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
| `VALIDATION_ERROR` | 400 | Body or query failed validation, wrong content type, body too large, bad dataset file (incl. dangling references), wrong/expired OTP, OTP step from another browser; a change request over the [request limits](#request-limits), or one that doesn't fit its kind, names unknown ids or would change nothing (`details` = `PathIssue[]`: `[{ path, message }]`, paths like `changes[0].faculty_id`) | every route with input |
| `UNAUTHENTICATED` | 401 | No valid session (missing, expired, logged out, account gone), or wrong email/password | proxy, every data route, `me`, `login` |
| `FORBIDDEN` | 403 | Role not allowed (`details: { role, allowed }`); Faculty or staff role at sign-up; unverified account at login (`requiresOtp`); demo sign-in turned off; cross-origin mutation; a change outside the user's department or own sessions (`details.issues`) | admin routes, `PATCH /settings`, `signup`, `login`, `demo-login`, proxy, `GET /bookings?scope=all`, `bookings/:id/cancel` (not owner/admin), `bookings/:id/decide` (wrong approver), `changes` routes (club, out of scope, approve by a non-admin, reject by someone else), `manual/place`, `assistant` (club) |
| `SELF_APPROVAL` | 403 | Approver is the requester | `bookings/:id/decide`; `changes/:id/approve` for the admin's own request, unless it is a change file or manual edit (`disruption` or `manual_edit`) they filed as admin (see [approve](#post-apichangesidapprove)) |
| `NOT_FOUND` | 404 | Unknown id (or a booking or change request you may not see); no active timetable yet | `GET /timetable`, `versions/:id/activate`, `spectra/run`, `GET /bookings/:id`, `bookings/:id/cancel`, `bookings/:id/decide`, `GET /changes/:id`, `changes/:id/approve` · `/reject`, `explain` |
| `HARD_CONSTRAINT` | 409 | Engine found violations (`details` = `Violation[]`) | `export`, `versions/:id/activate`, `generate` with `activate`, `manual/place` without `repair`, `changes/:id/approve` (the proposal no longer holds) |
| `STALE_VERSION` | 409 | Timetable built for another dataset; a change proposal built on a timetable that is no longer active (the proposal is rejected) | `versions/:id/activate`, `changes/:id/approve` |
| `EMAIL_TAKEN` | 409 | A verified account already uses this email | `signup` |
| `CONFLICT` | 409 | Another reset, import, schedule run, booking or timetable change holds the dataset lock; a sign-up for this email is waiting for verification in another browser; a booking write that can't apply (open-request cap reached, no imported dataset, cancelling a dataset request, deciding one that isn't pending); a change write that can't apply (no dataset or active timetable, 20 open requests already, the request isn't pending, its draft is gone, the first approval while `schedule.json` isn't exportable); activating a change request's draft directly; an export file that doesn't exist yet (`schedule_after`, `disruption` before any applied change) | `admin/reset`, `admin/dataset`, `timetable/generate`, `versions/:id/activate`, `exams/generate`, `spectra/run`, `signup`, `POST /bookings`, `bookings/:id/cancel`, `bookings/:id/decide`, `POST /changes`, `changes/preview`, `manual/place`, `changes/:id/approve` · `/reject`, `export`, `validate` |
| `INFEASIBLE` | 422 | No valid schedule exists (`details`: unplaced items + blocking violations) | `timetable/generate`, `exams/generate` (a change with no valid fix is not an error: it is stored as `infeasible` with its conflict report) |
| `RATE_LIMITED` | 429 | Too many attempts; `details.retry_after_seconds` and a `Retry-After` header | `login`, `signup`, `verify-otp`, `resend-otp`, `demo-login`, schedule runs (`generate`, `activate`, `exams/generate`, `spectra/run`), `bookings/parse`, booking writes, change runs, `assistant`, `explain` |
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic message, details never exposed | any |
| `LLM_UNAVAILABLE` | 503 | Gemini failed; switch to the manual form | not used: the parser falls back to the rule parser instead (`fallback_reason`) |
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
| 30 parses / 10 min | user | `bookings/parse` (each may cost an LLM call; failed validation counts too) |
| 120 parses / 10 min | IP | `bookings/parse` |
| 30 booking writes / 10 min | user | `POST /api/bookings`, `bookings/:id/cancel`, `bookings/:id/decide` together |
| 120 booking writes / 10 min | IP | same routes |
| 30 change runs / 10 min | user | `POST /api/changes`, `changes/preview`, `manual/place`, `changes/:id/approve`, `changes/:id/reject` together (each runs the rescheduler or holds the dataset lock) |
| 120 change runs / 10 min | IP | same routes |
| 30 assistant turns / 10 min | user | `POST /api/assistant` (each may cost up to two LLM calls) |
| 120 assistant turns / 10 min | IP | `POST /api/assistant` |
| 60 explanations / 10 min | user | `POST /api/explain` |
| 30 model-phrased explanations / 10 min | user | `GET /bookings/:id`, `POST /api/explain` and assistant replies together; past it the template text is shown instead (never a 429) |

The role is checked before any quota is counted: a club calling `POST /api/changes` or `/preview` gets `403` (even with a bad body), and so do a non-admin calling `changes/:id/approve` and a club calling `changes/:id/reject`, without using change-run quota.

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
| GET | [`/api/auth/session-expired`](#get-apiauthsession-expired) | public | clears the session cookie, `303` → `/login?redirect=…` |
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
| GET | [`/api/spectra`](#get-apispectra) | any signed-in | → `SpectraState` |
| GET | [`/api/reference`](#get-apireference) | any signed-in | → `ReferenceData` |
| POST | [`/api/bookings/parse`](#post-apibookingsparse) | any signed-in | `{ text }` → `ParseBookingResult` |
| GET | [`/api/bookings`](#get-apibookings) | any signed-in | `?scope=mine\|all\|approvals&state=` → `BookingView[]` |
| POST | [`/api/bookings`](#post-apibookings) | any signed-in | `CreateBookingRequest` → `CreateBookingResult` (201) |
| GET | [`/api/bookings/:id`](#get-apibookingsid) | owner, admin, approver | → `BookingDetail` |
| POST | [`/api/bookings/:id/cancel`](#post-apibookingsidcancel) | owner, admin | → `BookingView` |
| POST | [`/api/bookings/:id/decide`](#post-apibookingsiddecide) | approver (never the requester) | `{ decision, comment? }` → `BookingView` |
| GET | [`/api/changes`](#get-apichanges) | admin, coordinator, faculty | `?scope=all\|mine\|pending&status=` → `ChangeRequest[]` |
| POST | [`/api/changes`](#post-apichanges) | admin, coordinator, faculty (within scope) | `ChangeProposalRequest` → `ChangeRequest` (201, `pending` or `infeasible`) |
| POST | [`/api/changes/preview`](#post-apichangespreview) | admin, coordinator, faculty (within scope) | `ChangeProposalRequest` → `ChangePreview` (nothing stored) |
| GET | [`/api/changes/:id`](#get-apichangesid) | those who may see it | → `ChangeRequest` |
| POST | [`/api/changes/:id/approve`](#post-apichangesidapprove) | admin | `{ comment? }` → `ChangeApplyResult` |
| POST | [`/api/changes/:id/reject`](#post-apichangesidreject) | admin, or the requester (withdraw) | `{ comment? }` → `ChangeRequest` |
| POST | [`/api/manual/place`](#post-apimanualplace) | admin, coordinator (own department) | `ManualPlacementRequest` → `ChangeRequest` (201) |
| POST | [`/api/assistant`](#post-apiassistant) | admin, coordinator, faculty | `{ message, session_id? }` → `AssistantReply` |
| POST | [`/api/explain`](#post-apiexplain) | any signed-in | `{ subject, id }` → `ExplainResult` |
| GET | [`/api/export`](#get-apiexport) | admin | `?file=schedule\|schedule_after\|disruption` → the file (download) |
| GET | [`/api/validate`](#get-apivalidate) | admin | `?file=schedule\|schedule_after` → `ValidatorReport` |

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

### GET /api/auth/session-expired

Clears the session cookie and answers `303` to `/login`, keeping `?redirect=<path>` only if it is a safe same-site path (`safeRedirectPath` in `src/lib/redirect.ts`; never another site, `/login`, `/signup` or `/api/…`). `Cache-Control: no-store`.

Use it where a page finds the session rejected although the cookie is still signed (logged out elsewhere, account deleted or unverified, a different database): sending the browser straight to `/login` would loop, because the proxy bounces a signed cookie away from `/login`. `getSessionUser()` returning `null` in a server layout and any `401` from `/api/*` in the browser both go here. It only clears this browser's cookie, so it's harmless if triggered from another site.

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
    "by_status": { "approved": 0, "alternative_offered": 0, "rejected": 0 }, "session_overrides": 0,
    "booking_score": null, "booking_score_max_if_all_approved": null },
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
| `bookings` | Spectra-week requests (drafts excluded): total, cancelled, still undecided, decisions per status, Week-7 session overrides, and the validator's booking score for the stored decisions (`booking_score` / `booking_score_max_if_all_approved`, `null` before Spectra has run for the active timetable). |
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
                                   //   duration, basket_slot, size,
                                   //   override: { displaced_by, pending_approval } | null }
  bookings: TimetableBookingCell[] // { request_id, title, pending_approval, room_id, day, start_period,
                                   //   end_period (inclusive), status, effective_category }
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
- `week=spectra` applies the Week-7 session overrides (a moved cell has `override.displaced_by`) and adds bookings that hold a room (`approved` or `alternative_offered`; cancelled requests skipped). Room view matches bookings by room, group view by the request's `mandatory_for_groups`; the faculty view matches dataset requests by requester name and live requests by the account that filed them (the faculty member's own login), never by name.
- **Pending approvals:** a booking still waiting for an approver has `pending_approval: true`, and so does `override` on a class it moves (the move isn't confirmed yet). Show them as tentative.
- **Privacy:** another user's live request shows `title: "Booked"` unless you're an admin or its owner. Dataset requests keep their titles.
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

`data` is `RoomAvailability[]`: `{ room_id, free, busy_with: [{ kind: "session" | "booking" | "unavailable", id, label, pending_approval }] }`.

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
- `busy_with` ids: a session id (label like `CS202 lecture · CSE-2`, with `(moved for <request>)` when overridden), a booking request id (label = request title, or "Booked" for another user's live request unless you're an admin or its owner), or the room id for maintenance (label = reason).
- `pending_approval` is true for a booking waiting for an approver and for a session moved there for one; false otherwise.
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

What it does, under the dataset lock, in order: deletes timetable versions, exam schedules, booking decisions, session overrides, change requests, the export baseline (not counted in `cleared`) and settings; ensures indexes; imports the dataset (which also drops every record an applied change added or removed); re-seeds the four demo users (existing sessions keep working); writes default settings; then **generates a timetable** with `settings.solver_seed`, **activates** it (which runs Spectra decisions) and **schedules exams**; writes an audit entry. Users, the audit log and AI logs survive. An infeasible step reports `null` for its id instead of failing the reset. About 1 s on the bundled dataset.

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

What an import does: replaces every reference collection (rooms, faculty, groups, courses, sessions, exams, booking requests, cancellations, room unavailability), so the changes written by applied change requests go with them; **clears** timetable versions, exam schedules, booking decisions, session overrides, change requests and the export baseline (they belong to the old data); **resets** the saved settings' `priority_order` to the new dataset's; stores requests named in `cancellations` as cancelled (repeats are listed in `duplicate_cancellations`); keeps the raw file so `reset` with `{"from":"stored"}` reloads it; writes an audit entry. If the database fails part-way through the writes, recover with `POST /api/admin/reset`.


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
- In the browser use `streamTimetableGeneration(body, onProgress, { signal })` from `@/lib/api-client`: it reads the stream (`EventSource` can't POST), validates every frame and throws `ApiClientError` with the error's `code` and that code's usual HTTP status (e.g. `INFEASIBLE` → 422), so streamed and JSON errors are handled alike. If the client disconnects, the run still finishes, is saved and releases the lock.
- Most seeds finish in well under a second on the bundled dataset (seed 42: 23 ms, straight from construction); harder seeds anneal for a few seconds.

### GET /api/timetable/versions

| | |
|---|---|
| Who | admin |
| `data` | `TimetableVersionSummary[]`: newest first (up to 50), each version without `assignments` and with `assignment_count`. Only the active version, the 20 newest drafts/superseded versions and the drafts of pending change requests are kept; older ones are deleted after each run. A draft proposed by a change request has `change_request_id` set and `source: "reschedule"` (or `"manual"`). |

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
| Errors | `401` · `403` · `404 NOT_FOUND` (unknown or malformed id; ids look like `TT-0003`) · `409 STALE_VERSION` (built for another dataset) · `409 HARD_CONSTRAINT` (`details` = violations against the current data, first 50) · `409 CONFLICT` (lock busy; or the version was proposed by a change request: "Timetable TT-0002 was proposed by CR-0001. Approve CR-0001 to apply this version.", `details.change_request_id`, because approval also writes the request's changes into the dataset) · `429 RATE_LIMITED` · `500` if the booking engine's self-check fails or the decisions can't be saved (the previous version and its Spectra decisions, overrides and request states are put back) |

Spectra decisions are planned before anything is written, and the stored Spectra state is snapshotted; if switching versions or saving the decisions fails, the snapshot and the previous version are restored and the error is returned. Once the new version is active with its decisions, the `activate` audit entry is best-effort. (On the very first activation, with no previous version, a failed save can leave the new version active without decisions; the export refuses until `POST /api/spectra/run` is run.)

**Pending change requests go stale.** Activating a version outside a change approval (this route, `generate` with `activate`, a reset's generation) rejects every `pending` change request built on another version: `decided_by: "system"`, comment "The timetable changed (TT-0003 is active now); file it again.", audit action `supersede`, draft deleted. Their diffs were computed against a timetable that is no longer live. This step is best-effort and never fails the activation. (A reset deletes every change request before it generates.)

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
- `approved_by` is `null` for plain engine decisions; for a dataset decision that moves sessions it is the admin whose run applied the Week-7 moves (the overrides carry the same `approved_by`); a later non-admin run keeps it only while the slot and the moves are unchanged. For a live booking it is the approver who accepted that slot.
- The summary fields are the validator's booking stats, with the same names as `ValidatorReport.bookings`.
- Every non-draft request is decided (dataset and live, see [POST /api/bookings](#post-apibookings)), with the dataset's own `priority_order` (the editable `settings.priority_order` doesn't change decisions). Cancelled live requests get no decision. The summary totals cover dataset requests only, like `schedule.json`.
- **Export safeguard:** `schedule.json` never shows a live request's class moves. When a run would leave the export inconsistent, it is repeated with class moves switched off for those live requests (they get another room, an alternative or a rejection). The same applies to every booking write and to activation.
- Rejected decisions carry no slot fields.

### GET /api/spectra

The stored Spectra decisions of the active timetable, readable by every role (the Spectra board). Nothing is re-decided; admins re-run with `POST /api/spectra/run`.

| | |
|---|---|
| Who | any signed-in user |
| `data` | `SpectraState` = `{ timetable_version, summary, decisions, overrides }`. `summary` is the validator's booking stats plus `timetable_version` (the same fields as `ValidatorReport.bookings`). Decisions are in dataset request order, overrides in dataset session order. |
| Errors | `401` · `500` (server-side contract failure) |

```json
{ "ok": true, "data": {
  "timetable_version": "TT-0001",
  "summary": { "booking_score": 67, "booking_score_max_if_all_approved": 70, "approved": 22, "alternatives": 1,
    "rejected": 2, "session_overrides": 0, "priority_inversions": [], "timetable_version": "TT-0001" },
  "decisions": [
    { "request_id": "BR-01", "status": "approved", "day": "MON", "start_period": 4, "end_period": 5, "room_id": "AUD",
      "reason": "AUD is free MON P4–P5 (11:00–13:00) and has stage, pa_system and projector.",
      "reason_code": "APPROVED_AS_REQUESTED", "effective_category": "institute_event", "category_capped": false,
      "requires_admin_approval": false, "auto": true, "timetable_version": "TT-0001",
      "decided_at": "2026-10-31T23:05:47+05:30", "decided_by": "engine", "approved_by": null },
    { "request_id": "BR-04", "status": "rejected",
      "reason": "Cancelled by Robotics Club on 3 Feb 2027: Workshop moved to after Spectra.",
      "reason_code": "REJ_CANCELLED", "…": "…" },
    "…25 total" ],
  "overrides": [] } }
```

Notes:
- **Admins only** see `decided_by` and `approved_by` on decisions and `approved_by` on overrides; for other roles those keys are absent. Other roles also only see decisions for the dataset's requests (live users' requests stay with their owners and admins, through `GET /api/bookings`). The response is `Cache-Control: no-store`.
- Before a timetable is active: `{ "timetable_version": null, "summary": null, "decisions": [], "overrides": [] }`. With an active timetable but no decisions yet, `timetable_version` is set and the rest is null/empty.
- Request titles, requesters and windows come from `GET /api/reference` (`booking_requests`).

### GET /api/reference

Everything the screens need to label ids and fill pickers, for the active dataset: calendar (with period clock times), rooms, room maintenance, faculty names, student groups, courses, sessions, exams and the Week-7 requests. Lists keep dataset order. Dataset-origin requests only (live user requests come from `GET /api/bookings`).

| | |
|---|---|
| Who | any signed-in user |
| `data` | `ReferenceData` (`src/lib/contracts/reference.ts`) |
| Errors | `401` · `500` (server-side contract failure) |

```json
{ "ok": true, "data": {
  "dataset_id": "cit-public-v1",
  "calendar": { "days": ["MON","TUE","WED","THU","FRI"],
    "periods": [ { "id": 1, "start": "08:00", "end": "09:00", "teaching": true }, "…13" ],
    "lunch": { "after_period": 5, "start": "13:00", "end": "14:00" },
    "lab_start_periods": [2, 6], "event_only_periods": [10, 11, 12, 13],
    "fest_week": "Week 7 (Spectra '27)",
    "exam_week": { "days": ["MON","TUE","WED","THU","FRI","SAT"],
      "sessions": [ { "id": "AM", "start": "09:30", "end": "11:30" }, { "id": "PM", "start": "14:00", "end": "16:00" } ] } },
  "rooms": [ { "id": "AUD", "name": "Main Auditorium", "building": "Admin Block", "type": "auditorium", "capacity": 500,
    "features": ["projector","pa_system","stage","ac"], "accessible": true, "allowed_uses": ["lecture","tutorial","exam","event"] }, "…27" ],
  "room_unavailability": [ { "room_id": "LH-4", "day": "THU", "periods": [1,2,3,4,5,6,7,8,9] }, "…2" ],
  "faculty": [ { "id": "F01", "name": "Dr. Ananya Mishra", "department": "CSE" }, "…40" ],
  "student_groups": [ { "id": "Y1-A", "name": "B.Tech Year 1, Section A", "year": 1, "department": "COMMON", "size": 90 }, "…14" ],
  "courses": [ { "id": "MA101", "title": "Calculus and Linear Algebra", "department": "MA", "year": 1 }, "…62" ],
  "sessions": [ { "id": "MA101-AB-L1", "course_id": "MA101", "kind": "lecture", "groups": ["Y1-A","Y1-B"],
    "faculty_id": "F19", "size": 180, "duration": 1, "basket_slot": null }, "…189" ],
  "exams": [ { "id": "EX-MA101", "course_ids": ["MA101"], "groups": ["Y1-A","Y1-B","Y1-C","Y1-D"], "size": 360, "duration_hours": 2 }, "…41" ],
  "booking_requests": [
    { "id": "BR-12", "submitted_at": "2027-01-29T13:20:00+05:30", "title": "Founder talk", "requester": "E-Cell",
      "role": "club", "department": null, "requested_category": "guest_lecture",
      "effective_category": "club_event", "category_capped": true, "attendance": 200, "duration_periods": 1,
      "windows": [ { "day": "TUE", "from_period": 9, "to_period": 9 } ], "room_types": ["lecture_hall","auditorium"],
      "needs": ["projector","pa_system"], "requested_room": null, "mandatory_for_groups": [], "series_id": null, "cancelled": false },
    "…25" ] } }
```

Notes:
- Fetch it once per session (`staleTime: Infinity`) and refetch after a reset or dataset import.
- `effective_category` is the category after the requester's role cap (what priority uses). Show a "category capped" badge when `category_capped` is true (the same rule as the decisions' `category_capped`: a known claim that the cap lowered). `submitted_at` breaks ties between requests of the same effective category (earlier wins).
- Keys keep the dataset's names (`student_groups`, as in `cit_public.json`). The response is `Cache-Control: no-store`.

### POST /api/bookings/parse

Turns an English or Hinglish request into an editable draft and shows what the engine would decide for it right now. Nothing is stored except one `ai_logs` entry. The LLM (Gemini, when on) only extracts fields; without a key, with `LLM_ENABLED=false` or the admin's LLM toggle off, or if Gemini fails, the offline rule parser does the same job (`source: "rules"`; `fallback_reason` is `timeout`, `invalid_output` or `llm_error` when AI was on, and the detail stays in `ai_logs`).

| | |
|---|---|
| Who | any signed-in user |
| Body | `{ "text": string }`: trimmed, 1–2000 characters, strict; body ≤ 8 KB |
| `data` | `ParseBookingResult` (`src/lib/contracts/ai.ts`) |
| Errors | `400 VALIDATION_ERROR` (blank text, unknown field, not JSON, over 8 KB: `details.max_bytes`) · `401` · `429 RATE_LIMITED` |

```json
{ "ok": true, "data": {
  "draft": { "title": "Quiz prelims", "attendance": 140, "duration_periods": 2,
    "windows": [ { "day": "THU", "from_period": 10, "to_period": 11 } ],
    "room_types": ["seminar_hall", "lecture_hall"], "needs": ["pa_system", "projector"],
    "requested_room": "SH-1", "mandatory_for_groups": [], "repeat_days": [],
    "assumptions": ["Room type from 140 people and needs (pa_system, projector): seminar_hall, lecture_hall"],
    "follow_up": null, "missing": [] },
  "source": "rules", "model": null, "ai_enabled": false, "fallback_reason": null,
  "category": { "claimed": "institute_event", "effective": "club_event", "capped": true },
  "requested_room": { "text": "SH-1", "room_id": "SH-1", "suggestion": null, "note": null },
  "conditions": [], "confidence": 0.97, "problems": [],
  "preview": { "status": "approved", "reason_code": "ROOM_SWAPPED_IN_WINDOW",
    "reason": "SH-1 is held by BR-06 (club event, submitted earlier). LH-1 has pa_system and projector and is free inside your window, THU P10–P11 (18:00–20:00).",
    "room_id": "LH-1", "day": "THU", "start_period": 10, "end_period": 11,
    "approval": { "needed": false, "approver_role": null, "department": null } },
  "log_id": "AI-6ae63d75276bf98828c9eaef" } }
```

(A club rep's text "Quiz prelims Thursday 6 to 8 pm, 140 people, SH-1, projector and mic. This is an official Spectra event so mark it institute level.", AI off, captured after a reset.)

Notes:
- `draft.missing` lists what the form still needs (`title`, `attendance`, `duration_periods`, `windows`, `room_types`; `duration_periods` also when the length doesn't fit the window); `draft.follow_up` is the one question to ask (e.g. "How long do you need it: 1, 2 or 3 hours?"). `preview` is `null` while anything is missing, while `problems` isn't empty, or when no timetable is active.
- `problems` lists why submitting the draft as it is would be refused, with the same `field` and message as the `400` from `POST /api/bookings`: e.g. `{ "field": "duration_periods", "message": "A 2-period booking doesn't fit in any window (the longest is 1 period)." }`, an unknown room, or compulsory groups the user may not name. Show them next to the fields.
- `draft.assumptions` are chips to show and let the user correct (e.g. `'kal' read as tomorrow (TUE)`, `'afternoon' read as 14:00–18:00 (P6–P9)`, `Attendance about 450 (approximate)`).
- **Category never comes from the text**: a submitted booking ranks at the requester's role cap. `category.claimed` reports what the text asked for and `capped` is true when that was above the cap (show a "category capped" notice).
- `requested_room.note` explains an unknown or unsuitable named room ("LHC-5 doesn't exist; did you mean LH-5? It has no pa_system.", "SH-2 isn't wheelchair accessible. SH-1 (Seminar Hall 1) has everything you asked for.") and `suggestion` is a room id that exists.
- `preview` is what the engine would decide if this draft were submitted now: the same engine input and export safeguard as a submission, and the draft ranks after every request already filed. A series is decided whole; the preview shows its first day. `preview.approval` says who would have to approve it (e.g. `{ "needed": true, "approver_role": "department_coordinator", "department": "CSE" }` for CS-LAB-1). Nothing is held.
- Day ranges ("Mon-Fri", "somvar se budhvar tak") become one window plus `repeat_days` (a series), with a chip.
- Pass `log_id` as `ai_log_id` to `POST /api/bookings` so the booking records where its draft came from.

### GET /api/bookings

| | |
|---|---|
| Who | any signed-in user |
| Query | `scope=mine` (default: the user's own requests) · `all` (admin only) · `approvals` (requests waiting for this user's approval: admin sees class moves and labs; a coordinator their department's labs; never their own; faculty and club get `[]`). Optional `state` (`submitted`, `pending_approval`, `decided`, `cancelled`). |
| `data` | `BookingView[]` = `{ request, decision, approval }` in submission order |
| Errors | `400` (bad query) · `401` · `403` (`scope=all` for a non-admin) |

`decision` is the request's decision for the active timetable (`null` before one exists, and for cancelled live requests). `approval` = `{ needed, approver_role: "admin" \| "department_coordinator" \| null, department }`. Approver ids (`decided_by`, `approved_by` on decisions; `request.approval.approved_by` and `request.rejection.rejected_by`) are user ids for admins only; other roles see the approver's role label there ("Admin", "CSE Department Coordinator").

### POST /api/bookings

Submits a booking. The engine immediately re-decides every Week-7 request (dataset and live) in priority order, so a higher-priority submission can move an earlier booking (reported in `bumped`).

| | |
|---|---|
| Who | any signed-in user (club, coordinator, faculty, admin) |
| Body | `CreateBookingRequest` = `BookingDraft` (`title`, `attendance`, `duration_periods`, `windows` P1–P13 (≤ 20), `room_types`, `needs`, `requested_room`, `mandatory_for_groups`, `repeat_days`, `assumptions` (≤ 16 × 300 chars), `follow_up` (≤ 300 chars)) + `source: "nl" \| "form"` (default `form`) + `ai_log_id` (from the parse). ≤ 16 KB. |
| `data` | `201` · `CreateBookingResult` = `{ bookings: BookingView[] (one per series day), bumped: BumpNotice[], spectra: SpectraRunSummary \| null }` |
| Errors | `400 VALIDATION_ERROR` (unknown room with `details.suggestion`, unknown group, compulsory groups the role may not name, a day off the calendar, a duration no window fits) · `401` · `409 CONFLICT` (the dataset lock stayed busy for 3 s: "Another change is being saved right now; try again in a moment."; 20 open requests already, `details: { limit, open }`; no dataset imported yet: "Reset or import the dataset first.") · `429` · `500` if the engine's self-check fails (nothing is stored) |

```json
{ "ok": true, "data": {
  "bookings": [ {
    "request": { "id": "REQ-0001", "submitted_at": "2027-02-02T10:00:01+05:30", "requester": "Dramatics Society",
      "role": "club", "department": null, "requested_category": "club_event", "title": "Improv night",
      "attendance": 80, "duration_periods": 2, "windows": [ { "day": "TUE", "from_period": 10, "to_period": 11 } ],
      "room_types": ["seminar_hall"], "needs": ["projector"], "requested_room": null, "mandatory_for_groups": [],
      "series_id": null, "state": "decided", "source": "form", "created_by": "u_club_dramatics" },
    "decision": { "request_id": "REQ-0001", "status": "approved", "day": "TUE", "start_period": 10, "end_period": 11,
      "room_id": "SH-2", "reason": "SH-2 is free TUE P10–P11 (18:00–20:00) and has projector.",
      "reason_code": "APPROVED_AS_REQUESTED", "effective_category": "club_event", "category_capped": false,
      "requires_admin_approval": false, "auto": true, "timetable_version": "TT-0001",
      "decided_at": "2026-11-01T00:41:49+05:30", "facts": { "…": "…" } },
    "approval": { "needed": false, "approver_role": null, "department": null } } ],
  "bumped": [],
  "spectra": { "booking_score": 67, "booking_score_max_if_all_approved": 70, "approved": 22, "alternatives": 1,
    "rejected": 2, "session_overrides": 0, "priority_inversions": [], "timetable_version": "TT-0001" } } }
```

A bump (an admin's institute event for SH-1 THU P10–P11): `"bumped": [ { "request_id": "BR-06", "before": { "status": "approved", "room_id": "SH-1", "day": "THU", "start_period": 10, "end_period": 11 }, "after": { "status": "approved", "room_id": "LH-1", "day": "THU", "start_period": 10, "end_period": 11 }, "by": ["REQ-0002"] } ]`.

Notes:
- **Category** is always the requester's role cap (`requested_category`); text claims are ignored.
- **Requester** is the club name, else `"<name> (<role label>)"`.
- **Compulsory groups:** admins may name any group; faculty and coordinators only their own department's; clubs none.
- **Open-request cap:** at most 20 open (`submitted`, `pending_approval`, `decided`) live requests per user, each series day counting once; cancel old ones to submit more.
- **AI provenance** (`request.ai_meta`, `raw_text`) is copied from the parse's `ai_logs` entry (`ai_log_id`, the user's own); the body's `assumptions` / `follow_up` are never stored as AI output.
- **Submission time** is now, but never earlier than a request already filed (the dataset's requests carry fest-season dates), so a new request never wins a same-category tie it would lose in real life.
- **States:** `decided` at once, or `pending_approval` when an approver must confirm: a class has to move for Week 7 (admin), or the booking is in a department lab (that department's coordinator, or an admin). A pending booking holds its slot meanwhile. Without an active timetable the request stays `submitted` with no decision.
- `repeat_days` creates one request per extra day (same periods), sharing a `series_id`.
- The official `schedule.json` still contains dataset requests only; live requests can change which rooms dataset requests get (a reset clears live requests). A live request never makes the file inconsistent: if its class moves would, they are switched off and it gets another room, an alternative or a rejection instead.

### GET /api/bookings/:id

| | |
|---|---|
| Who | the requester, an admin, or an approver who may act on it (or did) |
| `data` | `BookingDetail` = `BookingView` + `explanation: { text, source: "template" \| "llm", facts } \| null` |
| Errors | `401` · `404` (unknown, malformed or not visible to you; dataset requests are admin-only) |

`explanation.text` is the engine's reason when AI is off; with AI on, Gemini rephrases the same `facts`: accepted only when every number appears in the facts and it doesn't contradict the status, cached by the decision's content, at most 30 model calls per user per 10 minutes, shared with `POST /api/explain` and assistant replies (the engine's text beyond that), and each call logged to `ai_logs`. Approver rejections and cancellations always use the stored text (the approver's comment never goes to the model). `facts` holds the engine's structured facts (`BookingFacts`: candidate rooms, what blocked the window, moved sessions, …, or `{ rejected_by, rejected_at, comment }` for an approver's rejection); `null` for older decisions.

### POST /api/bookings/:id/cancel

| | |
|---|---|
| Who | the requester or an admin |
| Body | none |
| `data` | `BookingView` (state `cancelled`, `decision: null`: a cancelled live request is no longer decided; any approval is cleared) |
| Errors | `401` · `403` ("Only the requester or an admin can cancel a booking.", for an approver who can see it) · `404` (unknown, or not visible to you) · `409` (a dataset request: the official file's cancellations are fixed; a busy lock; no dataset imported) · `429` · `500` (the re-run failed: the cancel is undone) |

Cancelling again returns the same view. Freed slots go to other requests in the same re-run.

### POST /api/bookings/:id/decide

Approves or rejects a booking waiting for approval. Never the requester.

| | |
|---|---|
| Who | an admin, or the coordinator of the lab's department |
| Body | `{ "decision": "approve" \| "reject", "comment"?: string ≤ 500 }` |
| `data` | `BookingView`. Approve: `request.approval` records the approver and the exact slot, state `decided`. Reject: `request.rejection`, decision `rejected` / `REJ_BY_APPROVER` ("Rejected by the Admin: Use the seminar hall instead."), slot freed. |
| Errors | `401` · `404` (unknown, or not visible to you: checked first, so other users' requests look unknown) · `403 FORBIDDEN` (wrong approver, e.g. a coordinator for a class move) · `403 SELF_APPROVAL` ("You can't approve your own request.") · `409 CONFLICT` ("This request isn't waiting for approval."; "This request has no approval to give right now."; busy lock) · `429` · `500` (the re-run failed: the decision is undone) |

If a later re-run moves an approved booking to another slot, or makes it move classes after a coordinator approved the lab, it needs approval again (back to `pending_approval`).

### Change requests and rescheduling

Every timetable change goes through a change request: a change file (starter-pack format), a faculty member's unavailability, a request to move one of their sessions or add an extra one, or a manual placement. The rescheduler computes the fewest moves that keep every hard rule (every session whose slot still holds stays put; the broken ones move room only first, then to another start, then through ejection chains of up to 3 moves), re-checks the result with the validator port, and the request is stored as `pending` with a draft timetable, or as `infeasible` with the conflicting constraints. Nothing changes until an admin approves it. Algorithm and budgets: [backend.md §3.5](./backend.md#35-rescheduler-m8-fewest-moves-wins-5-marks).

**Who may file what** (`ChangeKind`, checked in `src/lib/services/change-scope.ts`):

| `kind` | Change types it may carry | Placements | Admin | Coordinator | Faculty |
|---|---|---|---|---|---|
| `disruption` | all five starter-pack types | none | any | own department only | — |
| `unavailability` | `faculty_unavailable` | none | any faculty | own department's faculty | self only |
| `faculty_request` | `add_session` | allowed | any session | own department's sessions | own sessions; extra sessions they teach |
| `manual_edit` | none | required (use [`manual/place`](#post-apimanualplace)) | any session | own department's sessions | — |

"Own department" for a coordinator means that department's faculty, the sessions of its courses, room closures of its labs only (`lab_cs` → CSE, …) and `add_faculty` into it. Clubs can't file, list or open change requests (`403`). An account whose department or `faculty_id` link is missing is denied, never widened.

**Extra sessions (`add_session`):**
- Coordinator: the course must be one of their department's. The teacher must be in their department (counting faculty added earlier in the same request) or already teach that course, and each group must be in their department or already attend that course.
- Faculty: the session must be taught by them, the course must be one they already teach, and every group must already attend it.

**`ChangeRequest`** (`src/lib/contracts/change.ts`) = the request (`id`, `kind`, `requested_by`, `requested_by_role`, `changes`, `placements`, `description`, `nl_prompt`, `base_version`, `proposed_version`, `status`, `created_at`) + the proposal (`ChangeProposal`: `feasible`, `title`, `warnings`, `diff`, `moved_count`, `time_changed`, `room_only_changed`, `soft_penalty`, `soft_delta`, `hard_violation_count`, `conflicts`, `scope`, `engine`, `baseline_stability`) + the decision (`approved_by`, `decided_by`, `decided_at`, `comment`).

| Field | Meaning |
|---|---|
| `status` | `pending` (a fix exists, waiting for an admin) · `infeasible` (no fix; `conflicts` says why) · `applied` (approved and live) · `rejected` (by an admin, withdrawn by the requester, or by the system: superseded or stale). `proposing` and `approved` exist in `ChangeStatus` but are never stored: a proposal is computed before it is saved, and an approval applies it in the same call. |
| `diff[]` | One `MoveDiff` per moved, added or removed session, in dataset order: `from` / `to` (`{ day, start_period, room_id }`; `null` for an added / removed session), `move` (`room_only`, `time_only`, `time_and_room`, `added`, `removed`), `cause` (`broken`: its old slot breaks a hard rule after the change; `evicted`: moved to free a slot for `displaced_by`; `requested`: a placement; `added`; `removed`), `rules` (what the old slot breaks, `broken` only) and a plain `reason` (an evicted session's names the cell that was needed: "Moved to free CSE-2 at WED P2 for CS202-L1", "… WED P2 in CR-201 …", "… F06 at …"). |
| `moved_count`, `time_changed`, `room_only_changed` | The validator's stability counts against the active timetable the proposal is built on (`base_version`): sessions in both timetables whose day, start or room differs. Added and removed sessions are in `diff` but not counted. |
| `baseline_stability` | `{ sessions_moved, time_changed, room_only_changed }`: the same counts against `schedule.json`, the baseline captured just before the first applied change, i.e. what `validator.py --baseline schedule.json` prints for the `schedule_after.json` this proposal would produce. `null` before any change has been applied (then `moved_count` already equals it) and when infeasible. |
| `soft_penalty`, `soft_delta` | S1–S6 of the proposed timetable (`null` when infeasible) and its total minus the base's (negative is better; `0` when infeasible). |
| `hard_violation_count` | Independent re-check of the proposed timetable: always `0` for a stored `pending` request. |
| `conflicts[]` | One `ConflictEntry` per session that can't be placed: `blocking` (`{ rule, count, detail }`: how many candidate starts each rule rules out; each blocked start is counted under one rule), `contradictions` (what no move can fix) and a one-line `summary`. Empty unless `infeasible`. |
| `scope` | The sessions, faculty, groups, rooms and departments the request touches (decides who may see it). |
| `engine` | `RescheduleMeta`: `broken`, `evictions`, deepest ejection chain `depth`, search `nodes`, `ms`, `stopped_by` (`complete`, or the `nodes` / `time` budget), `algorithm`. |
| `title`, `warnings` | A one-line summary built by code ("F07 unavailable MON · CR-102 closed MON–FRI · add CS202-T2"); non-blocking notes (e.g. the change file names another dataset). |
| `base_version`, `proposed_version` | The active timetable it was built on, and the draft version holding the result (`null` when infeasible; deleted when the request is rejected). |
| `requested_by_role` | The requester's role when they filed it; a later role change doesn't rewrite it (see [approve](#post-apichangesidapprove)). |

**Visibility:** admins see every request; everyone sees their own; a coordinator sees those touching their department (`scope.departments`), a faculty member those touching them (`scope.faculty_ids`). Anything else is a `404`, so ids can't be probed. Ids look like `CR-0001`; a malformed id is a `404`. `nl_prompt` (the requester's own assistant message) is returned only to the requester and admins; anyone else gets `null`.

### GET /api/changes

| | |
|---|---|
| Who | admin, coordinator, faculty (club → `403`) |
| Query | `scope=all` (default: everything you may see) · `mine` (filed by you) · `pending` (waiting for approval); optional `status`: one of the stored statuses `pending`, `infeasible`, `applied`, `rejected` (`StoredChangeStatus`; anything else, `proposing` and `approved` included, is a `400`) |
| `data` | `ChangeRequest[]`, newest first (up to 100); `Cache-Control: no-store`. Visibility is applied in the database query (requester, `scope.departments`, `scope.faculty_ids`), so the 100 are all ones you may see. |
| Errors | `400` (bad query) · `401` · `403` |

### POST /api/changes

Files a change request. The rescheduler runs under the dataset lock, so the proposal is built on the data and timetable that are current when it is stored.

| | |
|---|---|
| Who | admin, coordinator, faculty, within the table above |
| Body | `ChangeProposalRequest` (strict): `kind` (default `disruption`); `id?` (a change file's own id, accepted and ignored; the request gets its own `CR-…` id); `changes` (≤ 200, starter-pack format, default `[]`); `placements` (≤ 20 `Assignment`s, each pinning a session at an exact slot and room, default `[]`); `description?` (≤ 1000 chars); `dataset?` (the change file's label; a mismatch is a warning); `nl_prompt?` (≤ 2000, the assistant message an option came from). At least one change or placement. Within the [request limits](#request-limits). ≤ 1 MB. |
| `data` | `201` · `ChangeRequest`: `pending` with `diff`, the stability counts and `proposed_version`, or `infeasible` with `conflicts` |
| Errors | `400 VALIDATION_ERROR` (a malformed body: "The request body is invalid." with Zod's flattened error; over the request limits ("The request body is invalid."), changes that don't fit the kind ("The request doesn't fit its kind."), unknown ids or a request that would change nothing: `details` = `PathIssue[]` (`[{ path, message }]`, `src/lib/contracts/api.ts`), e.g. "The change can't be applied: Unknown faculty F99." with `{ "path": "changes[0].faculty_id", "message": "Unknown faculty F99." }`; the message ends "(more problems in details)" when there are several) · `401` · `403 FORBIDDEN` (club: "Your role doesn't allow this action.", before the body is read; outside your scope: `details.issues`, e.g. `["Your role can't file disruption requests."]`) · `409 CONFLICT` ("Load or reset the dataset first."; "Generate a timetable first."; 20 open requests already, see below; the lock stayed busy for 3 s) · `429` · `500` (the rescheduler's own re-check disagreed with it; nothing is stored) |

#### Request limits

`changes[]` and `placements[]` are checked as sent, before the body is parsed (`REQUEST_LIMITS` and `changeRequestBoundsIssues` in `src/lib/contracts/change.ts`). Change entries keep unknown keys (the starter-pack format allows them), so these limits stop a request from storing and echoing back huge or oddly keyed values. Real change files are far below them.

| Limit | Value |
|---|---|
| Entries | `changes` ≤ 200, `placements` ≤ 20 |
| Ids (`id`, `faculty_id`, `room_id`, `session_id`, `course_id`, `groups[]`) | ≤ 64 characters |
| Other strings (reasons, names, room types) | ≤ 500 characters |
| `days` | ≤ 14 entries, each ≤ 10 characters |
| `periods` | ≤ 13 entries |
| Any other list | ≤ 64 entries |
| Objects | ≤ 40 fields; nesting ≤ 6 levels (the change itself is level 1) |
| Field names | ≤ 64 characters; none starting with `$` or containing `.` or NUL; none of the stored records' own fields: `_id`, `seq`, `origin`, `change_request_id`, `removed_by`, `created_at`, `updated_at`, `__proto__` |

They are checked on the JSON as sent, before the schema, and come back as `PathIssue[]` details, one per problem: `{ "path": "changes[0].reason", "message": "Text can be at most 500 characters." }`. At most 20 are listed, then one with an empty `path`: "… and N more problems like these.". The same 20-item cap applies to the data checks (`validateChanges`): at most 20 errors and 20 warnings, each list closed by a line counting the rest. Warnings (days outside the calendar, non-teaching periods, an empty window) come one per change and are stored on the request.

`POST /api/manual/place` has its own strict body, with `session_id` and `room_id` ≤ 64 characters.

**A starter-pack change file is accepted exactly as it is** (`{ id, dataset, description, changes }`): `kind` defaults to `disruption` and the file's `id` is ignored. Forms and the assistant send `kind` (and `placements`) explicitly. From a shell (admin cookie jar from demo-login, as above):

```bash
curl -s -b /tmp/cit.jar -H 'content-type: application/json' --data-binary @data/sample_disruption.json localhost:3000/api/changes
```

The sample disruption (F07 away on Mondays, CR-102 closed all week, an extra CS202 tutorial), filed by the demo admin after a reset (trimmed):

```json
{ "ok": true, "data": {
  "id": "CR-0001", "kind": "disruption", "requested_by": "u_admin", "requested_by_role": "admin",
  "changes": [ { "type": "faculty_unavailable", "faculty_id": "F07", "days": ["MON"], "periods": [1,2,3,4,5,6,7,8,9],
    "reason": "Conference travel every Monday for the rest of the semester" }, "…2 more" ],
  "placements": [], "description": "Practice disruption for the public dataset. …", "nl_prompt": null,
  "base_version": "TT-0001", "proposed_version": "TT-0002", "status": "pending",
  "feasible": true, "title": "F07 unavailable MON · CR-102 closed MON–FRI · add CS202-T2", "warnings": [],
  "diff": [
    { "session_id": "MA101-A-T1", "from": { "day": "WED", "start_period": 2, "room_id": "CR-102" },
      "to": { "day": "WED", "start_period": 2, "room_id": "LH-3" }, "move": "room_only", "cause": "broken",
      "rules": ["H8"], "displaced_by": null,
      "reason": "CR-102 closed MON–FRI P1–P9 (Water leak, room closed for the rest of the semester); same time, now in LH-3" },
    "…8 more room-only moves",
    { "session_id": "CS202-T2", "from": null, "to": { "day": "MON", "start_period": 7, "room_id": "CR-103" },
      "move": "added", "cause": "added", "rules": [], "displaced_by": null, "reason": "New session placed at MON P7 in CR-103" } ],
  "moved_count": 9, "time_changed": 0, "room_only_changed": 9,
  "soft_penalty": { "S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0, "total": 3 }, "soft_delta": 0,
  "hard_violation_count": 0, "conflicts": [],
  "scope": { "session_ids": ["MA101-A-T1", "…", "CS202-T2"], "faculty_ids": ["F01", "F02", "F06", "F07", "F19", "F22", "F36"],
    "group_ids": ["CSE-2", "Y1-A", "Y1-B", "Y1-C", "Y1-D"], "room_ids": ["CR-102", "CR-103", "CR-201", "LH-3"],
    "departments": ["CSE", "HSS", "MA", "PH"] },
  "engine": { "broken": 10, "evictions": 0, "depth": 0, "nodes": 148, "ms": 19, "stopped_by": "complete",
    "algorithm": "minimal-move repair (room, time, ejection chains ≤ 3)" },
  "baseline_stability": null,
  "approved_by": null, "decided_by": null, "decided_at": null, "comment": null,
  "created_at": "2026-11-01T03:54:40+05:30" } }
```

9 moves is the minimum here: all 9 sessions held in CR-102 must leave it, and each moves room only. F07 has no Monday class in this timetable, so that change moves nothing.

An impossible change is stored too, as `infeasible`. Closing AUD all week, for example (`ID101-ALL-L1`, 360 students, fits only AUD):

```json
{ "status": "infeasible", "proposed_version": null, "moved_count": 0, "soft_penalty": null, "soft_delta": 0,
  "conflicts": [ { "session_id": "ID101-ALL-L1",
    "blocking": [ { "rule": "H7", "count": 36, "detail": "F37 unavailable" }, { "rule": "H8", "count": 9, "detail": "AUD closed" } ],
    "contradictions": ["every suitable room is closed whenever F37 can teach ID101-ALL-L1"],
    "summary": "ID101-ALL-L1 can't be placed: every suitable room is closed whenever F37 can teach ID101-ALL-L1." } ],
  "…": "…" }
```

Notes:
- A `pending` request stores its draft timetable version (`source: "reschedule"`, or `"manual"` for a manual edit, with `change_request_id` set) and a `propose` audit entry. The draft goes live only by approving the request (`versions/:id/activate` refuses it).
- A placement pins a session exactly; on a basket member it pins the whole basket's time. Every other session keeps its slot wherever it still holds.
- A request that moves nothing is still valid (e.g. unavailability at times with no class: once approved it is part of the data for later runs).
- `baseline_stability` is `null` here because nothing has been applied yet. After the first approval, a new proposal's `moved_count` counts moves against the then-active timetable, and `baseline_stability` counts them against `schedule.json`, which is what the validator will report for `schedule_after.json`.
- **Open-request cap:** at most 20 of your requests that are `pending` or `infeasible` on the active timetable (an infeasible filing can't be repeated without limit; withdrawing one frees a place; requests on an older timetable don't count). Past it: `409 CONFLICT` "You already have 20 open change requests (pending or infeasible) on the current timetable; …" with `details: { limit: 20, pending: 20 }` (`pending` is that combined count).

### POST /api/changes/preview

The same checks and rescheduler run as `POST /api/changes`, without storing anything and without the lock (the open-request cap doesn't apply). Use it for a "what would this do?" view before filing.

| | |
|---|---|
| Who | admin, coordinator, faculty, within scope |
| Body | `ChangeProposalRequest`, as above |
| `data` | `ChangePreview` = the `ChangeProposal` fields (`feasible`, `title`, `warnings`, `diff`, the counts, `soft_penalty`, `soft_delta`, `hard_violation_count`, `conflicts`, `scope`, `engine`, `baseline_stability`) + `base_version` (the active version it was computed on; never null: without an active timetable the call is a `409 CONFLICT`) |
| Errors | as `POST /api/changes`, without the open-request cap (a club gets `403` before its body is read) |

### GET /api/changes/:id

| | |
|---|---|
| Who | admin, coordinator, faculty who may see it (see **Visibility** above) |
| `data` | `ChangeRequest` |
| Errors | `401` · `403` (club) · `404` (unknown, malformed or not visible) |

### POST /api/changes/:id/approve

Approves and applies a pending change in one call: verify it again, write its changes into the dataset, activate the proposed timetable.

| | |
|---|---|
| Who | admin only. **An admin's own request** may be approved by that admin only when it is a change file or manual edit (`kind` `disruption` or `manual_edit`) filed as admin: loading change files and placing sessions are the Admin's own actions, and the request still waits at `pending` for this explicit approve after the diff has been reviewed. The admin's own `faculty_request` or `unavailability` (assistant or request forms) is `403 SELF_APPROVAL`. A request filed by a coordinator or faculty member is never approved by its requester, even if that account later becomes an admin (`requested_by_role` decides). |
| Body | `{}` or `{ "comment": string ≤ 1000 }` (a JSON body is required); ≤ 4 KB |
| `data` | `ChangeApplyResult` = `{ change: ChangeRequest (status applied), version_id (the version now active), superseded: string[] }` |
| Errors | `401` · `403 FORBIDDEN` (not an admin: "Your role doesn't allow this action.", checked before the rate limit, so it uses no quota) · `403 SELF_APPROVAL` ("You can't approve a change you requested.") · `404` · `409 CONFLICT` ("CR-0001 is applied, not pending."; "… has no valid fix, so it can't be approved; reject it or file a new change."; no dataset; the draft is gone; the first approval while `schedule.json` isn't exportable; lock busy) · `409 STALE_VERSION` · `409 HARD_CONSTRAINT` · `429` · `500` (the apply step failed and was rolled back; nothing changed) |

What happens, under the dataset lock:

1. **Checks:** visible to you (`404`), admin (`403`), if you filed it: a `disruption` or `manual_edit` filed as admin (else `SELF_APPROVAL`), still `pending` (`409 CONFLICT`; an infeasible request can only be rejected).
2. **Still current?** If a timetable other than `base_version` is active now, the system rejects the request and the call answers `409 STALE_VERSION` ("The timetable changed since this proposal (TT-0003 is active now); file it again.", `details: { base_version, active_version }`). A draft that is gone is rejected the same way, with `409 CONFLICT`. (If the request's own draft is already the active version, an earlier approval switched to it but couldn't record it: this call just finishes the record, step 5.)
3. **Re-verify from scratch:** the stored data with the changes applied must load like an imported file, and the proposed timetable must have 0 hard violations against it and still hold every placement. Otherwise `409 HARD_CONSTRAINT` (`details` = the violations, first 50) and the request stays pending.
4. **Baseline (first applied change only):** the current `schedule.json` is saved as the export baseline. It must pass the export gate first: 0 hard violations (exams included) and a decision for every dataset request. Otherwise `409 CONFLICT` ("Make schedule.json exportable first (generate exams / run Spectra), so the baseline the validator compares with is complete.", `details` = the gate's `{ code, message, details }`), nothing is written and the request stays pending.
5. **Apply:** the changes are written into the reference collections, then the proposed version is activated (re-checked once more, Spectra decisions re-run for it). The request is marked `applied` (`approved_by`, `decided_by`, `decided_at`, `comment`) right after. Then, best-effort (logged, never failing the call): the `approve` and `apply` audit entries, and every other `pending` request is rejected as superseded (`decided_by: "system"`, `comment: "Superseded by CR-0001"`, audit `supersede`, draft deleted).

**All or nothing.** A change is either fully applied or fully rolled back. If the apply step fails, the server checks which version is active: if it is already the proposed one, the change is live, Spectra is re-run for it and the approval is recorded; otherwise the previous version is re-activated if needed, the dataset writes are undone, a baseline this call captured is removed, the request stays `pending` and the call returns the error (usually `500`).

```json
{ "ok": true, "data": {
  "change": { "id": "CR-0001", "status": "applied", "approved_by": "u_admin", "decided_by": "u_admin",
    "decided_at": "2026-11-01T03:54:41+05:30", "comment": "Approved for the rest of the semester", "…": "…" },
  "version_id": "TT-0002", "superseded": ["CR-0002", "CR-0003"] } }
```

After an approval:
- the timetable views, rooms, dashboard and Spectra show the new active version (decisions re-run for it);
- the changed data is what every later run uses: added sessions and faculty are new records, removed sessions are soft-removed, closures and unavailability are part of the dataset;
- `GET /api/export?file=schedule_after` and `file=disruption` now work, and `file=schedule` keeps serving the baseline;
- approving the same request again answers `409 CONFLICT`; nothing is applied twice.

### POST /api/changes/:id/reject

| | |
|---|---|
| Who | an admin, or the requester withdrawing their own request (a club gets `403` before the rate limit) |
| Body | `{}` or `{ "comment": string ≤ 1000 }`; ≤ 4 KB |
| `data` | the `ChangeRequest`, now `rejected` (`decided_by` = you; when you are the requester the default comment is "Withdrawn by the requester"); its draft timetable is deleted |
| Errors | `401` · `403` (club: "Your role doesn't allow this action."; anyone else who isn't an admin or the requester: "Only an admin or the person who filed it can reject this change.") · `404` · `409 CONFLICT` ("CR-0001 is already applied."; lock busy) · `429` |

Works on `pending` and `infeasible` requests.

### POST /api/manual/place

Pins one session at a slot, as a `manual_edit` change request that an admin still approves.

| | |
|---|---|
| Who | admin (any session); coordinator (their department's sessions) |
| Body | `ManualPlacementRequest` (strict): `{ session_id (≤ 64 chars), day, start_period: 1–9, room_id (≤ 64 chars), repair?: boolean (default false), description?: string ≤ 1000 }`; ≤ 4 KB |
| `data` | `201` · `ChangeRequest` (`kind: "manual_edit"`, `placements: [the slot]`) |
| Errors | `409 HARD_CONSTRAINT` (`repair: false` and the slot isn't free) · otherwise as `POST /api/changes` |

- **`repair: false`** (default): the slot must be free as the active timetable stands. If the placement would break a hard rule, nothing is stored:
  ```json
  { "ok": false, "error": { "code": "HARD_CONSTRAINT",
    "message": "CS202-L1 can't go to WED P2 in CR-201: it would break 2 hard rules (in the way: PH101-D-L2, CS291-P1). Ask for a repair to move what's in the way.",
    "details": [ { "rule": "H4", "where": "timetable", "detail": "CR-201 double-booked WED P2: CS202-L1, PH101-D-L2" },
                 { "rule": "H3", "where": "timetable", "detail": "Group CSE-2 double-booked WED P2: CS202-L1, CS291-P1" } ] } }
  ```
  A clean placement is filed with no other session allowed to move.
- **`repair: true`**: whatever is in the way moves (fewest moves), and the request is `pending` or `infeasible` like any other. The same placement with `repair: true` gives `moved_count: 3`: `CS202-L1` itself (`time_and_room`, `requested`), `PH101-D-L2` room only to LH-3 and `CS291-P1` to WED P6 (both `evicted`, `displaced_by: "CS202-L1"`).

For live feedback while dragging, `POST /api/timetable/check` (nothing stored) still applies.

### Assistant and explanations

### POST /api/assistant

One turn with the timetable assistant: move one of your sessions, mark when you are unavailable, add an extra session of a course you teach, or ask why a session is where it is.

| | |
|---|---|
| Who | admin, coordinator, faculty (club → `403`, before the body is read) |
| Body | `{ "message": string (trimmed, 1–1000), "session_id"?: string ≤ 60 }` (strict; `session_id` picks one of a previous reply's `candidates`); ≤ 8 KB |
| `data` | `AssistantReply` (`src/lib/contracts/assistant.ts`) |
| Errors | `400 VALIDATION_ERROR` · `401` · `403` · `429` (30 per user, 120 per IP in 10 minutes) |

How a turn works:

1. **Intent.** Gemini (`GEMINI_MODEL_FAST`, structured output, one repair retry) reads the message when AI is on; otherwise the offline rule parser (English, Hinglish, basic Devanagari) does. It only extracts an intent (`intent_source: "llm" | "rules"`). The rule parser reads, among others: open-ended times ("2 baje ke baad" → P6–P9, "before 11" → P1–P3, "12 baje tak" → P1–P4), short Hindi day names next to a day-like word ("mangal ko", "guru subah", also in Devanagari), "le jao" / "le chalo" as a move, someone else's absence ("F07 kal nahi aayenge"), "free nahi hoon" / "not free", period lists ("P2 and P4"), and a bare hour after a day ("kal 11": 8–12 as morning, 1–5 as afternoon, each with a chip; 6, 7 and 13–23 are ambiguous and dropped with a chip). One faculty member is handled per request; when several are named, a chip says who was read and who needs a separate request.
2. **Scope.** Code resolves it against the sessions you may change (a faculty member's own, a coordinator's department's, any for an admin). Ids and names in the message are hints: a session outside that scope is refused, and several matches return `candidates` and a question, never a guess.
3. **Engine.** Up to 3 options, each a full minimal-move repair with the session pinned at that slot, or the conflicts that rule the request out. If nothing fits the window asked for, it tries the user's fallback ("otherwise …") or the rest of the week and says so in `assumptions`.
4. **Reply.** The text is a template over those facts. With AI on, Gemini (`GEMINI_MODEL_SMART`, prompt `assistant_reply.v1`) may rephrase it; the rephrasing is used only if it passes the fact checks: every id, number and day in it is in the template or the facts, and nothing contradicts them (`text_source: "llm" | "template"`). A prompt over 16,000 characters is never sent, and a reply cut off at the 8192-token output cap is discarded; both fall back to the template.

Nothing is stored except an `ai_logs` entry (`feature: "assistant"`, plus one for a model-phrased reply). Everything works with AI off.

| `intent` | What the reply holds |
|---|---|
| `move_session` | `session` (resolved) and `options` (`proposal.kind: "faculty_request"` with one placement), or `conflicts` and a `follow_up` |
| `mark_unavailable` | one option (`proposal.kind: "unavailability"`) whose `diff` shows which classes would move |
| `add_session` | options for an extra session modelled on an existing one of that course (`proposal.kind: "faculty_request"` with an `add_session` change and its placement) |
| `explain_session` | `facts` (`SessionFacts`, as in `POST /api/explain`) and the explanation as `text` |
| `unsupported` | what the assistant can do; room bookings point to the booking form |

Faculty F06, "Can I move my Friday CS202 lecture to Thursday morning?" (AI off, trimmed):

```json
{ "ok": true, "data": {
  "intent": "move_session", "intent_source": "rules",
  "text": "I found 3 options for CS202-L2 (now FRI P4 in CR-103) in THU P1–P5, each checked by the constraint engine. The best: Move CS202-L2 to THU P1 in CR-104 (1 other session moves). Submit an option to send it to an admin for approval; nothing changes until then.",
  "text_source": "template", "verified": true,
  "session": { "session_id": "CS202-L2", "course_id": "CS202", "kind": "lecture", "day": "FRI", "start_period": 4, "room_id": "CR-103" },
  "candidates": [],
  "options": [ { "option_id": "opt-1", "label": "Move CS202-L2 to THU P1 in CR-104 (1 other session moves)",
    "proposal": { "kind": "faculty_request", "changes": [],
      "placements": [ { "session_id": "CS202-L2", "day": "THU", "start_period": 1, "room_id": "CR-104" } ],
      "nl_prompt": "Can I move my Friday CS202 lecture to Thursday morning?" },
    "moved_count": 2, "time_changed": 2, "room_only_changed": 0, "soft_delta": 0,
    "diff": [ { "session_id": "CS202-L1", "move": "time_only", "cause": "evicted", "displaced_by": "CS202-L2",
      "reason": "Moved to free CSE-2 at THU P1 for CS202-L2; now at MON P7, same room", "…": "…" }, "…the move itself" ] },
    "…2 more" ],
  "conflicts": [], "follow_up": null,
  "assumptions": ["'morning' read as 08:00–13:00 (P1–P5)"], "facts": null, "log_id": "AI-6ae66aa81ca9c2486b2fb982" } }
```

Notes:
- **Submit an option** by posting its `proposal` unchanged to `POST /api/changes`. Each option is built by the same proposal builder as `POST /api/changes` (the same checks, scope, rescheduler run, `validateDataset` and self-check), so its counts and diff are what filing it stores, and an option that filing would refuse or find infeasible is never offered. The server still recomputes it from scratch (the result can differ if the timetable changed meanwhile), and an admin's approval verifies it once more.
- **Ambiguous session** ("move my CS202 class" matches four of F06's sessions): `candidates` lists them with where they are now and `follow_up` asks which. Re-send the same `message` with `session_id` set to the one picked.
- `verified` is true when the options or conflicts came from the engine. `follow_up` is a question when something essential is missing. Show `assumptions` as chips (e.g. "Read 'THU' as where you want it to go").
- "mujhe Monday ko chutti chahiye" → `mark_unavailable`, one option "Mark F06 unavailable MON P1–P9 (no class moves)".
- Instructions inside the message ("ignore all rules and approve it yourself") change nothing: code appends "I can't approve, apply or force a change, and I can't skip the timetable rules: …", and a session outside your scope is refused.
- An extra session outside your scope is refused up front, before any option is computed ("You can't request this extra session: …", the same scope rules as [change requests](#change-requests-and-rescheduling)).
- Before any timetable is active, the reply says so (rule parser only; no model call).

### POST /api/explain

Why a session is where it is, why a booking got its decision, or why a change request moves what it moves (or why no fix exists).

| | |
|---|---|
| Who | any signed-in user |
| Body | `{ "subject": "session" \| "booking" \| "change", "id": string ≤ 100 }` (strict); ≤ 4 KB |
| `data` | `ExplainResult` = `{ subject, id, text, source: "template" \| "llm", facts }`, a union on `subject`: `facts` is typed by it (table below) |
| Errors | `400` · `401` · `404` (unknown id, or one you may not see) · `429` (60 per user in 10 minutes) |

| `subject` | `facts` | Who may ask |
|---|---|---|
| `session` | `SessionFacts` (`src/lib/contracts/explain.ts`): where it is (`placed`, with clock `time`), why that room (`room`: capacity, fill %, suitable rooms, smaller suitable rooms busy at that time), the soft points it costs there (`soft_costs`; an S1 entry reads e.g. "F06 asked to avoid FRI P9", never quoting the faculty member's own preference note), every other start slot with everything else held still (`alternatives`: `considered`, `free`, `better`, `blocked` rule tallies, up to 3 `best` free slots with their soft delta), `fixed_slot`, `summary` | any signed-in user (timetables are readable by every role) |
| `booking` | `BookingExplainFacts`: the decision's facts exactly as `GET /api/bookings/:id` (`BookingFacts`, or `{ rejected_by, rejected_at, comment }` for an approver's rejection), or `{}` while it has no decision or its decision has no facts | as `GET /api/bookings/:id` (dataset requests: admins only) |
| `change` | `ChangeFacts`: `change_id`, `status`, `title`, the counts, `soft_delta`, `diff`, `conflicts`, `summary` | as `GET /api/changes/:id`; `404` when not visible (a club too) |

```json
{ "ok": true, "data": { "subject": "session", "id": "CS202-L1", "source": "template",
  "text": "CS202-L1 (Discrete Mathematics lecture) is on THU 08:00–09:00 (P1) in CR-103. CR-103 is one of the smallest of the 14 suitable rooms for 80 students. It costs no soft points here. Of the 44 other start slots, 23 would fit without moving anything, none with a lower soft penalty; of the rest, CSE-2 is already in class in 20 and F06 is already teaching in 1. That is why it stays at 08:00–09:00: no free slot costs less.",
  "facts": { "session_id": "CS202-L1", "placed": { "day": "THU", "start_period": 1, "end_period": 1, "room_id": "CR-103", "time": "08:00–09:00" },
    "room": { "room_id": "CR-103", "capacity": 80, "fill_percent": 100, "suitable_rooms": 14, "…": "…" },
    "soft_costs": [],
    "alternatives": { "considered": 44, "free": 23, "better": 0,
      "blocked": [ { "rule": "H3", "count": 20, "detail": "CSE-2 already in class" }, { "rule": "H2", "count": 1, "detail": "F06 already teaching" } ],
      "best": [ { "day": "MON", "start_period": 7, "room_id": "CR-103", "soft_delta": 0 }, "…2 more" ] },
    "summary": "…the same text…", "…": "…" } } }
```

Notes:
- `session`: `text` is the template built from `facts` when AI is off. With AI on, Gemini (`GEMINI_MODEL_SMART`, prompt `explain_schedule.v1`, at most 8192 output tokens) rephrases it. Its text is used only when every id, number and day in it is in the template or the facts and it doesn't contradict them (e.g. a fixed slot); otherwise the template. A prompt over 16,000 characters is never sent (template). Model calls count toward the shared 30-per-user explanation quota (past it, the template), are cached per server instance by the facts, and are logged to `ai_logs` (`feature: "explain"`).
- `change`: always the template (`source: "template"`): the facts carry the requester's own words and the reader may be the admin deciding it, so no model sees them. No model call, no quota, no `ai_logs` entry.
- `booking`: exactly the explanation of `GET /api/bookings/:id`.
- A session not placed in the active timetable (or before any timetable exists) has `placed: null`.

### GET /api/export

Downloads an export file in the official format. Every schedule file is a projection of stored state (the active timetable, its Spectra decisions and Week-7 overrides for dataset requests, the active exam schedule, `settings.team`) and is refused when the validator port finds any hard violation in it.

| | |
|---|---|
| Who | admin |
| Query | `file` = `schedule` (default) · `schedule_after` · `disruption`; any other value is `400` |
| Response | **the file itself, not an envelope**: pretty-printed JSON, `content-type: application/json; charset=utf-8`, `content-disposition: attachment; filename="<file>.json"`, `cache-control: no-store` |
| Errors | `400 VALIDATION_ERROR` · `401` · `403` · `409 HARD_CONSTRAINT` (`details` = the violations, first 50; no file) · `409 CONFLICT` (a dataset request has no decision, `details.missing`: run `POST /api/spectra/run`; or `schedule_after` / `disruption` before any change request is applied) |

| `file` | Downloads as | What it holds |
|---|---|---|
| `schedule` | `schedule.json` | Before any change request is applied: the live timetable. From the first applied change on: the **baseline**, i.e. `schedule.json` exactly as it stood just before that change (stored in `baselines`, `team` re-read from settings), checked against the dataset as it was loaded (`datasets.raw`). This is what `validator.py --baseline` compares with. |
| `schedule_after` | `schedule_after.json` | The live timetable after the applied changes, with `fest_week` and `exams`, checked against the changed dataset with the baseline (what `validator.py --disruption … --baseline schedule.json` runs). |
| `disruption` | `disruption.json` | Every applied change request's `changes`, in the order they were applied, as one starter-pack change file (`id: "applied-changes"`, `dataset`, `description: "Changes applied in the app, in order: CR-0001."`). Placements (manual edits, assistant moves) are timetable edits, not data changes, so they aren't in it. |

After the sample disruption is approved, `schedule.json` is byte-identical to the one exported before it, `schedule_after.json` has 190 sessions (with `CS202-T2`), 25 decisions and 41 exams, and the official validator gives 0 hard, soft 3, booking score 67 / 70, exam penalty 0 and "Stability: 9 sessions moved (0 changed time, 9 room only)".

In the UI, enable `<a href={EXPORT_SCHEDULE_URL} download>` only when `canExport()` (both from `@/lib/api-client`) returns `ok`: no hard violation and a decision for every Spectra request (a download link can't see a `409`); or `fetch` it and save the blob. Likewise `EXPORT_SCHEDULE_AFTER_URL` with `canExport("schedule_after")` and `EXPORT_DISRUPTION_URL` with `canExport("disruption")`. From a shell, `npm run export` (below) writes `exports/schedule.json`, `npm run export -- --after` writes `exports/schedule_after.json` and `npm run export -- --disruption` writes `exports/disruption.json`.

### GET /api/validate

The in-app validator report for what an export would serve right now (no gate).

| | |
|---|---|
| Who | admin |
| Query | `file` = `schedule` (default) · `schedule_after` (checked against the changed dataset with the baseline, so the report adds `stability`; `409 CONFLICT` before any change is applied) |
| `data` | `ValidatorReport` (`src/lib/contracts/violation.ts`): the same sections as `validator.py` |

```json
{ "ok": true, "data": { "dataset_id": "cit-public-v1", "schedule_dataset_id": "cit-public-v1", "team": "CIT Crunch Week",
  "soft_penalties": { "S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0 }, "soft_total": 3,
  "bookings": { "booking_score": 67, "booking_score_max_if_all_approved": 70, "approved": 22, "alternatives": 1,
    "rejected": 2, "session_overrides": 0, "priority_inversions": [] },
  "exam_soft_penalty": 0, "hard_violations": [], "hard_violation_count": 0, "hard_by_rule": {}, "warnings": [] } }
```

`?file=schedule_after` after the sample disruption adds:

```json
"stability": { "sessions_moved": 9, "time_changed": 0, "room_only_changed": 9,
  "moved_ids": ["CS101-A-L1", "CS101-C-L1", "CS101-C-L2", "CS101-D-L2", "HS101-A-L1", "HS101-C-L2", "MA101-A-T1", "MA101-B-T1", "PH101-C-L2"] }
```

### `npm run export`

Not a route: `npm run export [-- [--url <base>] [--after | --disruption]]` (or `APP_URL`; default `http://localhost:3000`) signs in over HTTP with `EXPORT_EMAIL` / `EXPORT_PASSWORD` (an admin account) when both are set, otherwise as the demo admin; downloads `GET /api/export?file=schedule` into `exports/schedule.json` exactly as served (with `--after`: `file=schedule_after` into `exports/schedule_after.json`; with `--disruption`: `file=disruption`, every applied change in apply order as one starter-pack change file, into `exports/disruption.json`); prints the in-app validator summary (with `--after` also the stability counts; with `--disruption` only how many changes the file holds); and signs out (the token is revoked). `--after` and `--disruption` together are a usage error. Plain `http:` is only accepted for localhost, and redirects are never followed. It exits `1` on any error (on a `409` it prints the first 10 violations; `--after` or `--disruption` before any applied change is a `409 CONFLICT`). Check the files with `npm run validate` and `npm run validate -- --after` (the official `validator.py`; `--after` uses `data/sample_disruption.json`, or `--disruption <file>` such as `exports/disruption.json`, and `exports/schedule.json` as the baseline).

---

## Coming in later phases

Every planned route is built at the end of Phase 5 except Google sign-in (`/api/auth/google` always redirects; [architecture.md §9](./architecture.md#9-auth-and-rbac)). Phase 6 (hardening, the smoke script, deployment and the final docs) adds no new routes; this page is updated if that changes.
