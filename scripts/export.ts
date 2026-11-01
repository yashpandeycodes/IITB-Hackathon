/**
 * Downloads `exports/schedule.json` (or, with `--after`, `exports/schedule_after.json`; with
 * `--disruption`, `exports/disruption.json`) from the running app, over HTTP only (nothing is
 * computed here, so the file is exactly what `GET /api/export` serves).
 *
 *   npm run export                                  # app at http://localhost:3000
 *   npm run export -- --url http://localhost:3200   # or APP_URL=… npm run export
 *   npm run export -- --after                       # the timetable after the applied changes
 *   npm run export -- --disruption                  # the applied changes as one change file
 *
 * Steps: signs in as an admin, downloads `GET /api/export?file=schedule` byte for byte into
 * `exports/schedule.json`, prints the in-app validator summary (`GET /api/validate`), then signs
 * out (the session token is revoked). With `--after` it downloads `file=schedule_after` into
 * `exports/schedule_after.json` instead and prints `GET /api/validate?file=schedule_after`
 * (which adds the stability counts). With `--disruption` it downloads `file=disruption` (every
 * applied change, in apply order, as one starter-pack change file) into
 * `exports/disruption.json` and prints how many changes it holds (there is no validator report
 * for a change file). Once a change has been applied, `schedule.json` is the timetable from
 * before the first one, so the three files together are what
 * `validator.py --schedule exports/schedule_after.json --disruption exports/disruption.json
 * --baseline exports/schedule.json` checks. Run `npm run validate` afterwards for the official
 * validator. Loads `.env.local` first when it exists (for `APP_URL`
 * and the optional `EXPORT_EMAIL` / `EXPORT_PASSWORD`).
 *
 * Sign-in: `EXPORT_EMAIL` + `EXPORT_PASSWORD` (an admin account) through `POST /api/auth/login`
 * when both are set, otherwise the demo admin (`POST /api/auth/demo-login`). Plain `http:` is
 * only allowed for localhost; any other host must use `https:`. Redirects are never followed.
 *
 * Exits 1 when the app can't be reached, the sign-in fails, or the app refuses the export
 * (e.g. `409 HARD_CONSTRAINT`, whose first violations are printed, or `409 CONFLICT` for
 * `--after` or `--disruption` before any change is applied). `--after` and `--disruption`
 * together are a usage error.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_URL = "http://localhost:3000";
const USAGE =
  "Usage: npm run export [-- [--url <app-url>] [--after | --disruption]]";

/**
 * What one run downloads: `schedule.json` by default, `schedule_after.json` with `--after`,
 * `disruption.json` with `--disruption` (no validator report: `validatePath` is null).
 */
const TARGETS = {
  schedule: {
    output: "exports/schedule.json",
    exportPath: "/api/export?file=schedule",
    validatePath: "/api/validate",
  },
  schedule_after: {
    output: "exports/schedule_after.json",
    exportPath: "/api/export?file=schedule_after",
    validatePath: "/api/validate?file=schedule_after",
  },
  disruption: {
    output: "exports/disruption.json",
    exportPath: "/api/export?file=disruption",
    validatePath: null,
  },
} as const;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Error envelope (`error` object) or account-form shape (`error` string + `code`). */
type ErrorBody = {
  ok: false;
  error: string | { code: string; message: string; details?: unknown };
  code?: string;
};

/** A failure already reported to stderr; `main` exits 1 after signing out. */
class ExportFailure extends Error {}

function baseUrl(argv: string[]): string {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }
  const at = argv.indexOf("--url");
  const raw =
    at >= 0 ? argv[at + 1] : (process.env.APP_URL ?? "").trim() || DEFAULT_URL;
  if (!raw || raw.startsWith("--")) {
    console.error(`--url needs a value\n${USAGE}`);
    process.exit(1);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error(`Not a valid URL: ${raw}\n${USAGE}`);
    process.exit(1);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    console.error(
      `Refusing ${url.origin}: use https:// for anything but localhost (the admin session cookie would travel in clear text).`,
    );
    process.exit(1);
  }
  return url.origin;
}

/** Prints an error response (code, message, first violations) and throws `ExportFailure`. */
async function failWith(step: string, res: Response): Promise<never> {
  const text = await res.text();
  let body: ErrorBody | null = null;
  try {
    body = JSON.parse(text) as ErrorBody;
  } catch {
    // Not JSON (e.g. an HTML error page).
  }
  if (body && typeof body.error === "string") {
    console.error(
      `[export] ${step} failed: ${res.status} ${body.code ?? ""}: ${body.error}`,
    );
  } else if (body?.error && typeof body.error === "object") {
    const { code, message, details } = body.error;
    console.error(`[export] ${step} failed: ${res.status} ${code}: ${message}`);
    if (Array.isArray(details)) {
      for (const v of details.slice(0, 10) as {
        rule?: string;
        detail?: string;
      }[]) {
        console.error(`  - ${v.rule ?? "?"}: ${v.detail ?? JSON.stringify(v)}`);
      }
      if (details.length > 10) {
        console.error(`  … and ${details.length - 10} more`);
      }
    }
  } else {
    console.error(
      `[export] ${step} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  throw new ExportFailure(step);
}

/** `name=value` pairs from every `set-cookie` header, ready for a `cookie` header. */
function sessionCookie(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((header) => header.split(";")[0].trim())
    .filter((pair) => pair.includes("=") && !pair.endsWith("="))
    .join("; ");
}

/** Signs in (real admin credentials when configured, else the demo admin); returns the cookie. */
async function signIn(base: string): Promise<string> {
  const email = (process.env.EXPORT_EMAIL ?? "").trim();
  const password = process.env.EXPORT_PASSWORD ?? "";
  const useAccount = email !== "" && password !== "";
  const res = await fetch(
    `${base}/api/auth/${useAccount ? "login" : "demo-login"}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify(
        useAccount ? { email, password } : { role: "admin" },
      ),
      redirect: "error",
    },
  );
  const step = useAccount ? "Sign-in (EXPORT_EMAIL)" : "Demo admin sign-in";
  if (!res.ok) await failWith(step, res);
  const cookie = sessionCookie(res);
  if (!cookie) {
    console.error(`[export] ${step} returned no session cookie.`);
    throw new ExportFailure(step);
  }
  console.log(
    `[export] Signed in ${useAccount ? "with EXPORT_EMAIL" : "as the demo admin"}`,
  );
  return cookie;
}

/** Revokes the session so the admin token doesn't outlive the script. */
async function signOut(base: string, cookie: string): Promise<void> {
  try {
    await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { cookie, origin: base },
      redirect: "error",
    });
  } catch {
    console.warn(
      "[export] Could not sign out; the session expires on its own.",
    );
  }
}

async function main(): Promise<void> {
  const envFile = resolve(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const argv = process.argv.slice(2);
  const base = baseUrl(argv);
  const after = argv.includes("--after");
  const disruption = argv.includes("--disruption");
  if (after && disruption) {
    console.error(`Pick one of --after and --disruption.\n${USAGE}`);
    process.exit(1);
  }
  const target =
    TARGETS[disruption ? "disruption" : after ? "schedule_after" : "schedule"];

  const cookie = await signIn(base);
  try {
    const res = await fetch(`${base}${target.exportPath}`, {
      headers: { cookie },
      redirect: "error",
    });
    if (res.status !== 200) await failWith("Export", res);
    const body = await res.text();
    JSON.parse(body); // Sanity check only; the file is written exactly as served.
    const output = resolve(process.cwd(), target.output);
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(output, body);
    console.log(
      `[export] Wrote ${target.output} (${Buffer.byteLength(body)} bytes) from ${base}`,
    );

    if (target.validatePath === null) {
      const { changes } = JSON.parse(body) as { changes?: unknown[] };
      const n = changes?.length ?? 0;
      console.log(`  changes         : ${n} ${n === 1 ? "change" : "changes"}`);
      return;
    }
    const check = await fetch(`${base}${target.validatePath}`, {
      headers: { cookie },
      redirect: "error",
    });
    if (!check.ok) await failWith("Validation report", check);
    const { data: report } = (await check.json()) as {
      data: {
        hard_violation_count: number;
        soft_total: number;
        bookings?: {
          booking_score: number;
          booking_score_max_if_all_approved: number;
        };
        exam_soft_penalty?: number;
        stability?: {
          sessions_moved: number;
          time_changed: number;
          room_only_changed: number;
        };
      };
    };
    const bookings = report.bookings
      ? `${report.bookings.booking_score} / ${report.bookings.booking_score_max_if_all_approved}`
      : "n/a";
    const { stability } = report;
    console.log(
      [
        `  hard violations : ${report.hard_violation_count}`,
        `  soft penalty    : ${report.soft_total}`,
        `  booking score   : ${bookings}`,
        `  exam penalty    : ${report.exam_soft_penalty ?? "n/a"}`,
        ...(stability
          ? [
              `  stability       : ${stability.sessions_moved} sessions moved (${stability.time_changed} changed time, ${stability.room_only_changed} room only)`,
            ]
          : []),
      ].join("\n"),
    );
  } finally {
    await signOut(base, cookie);
  }
}

main().catch((err: unknown) => {
  process.exitCode = 1;
  if (err instanceof ExportFailure) return; // already reported
  const e = err instanceof Error ? err : new Error(String(err));
  const cause = e.cause instanceof Error ? ` (${e.cause.message})` : "";
  console.error(`[export] failed: ${e.name}: ${e.message}${cause}`);
  if (e.message === "fetch failed") {
    console.error("Is the app running? Start it with `npm run dev`.");
  }
});
