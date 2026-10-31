/**
 * Runs the official starter-pack validator against our exports.
 *
 *   npm run validate              exports/schedule.json
 *   npm run validate -- --after   exports/schedule_after.json vs the sample disruption
 *   npm run validate -- --after --disruption path/to/change.json   …vs another change file
 *
 * Exits 1 when an input file is missing or the validator reports any hard violation.
 * Paths are relative to the repo root (npm runs scripts from there).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const VALIDATOR = "CrunchWeek_StarterPack/validator.py";
const DATA = "data/cit_public.json";
const SCHEDULE = "exports/schedule.json";
const SCHEDULE_AFTER = "exports/schedule_after.json";
const DISRUPTION = "data/sample_disruption.json";

type Mode = "baseline" | "after";
type Input = { flag: string; file: string; hint: string };
type Options = { mode: Mode; disruption: string };

const USAGE =
  "Usage: npm run validate [-- --after [--disruption <change-file.json>]]";

function parseOptions(argv: string[]): Options {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }
  let disruption = DISRUPTION;
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--after") continue;
    if (
      arg === "--disruption" &&
      argv[i + 1] &&
      !argv[i + 1].startsWith("--")
    ) {
      disruption = argv[++i];
      continue;
    }
    unknown.push(arg);
  }
  if (unknown.length > 0) {
    console.error(
      `Unknown or incomplete argument(s): ${unknown.join(" ")}\n${USAGE}`,
    );
    process.exit(1);
  }
  const mode: Mode = argv.includes("--after") ? "after" : "baseline";
  if (mode === "baseline" && disruption !== DISRUPTION) {
    console.error(`--disruption only applies with --after\n${USAGE}`);
    process.exit(1);
  }
  return { mode, disruption };
}

function inputsFor({ mode, disruption }: Options): Input[] {
  const exportHint = "Run `npm run export` against the running app first.";
  const data: Input = {
    flag: "--data",
    file: DATA,
    hint: "Copy it from CrunchWeek_StarterPack/data/.",
  };
  const schedule: Input = {
    flag: "--schedule",
    file: SCHEDULE,
    hint: exportHint,
  };
  if (mode === "baseline") return [data, schedule];
  return [
    data,
    { flag: "--schedule", file: SCHEDULE_AFTER, hint: exportHint },
    {
      flag: "--disruption",
      file: disruption,
      hint: "Check the --disruption path (default: a copy of the starter-pack sample).",
    },
    { flag: "--baseline", file: SCHEDULE, hint: exportHint },
  ];
}

/** Runs the validator with the first Python interpreter that exists. No shell involved. */
function runValidator(args: string[]) {
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : ["python3", "python"];
  for (const python of candidates) {
    const result = spawnSync(python, [VALIDATOR, ...args], {
      stdio: ["ignore", "inherit", "inherit"],
      // Keep the organisers' folder untouched (no __pycache__ next to validator.py).
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") continue;
    return result;
  }
  console.error(
    `Python 3 not found (tried: ${candidates.join(", ")}). Install Python 3.8+ or set PYTHON.`,
  );
  return null;
}

function main(): number {
  const options = parseOptions(process.argv.slice(2));
  const { mode } = options;
  const root = process.cwd();

  if (!existsSync(path.join(root, VALIDATOR))) {
    console.error(
      `Validator not found at ${VALIDATOR}. Run this from the repo root (npm run validate).`,
    );
    return 1;
  }

  const inputs = inputsFor(options);
  const missing = inputs.filter((i) => !existsSync(path.join(root, i.file)));
  if (missing.length > 0) {
    for (const m of missing) console.error(`Missing ${m.file}. ${m.hint}`);
    return 1;
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), "cit-validate-"));
  const reportPath = path.join(tmpDir, "report.json");
  try {
    console.log(
      `Validating ${inputs[1].file}${mode === "after" ? ` against ${options.disruption}` : ""}\n`,
    );
    const args = inputs
      .flatMap((i) => [i.flag, i.file])
      .concat("--json", reportPath);
    const result = runValidator(args);
    if (!result) return 1;

    if (result.error) {
      console.error(`Could not run the validator: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0 || !existsSync(reportPath)) {
      console.error(
        `\nThe validator exited with code ${result.status ?? result.signal}.`,
      );
      return 1;
    }

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      hard_violation_count?: unknown;
    };
    const hard = Number(report.hard_violation_count);
    if (!Number.isFinite(hard)) {
      console.error(
        "\nFAIL: the validator report has no hard_violation_count.",
      );
      return 1;
    }
    if (hard > 0) {
      console.error(`\nFAIL: ${hard} hard violation(s).`);
      return 1;
    }
    console.log("\nPASS: 0 hard violations.");
    return 0;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

process.exitCode = main();
