# Deploying to Vercel

This guide takes the app from the GitHub repo to a public Vercel URL with all four demo accounts working. It assumes no earlier deployment. Plan on about 30 minutes, most of it Atlas setup.

The design decisions behind it (Vercel Hobby, Atlas M0, the Mumbai region, one database per environment, deploy freeze) are in [architecture.md §10](./architecture.md#10-deployment-and-operations). Every variable is listed with its tag in [`.env.example`](../.env.example).

**What runs where:** Vercel runs the whole Next.js app (pages and `/api/*` route handlers) as serverless functions. MongoDB Atlas holds all the data. Gemini and Brevo are optional external services. There is no other server, queue or cron job.

---

## 0. Before you start

- [ ] A **Vercel account** that can see the GitHub repo `yashpandeycodes/IITB-Hackathon`. The repo owner may have to grant the Vercel GitHub app access to it.
- [ ] A **MongoDB Atlas account**. The free M0 cluster is enough.
- [ ] **Node.js ≥ 20.9 and npm** on your machine, to seed the database once (step 2).
- [ ] The **branch to deploy is `main`**, and it already contains the backend work from the `Aryan` branch. Check with Aryan that their latest PR is merged before the production deploy.
- [ ] Optional: a **Gemini API key** (AI booking parser, assistant and explanations). Without one, the rule-based parsers and template text are used, and the app is fully usable.
- [ ] Optional: a **Brevo account** with a verified sender, if self-service club sign-up must send real email. Without it, sign-up answers `503 MAIL_UNAVAILABLE`, and the demo accounts still work.

---

## 1. Prepare MongoDB Atlas

1. **Create a cluster:** M0 (free), provider AWS, region **Mumbai (`ap-south-1`)**. The Vercel functions will run in Mumbai too (step 5), so each database round trip stays short.
2. **Database Access → Add New Database User:** password authentication, role _Read and write to any database_. Create a new user just for this deployment. Use a generated password and store it only in Vercel and your password manager, never in a file in the repo.
3. **Network Access → Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`). Vercel functions have no fixed IP addresses, so an allow-list can't work. The database user's password is what protects the cluster.
4. **Connect → Drivers:** copy the `mongodb+srv://…` connection string and put the password in it. URL-encode any special characters in the password (`@` → `%40`, `/` → `%2F`, `:` → `%3A`). Leave the database name out of the path (`…mongodb.net/?retryWrites=true&w=majority`), because the app picks the database from `MONGODB_DB`.

You now have the value for `MONGODB_URI`.

---

## 2. Load the data into the production database

A fresh database is empty, so the app has no timetable to show. `npm run seed` loads the bundled starter-pack dataset (`data/cit_public.json`), creates the four demo accounts, writes default settings, creates the indexes, then generates the timetable, the exam schedule and the Spectra booking decisions.

Run it once from your machine, at the repo root, on the branch you are deploying:

```bash
npm ci
MONGODB_URI='mongodb+srv://<user>:<pass>@<cluster>/?retryWrites=true&w=majority' \
MONGODB_DB='cit_prod' \
npm run seed
```

- It prints a JSON report and exits. A `[seed] failed: …` line instead means the URI, password or Atlas network access is wrong (see [Troubleshooting](#8-troubleshooting)).
- **It resets the database it points at.** Values given on the command line override `.env.local` (the script loads `.env.local` without overwriting variables already set), so check that `MONGODB_DB` reads `cit_prod`. Never point it at a teammate's database by accident.
- Re-running it is safe and brings the demo data back to a clean state.

**No local setup?** You can seed after the first deploy instead: demo sign-in re-creates a missing demo account, and the admin reset does the same job as `npm run seed` (it runs within the 60 s route limit):

```bash
APP=https://<project>.vercel.app
curl -s -c jar -X POST -H 'content-type: application/json' -d '{"role":"admin"}' "$APP/api/auth/demo-login"
curl -s -b jar -X POST "$APP/api/admin/reset"
rm jar
```

---

## 3. Create the Vercel project

1. On vercel.com: **Add New → Project → Import Git Repository**, then pick `yashpandeycodes/IITB-Hackathon`.
2. Keep the detected settings:

   | Setting          | Value                                 | Why                                                                                                                   |
   | ---------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
   | Framework preset | Next.js                               | Detected from `package.json`                                                                                          |
   | Root directory   | `./` (repo root)                      | The app is not in a subfolder                                                                                         |
   | Build command    | default (`npm run build` → `next build`) | **Don't add `--webpack`.** Tailwind is wired through Turbopack in `next.config.ts`; a webpack build drops the styles |
   | Install command  | default                               | `package-lock.json` is committed                                                                                      |
   | Output directory | default                               |                                                                                                                       |

3. **Node.js version:** Vercel reads `engines.node` (`>=20.9.0`) from `package.json` and builds with its newest supported Node major. That's fine: nothing depends on a particular major (CI tests on Node 20). A build-log note about automatic Node upgrades is expected.
4. **Before clicking Deploy**, open _Environment Variables_ and add the variables from step 4. A deployment without them still builds, because the env is read lazily, but every request that needs the database fails.
5. Click **Deploy**.

---

## 4. Environment variables

Add these under **Project → Settings → Environment Variables**. Type each value **without the surrounding quotes** that `.env.example` uses (Vercel stores quotes literally), and mark the secrets **Sensitive**.

| Variable             | Production                             | Preview                         | Notes                                                                                                                        |
| -------------------- | -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`        | Atlas URI from step 1                  | same cluster                    | **Required.**                                                                                                                |
| `MONGODB_DB`         | `cit_prod`                             | `cit_preview`                   | **Required on Vercel**: there is no default when `VERCEL` is set. A separate Preview database keeps previews away from the judges' data. |
| `AUTH_SECRET`        | output of `openssl rand -base64 32`    | a different random value        | **Required.** 32+ characters. On a deployment, placeholder-looking or low-variety values are rejected and every request fails. Changing it signs everyone out. |
| `TEAM_NAME`          | the registered team name               | same                            | Recommended. Written into `schedule.json` (default `CIT Crunch Week`).                                                       |
| `DEMO_LOGIN_ENABLED` | `true` (or leave unset)                | `true`                          | Defaults to `true`. Judges sign in with the one-click demo accounts, so don't turn it off.                                  |
| `GEMINI_API_KEY`     | your key                               | optional                        | Optional. Turns on the AI paths; `LLM_ENABLED=false` or the admin's AI toggle turns them off again.                         |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART` | leave unset             | leave unset                     | Optional. Both default to `gemini-3.8-flash`.                                                                                |
| `LLM_ENABLED`, `LLM_TIMEOUT_MS` | leave unset                 | leave unset                     | Optional. Defaults `true` and `8000`.                                                                                        |
| `SOLVER_TIME_BUDGET_MS`, `SOLVER_SEED` | leave unset          | leave unset                     | Optional. Defaults `8000` and `42`. Keep the budget at 8000 or less: heavy routes stop at 60 s.                             |
| `APP_REFERENCE_DATE` | leave unset                            | leave unset                     | Optional. Default `2027-02-08`, the Monday of fest week.                                                                     |
| `BREVO_*`            | only for real sign-up email            | leave unset                     | Optional. `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` (+ `BREVO_SMTP_LOGIN` for an `xsmtpsib-` key). See `.env.example`.          |
| `JWT_SECRET`         | leave unset                            | leave unset                     | Optional override of `AUTH_SECRET`, same rules.                                                                               |
| `NEXT_PUBLIC_APP_URL`| `https://<project>.vercel.app` or unset | unset                          | Optional and unused today (reserved for Google sign-in). It is inlined at build time, so a change needs a new deployment.     |

**Leave these out of Vercel:**

- `APP_URL`, `EXPORT_EMAIL`, `EXPORT_PASSWORD`, `PYTHON`, `TEST_MONGODB_URI` and `SOLVER_QUALITY` are read only by npm scripts and tests on your machine.
- `GOOGLE_CLIENT_ID`: Google sign-in isn't built yet.
- `NODE_ENV` and `VERCEL`: Vercel sets these itself. Never set `VERCEL` by hand anywhere: the app trusts `X-Forwarded-For` and `X-Forwarded-Host` only when it is present.

Vercel applies variable changes to **new deployments only**. After editing a variable, redeploy (**Deployments → ⋯ → Redeploy**).

---

## 5. Set the function region

**Project → Settings → Functions → Function Region → Mumbai, India (`bom1`)**, the same region as the Atlas cluster. The default (Washington, D.C., `iad1`) puts every database round trip on the other side of the world, which slows timetable generation and approvals noticeably. The change applies from the next deployment, so redeploy after changing it.

---

## 6. Verify the deployment

Production lives at `https://<project>.vercel.app`. Run these checks against that URL.

**1. Health check:**

```bash
curl -s https://<project>.vercel.app/api/health
# {"ok":true,"data":{"status":"ok","db":"up","dataset_id":"cit-public-v1","time":"…"}}
```

`"db":"down"` means the app can't reach Atlas (go to [Troubleshooting](#8-troubleshooting)).

**2. Smoke checklist in a browser** (the "Smoke (deployed)" row in [architecture.md §11](./architecture.md#11-testing-and-verification)):

- [ ] All four demo sign-ins work from `/login` (Admin, Department coordinator, Faculty, Club representative; credentials in the [README](../README.md#demo-accounts)), and sign-out works.
- [ ] The dashboard and timetable show the seeded data.
- [ ] A plain-language booking request goes through (it works with or without a Gemini key).
- [ ] As Admin: the reset (`POST /api/admin/reset`) works, and the export downloads.

**3. Download the exports from the deployed app.** The submission files must come from the deployment. From your machine:

```bash
npm run export -- --url https://<project>.vercel.app           # exports/schedule.json
npm run export -- --url https://<project>.vercel.app --after   # exports/schedule_after.json, once a change is approved
npm run validate                                               # official validator.py (needs Python 3.8+)
npm run validate -- --after
```

`npm run export` signs in as the demo admin unless `EXPORT_EMAIL` and `EXPORT_PASSWORD` are set (in your shell or `.env.local`).

---

## 7. Preview deployments

Every push to a branch other than `main` (for example `Aryan` or `yash`) builds a **Preview** deployment with the Preview variables.

- **Give Preview its own database** (`MONGODB_DB=cit_preview`, seeded the same way as step 2) and its own `AUTH_SECRET`. If Preview shared `cit_prod`, an admin reset on a preview would wipe the data the judges are looking at.
- If Preview has no `MONGODB_DB`, previews still build but answer `500` on every API call. That's acceptable if you don't use previews.
- Vercel's default **Deployment Protection** requires a Vercel login for preview URLs and per-deployment URLs. The production domain (`<project>.vercel.app`) stays public. **Give the judges only the production domain.**

---

## 8. Troubleshooting

Check **Project → Logs** (runtime logs) first. Configuration errors name the variable but never print its value.

| Symptom                                                                              | Likely cause                                                                                                                         | Fix                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/api/health` says `"db":"down"`; logs show `[db] ping failed`                       | Atlas Network Access lacks `0.0.0.0/0`, wrong user or password, a password not URL-encoded, or the cluster is paused                | Fix it in Atlas or in `MONGODB_URI`, then redeploy                                                          |
| API calls answer `500`; logs show `Invalid server environment` naming `MONGODB_DB`  | `MONGODB_DB` is not set for this environment                                                                                         | Add it (Production and Preview separately), then redeploy                                                   |
| Same, naming `AUTH_SECRET` or `JWT_SECRET`                                           | Shorter than 32 characters, or rejected as weak (contains `secret`, `example`, `changeme`, `dummy` or `placeholder`, or uses fewer than 10 distinct characters) | Use `openssl rand -base64 32`, then redeploy                                                                |
| `MONGODB_DB` errors although the variable is set, or data lands in an odd database   | The value was typed with quotes (`"cit_prod"`)                                                                                       | Re-enter it without quotes                                                                                  |
| Pages load but are empty; export answers `409 CONFLICT`                              | The database was never seeded                                                                                                        | Step 2                                                                                                      |
| Everyone is signed out after a deploy                                                | `AUTH_SECRET` (or `JWT_SECRET`) changed                                                                                              | Expected; sign in again                                                                                     |
| `403 FORBIDDEN` "Cross-origin requests are not allowed."                             | A POST/PUT/PATCH/DELETE came from another site or origin                                                                             | By design: the API accepts writes from its own origin only. Use the deployed UI, or `curl` without an `Origin` header |
| Sign-up answers `503 MAIL_UNAVAILABLE`                                               | No Brevo key or sender configured                                                                                                    | Expected without Brevo; demo accounts are unaffected                                                        |
| `409 CONFLICT` on reset, import or generation                                        | Another run holds the dataset lock                                                                                                   | Wait for it to finish (a stuck lock expires after 75 s)                                                     |
| `429 RATE_LIMITED`                                                                   | Rate limit hit (kept in memory per server instance)                                                                                  | Wait for the `Retry-After` seconds                                                                          |
| `504` / `FUNCTION_INVOCATION_TIMEOUT` on generation or approvals                     | Functions far from Atlas, or a raised `SOLVER_TIME_BUDGET_MS`                                                                        | Set the region to `bom1` (step 5), keep the budget at 8000 or less                                          |
| Unstyled pages after a build                                                         | The build command was changed (for example `next build --webpack`)                                                                   | Restore the default build command                                                                           |
| AI features answer with template text                                                | No `GEMINI_API_KEY`, `LLM_ENABLED=false`, the admin's AI toggle is off, or Gemini timed out                                          | Expected fallback; add the key if AI output is wanted                                                       |

A bad production deploy can be undone at once: **Deployments → pick the last good one → Instant Rollback**.

---

## 9. How the app fits Vercel's limits

None of this needs action. It explains why the setup above is enough.

- **60 s route limit:** the long-running routes (`admin/reset`, `admin/dataset`, `timetable/generate`, `exams/generate`, `spectra/run`, the change, booking-decision and assistant routes) set `export const maxDuration = 60`, which every Vercel plan allows. The solver stops on a deterministic budget, with `SOLVER_TIME_BUDGET_MS` as a safety cap. The dataset lock expires after 75 s, so a function killed by the platform can't wedge it.
- **Database connections:** one cached `MongoClient` per function instance (pool size 10), reused across warm invocations. That is well within the M0 connection limit.
- **Request size:** dataset uploads are capped at 2 MB, under Vercel's 4.5 MB request-body limit.
- **Files at runtime:** the bundled dataset is imported at build time. The AI prompts (`prompts/*.md`) are read from disk and shipped with the API routes through `outputFileTracingIncludes` in `next.config.ts`; keep new prompt files in `prompts/`. Nothing writes to the filesystem: exports are built from the database on each request.
- **Rate limits** live in memory per instance: they reset on cold starts, and each instance counts on its own ([README → Known limitations](../README.md#known-limitations)).
- **Security headers** (CSP `frame-ancestors`, `X-Frame-Options`, `nosniff` and others) come from `next.config.ts`, and session cookies are `Secure` in production. Nothing needs configuring in Vercel.

---

## 10. After the deadline: freeze

The rules disqualify pushes or redeploys after the deadline ([architecture.md §10](./architecture.md#10-deployment-and-operations)). Every push to `main` triggers a production deploy, so:

1. Deploy the final `main`, download the exports (step 6), and put the production URL in the README (it says "Deployment link: pending" under Known limitations).
2. Stop automatic builds: **Project → Settings → Git → Ignored Build Step**, set the custom command `exit 0` (exit code 0 tells Vercel to skip the build).
3. Don't push to `main` and don't click Redeploy until judging is over.
