/**
 * AI parse evaluation (backend.md §5.6), no database:
 *
 *   npm run ai-eval [-- --llm] [-- --json out.json] [-- --min 0.9]
 *
 * - Dataset texts: every `booking_requests[].raw_text` of the bundled dataset is parsed with
 *   the rule parser (and with Gemini under `--llm` when `GEMINI_API_KEY` is set) and scored per
 *   field against the request's structured fields (rules in `ai-eval-scoring.ts`). A series is
 *   one text, scored against the union of its members' windows.
 * - Cases: the starter pack's sample requests and adversarial requests (`ai-eval-cases.ts`),
 *   each with its own checks. Reported, not gated.
 *
 * Exit code 1 when any evaluated parser's overall dataset accuracy (correct field checks over
 * all field checks, i.e. the mean of the six per-field accuracies) is below `--min` (default
 * 0.9). The weakest field is reported too, and room types are also scored as exact sets
 * (reported, not gated). `.env.local` is loaded when present; the LLM config comes from
 * `llmConfigFromEnv(parseEnv(process.env), "fast")`, the same defaults the app uses.
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LlmConfig, ParseContext, ParseOutcome } from "@/lib/ai";
import type { Dataset } from "@/lib/contracts";

import {
  EVAL_CASES,
  runChecks,
  type CaseSubject,
  type CheckResult,
  type EvalCase,
} from "./ai-eval-cases";
import {
  EVAL_FIELDS,
  accuracyOf,
  datasetUnits,
  exactAccuracyOf,
  expandRepeatDays,
  fieldLabel,
  percent,
  roomTypesExact,
  scoreFields,
  type Accuracy,
  type EvalField,
  type EvalUnit,
  type ExactAccuracy,
  type FieldScores,
  type ParsedValues,
} from "./ai-eval-scoring";

const REFERENCE_DATE = "2027-02-08";
const DEFAULT_MIN = 0.9;

type Args = { llm: boolean; json: string | null; min: number };

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { llm: false, json: null, min: DEFAULT_MIN };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=", 2) as [string, string?];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--llm") args.llm = true;
    else if (flag === "--json") args.json = value();
    else if (flag === "--min") {
      const min = Number(value());
      if (!Number.isFinite(min) || min < 0 || min > 1) {
        throw new Error("--min must be a fraction between 0 and 1 (e.g. 0.9)");
      }
      args.min = min;
    } else throw new Error(`unknown argument "${argv[i]}"`);
  }
  return args;
}

type AiModule = typeof import("@/lib/ai");
type Parser = { name: string; llm: LlmConfig };
type Parse = (text: string) => Promise<ParseOutcome>;

type UnitResult = {
  id: string;
  request_ids: string[];
  text: string;
  scores: FieldScores;
  /** Room types as an exact set (reported, not gated). */
  room_types_exact: boolean;
  got: ParsedValues | null;
  source: string | null;
  fallback_code: string | null;
  fallback_reason: string | null;
  error?: string;
};

type Miss = {
  request: string;
  /** `all` when the parse crashed (every field counts as missed). */
  field: EvalField | "all";
  expected: string;
  got: string;
};

type CaseResult = {
  id: string;
  kind: EvalCase["kind"];
  category: string;
  text: string;
  pass: boolean;
  checks: CheckResult[];
  source: string | null;
  fallback_code: string | null;
  fallback_reason: string | null;
  error?: string;
};

type ParserReport = {
  parser: string;
  model: string | null;
  dataset: {
    accuracy: Accuracy;
    /** Room types scored as exact sets (reported next to the gated any-overlap metric). */
    exact: ExactAccuracy;
    misses: Miss[];
    units: UnitResult[];
  };
  cases: CaseResult[];
  /** Texts where an LLM was configured but the rule parser answered. */
  fallbacks: number;
  passed: boolean;
};

const errorText = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

const NO_SCORES = Object.fromEntries(
  EVAL_FIELDS.map((f) => [f, false]),
) as FieldScores;

function parsedValues(outcome: ParseOutcome): ParsedValues {
  const { draft } = outcome;
  return {
    attendance: draft.attendance,
    duration_periods: draft.duration_periods,
    windows: draft.windows,
    needs: draft.needs,
    room_types: draft.room_types,
    mandatory_for_groups: draft.mandatory_for_groups,
    repeat_days: draft.repeat_days,
  };
}

async function evalUnit(unit: EvalUnit, parse: Parse): Promise<UnitResult> {
  const base = { id: unit.id, request_ids: unit.request_ids, text: unit.text };
  try {
    const outcome = await parse(unit.text);
    const got = parsedValues(outcome);
    return {
      ...base,
      scores: scoreFields(unit.expected, got),
      room_types_exact: roomTypesExact(unit.expected, got),
      got,
      source: outcome.source,
      fallback_code: outcome.fallback_code,
      fallback_reason: outcome.fallback_reason,
    };
  } catch (err) {
    return {
      ...base,
      scores: NO_SCORES,
      room_types_exact: false,
      got: null,
      source: null,
      fallback_code: null,
      fallback_reason: null,
      error: errorText(err),
    };
  }
}

function missesOf(units: readonly EvalUnit[], results: UnitResult[]): Miss[] {
  return results.flatMap((result, i): Miss[] => {
    const { got } = result;
    if (!got) {
      return [
        {
          request: result.id,
          field: "all",
          expected: "",
          got: `crash: ${result.error}`,
        },
      ];
    }
    const shown = {
      ...got,
      windows: expandRepeatDays(got.windows, got.repeat_days),
    };
    return EVAL_FIELDS.filter((field) => !result.scores[field]).map(
      (field) => ({
        request: result.id,
        field,
        expected: fieldLabel(units[i].expected, field),
        got: fieldLabel(shown, field),
      }),
    );
  });
}

async function evalCase(
  evalCase: EvalCase,
  parse: Parse,
  subjectOf: (outcome: ParseOutcome) => CaseSubject,
): Promise<CaseResult> {
  const base = {
    id: evalCase.id,
    kind: evalCase.kind,
    category: evalCase.category,
    text: evalCase.text,
  };
  try {
    const outcome = await parse(evalCase.text);
    const checks = runChecks(evalCase, subjectOf(outcome));
    return {
      ...base,
      pass: checks.every((c) => c.pass),
      checks,
      source: outcome.source,
      fallback_code: outcome.fallback_code,
      fallback_reason: outcome.fallback_reason,
    };
  } catch (err) {
    return {
      ...base,
      pass: false,
      checks: [],
      source: null,
      fallback_code: null,
      fallback_reason: null,
      error: errorText(err),
    };
  }
}

async function evaluate(
  parser: Parser,
  ai: AiModule,
  ctx: ParseContext,
  units: readonly EvalUnit[],
  subjectOf: (outcome: ParseOutcome) => CaseSubject,
  min: number,
): Promise<ParserReport> {
  // No cache: every text is a fresh parse.
  const parse: Parse = (text) =>
    ai.parseBookingText(text, ctx, { llm: parser.llm });
  const results: UnitResult[] = [];
  for (const unit of units) results.push(await evalUnit(unit, parse));
  const cases: CaseResult[] = [];
  for (const c of EVAL_CASES) cases.push(await evalCase(c, parse, subjectOf));

  const accuracy = accuracyOf(results.map((r) => r.scores));
  const exact = exactAccuracyOf(
    results.map((r) => r.scores),
    results.map((r) => r.room_types_exact),
  );
  const fallbacks = parser.llm
    ? [...results, ...cases].filter((r) => r.source === "rules").length
    : 0;
  return {
    parser: parser.name,
    model: parser.llm?.model ?? null,
    dataset: {
      accuracy,
      exact,
      misses: missesOf(units, results),
      units: results,
    },
    cases,
    fallbacks,
    passed: accuracy.overall.accuracy >= min,
  };
}

// ---------------------------------------------------------------------------------- output

const cell = (value: unknown) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ");

const row = (cells: readonly unknown[]) => `| ${cells.map(cell).join(" | ")} |`;

function weekday(date: string): string {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
}

function markdown(
  reports: readonly ParserReport[],
  meta: {
    dataset: Dataset;
    units: readonly EvalUnit[];
    min: number;
    notes: string[];
  },
): string {
  const out: string[] = [];
  const requests = meta.units.reduce((n, u) => n + u.request_ids.length, 0);
  out.push("# AI parse eval", "");
  out.push(
    `- Dataset \`${meta.dataset.dataset_id}\`, reference date ${REFERENCE_DATE} (${weekday(REFERENCE_DATE)}): ${meta.units.length} texts from ${requests} requests (each series parsed once).`,
    `- Parsers: ${reports.map((r) => r.parser).join(", ")}.`,
    `- Gate: overall dataset accuracy (correct field checks / all field checks) ≥ ${percent(meta.min)} for every parser, with room types scored by overlap (any shared type). The exact-set rows are reported, not gated.`,
    ...meta.notes.map((n) => `- ${n}`),
    "",
  );

  out.push("## Dataset texts: per-field accuracy", "");
  out.push(row(["Field", ...reports.map((r) => r.parser)]));
  out.push(row(["---", ...reports.map(() => "---")]));
  const fmt = (t: { correct: number; total: number; accuracy: number }) =>
    `${t.correct}/${t.total} (${percent(t.accuracy)})`;
  for (const field of EVAL_FIELDS) {
    out.push(
      row([
        field,
        ...reports.map((r) => fmt(r.dataset.accuracy.fields[field])),
      ]),
    );
  }
  out.push(
    row([
      "**overall**",
      ...reports.map((r) => `**${fmt(r.dataset.accuracy.overall)}**`),
    ]),
    row([
      "weakest field",
      ...reports.map((r) => percent(r.dataset.accuracy.min_field)),
    ]),
    row([
      "room_types (exact set)",
      ...reports.map((r) => fmt(r.dataset.exact.room_types)),
    ]),
    row([
      "overall (room types as exact sets)",
      ...reports.map((r) => fmt(r.dataset.exact.overall)),
    ]),
    "",
  );

  for (const report of reports) {
    out.push(`## Misses: ${report.parser}`, "");
    if (report.dataset.misses.length === 0) out.push("(none)", "");
    else {
      out.push(row(["Request", "Field", "Expected", "Got"]));
      out.push(row(["---", "---", "---", "---"]));
      for (const m of report.dataset.misses) {
        out.push(row([m.request, m.field, m.expected, m.got]));
      }
      out.push("");
    }
  }

  for (const report of reports) {
    out.push(`## Sample and adversarial cases: ${report.parser}`, "");
    out.push(row(["Case", "Category", "Result", "Failed checks"]));
    out.push(row(["---", "---", "---", "---"]));
    for (const c of report.cases) {
      const failed = c.error
        ? `crash: ${c.error}`
        : c.checks
            .filter((k) => !k.pass)
            .map((k) => `${k.name} (got ${JSON.stringify(k.got ?? null)})`)
            .join("; ");
      out.push(row([c.id, c.category, c.pass ? "pass" : "FAIL", failed]));
    }
    const count = (kind?: EvalCase["kind"]) => {
      const list = report.cases.filter((c) => !kind || c.kind === kind);
      return `${list.filter((c) => c.pass).length}/${list.length}`;
    };
    const crashes = report.cases.filter((c) => c.error).length;
    out.push(
      "",
      `Cases passed: ${count()} (samples ${count("sample")}, adversarial ${count("adversarial")}); crashes: ${crashes}.` +
        (report.model
          ? ` Fell back to rules on ${report.fallbacks} texts.`
          : ""),
      "",
    );
  }

  const passed = reports.every((r) => r.passed);
  out.push("## Result", "");
  for (const r of reports) {
    const overall = r.dataset.accuracy.overall.accuracy;
    out.push(
      `- ${r.parser}: ${percent(overall)} ${r.passed ? "≥" : "<"} ${percent(meta.min)} → ${r.passed ? "PASS" : "FAIL"} (room types as exact sets: ${percent(r.dataset.exact.overall.accuracy)}, not gated)`,
    );
  }
  out.push("", `Exit code ${passed ? 0 : 1}.`);
  return out.join("\n");
}

// ------------------------------------------------------------------------------------ main

/** The env keys the LLM config reads (the fallback below validates only these). */
const LLM_ENV_KEYS = [
  "LLM_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_MODEL_FAST",
  "GEMINI_MODEL_SMART",
  "LLM_TIMEOUT_MS",
] as const;

/**
 * The app's own LLM config: `llmConfigFromEnv(parseEnv(process.env), "fast")` (same model
 * default and timeout as the API, minus the admin's settings toggle). `parseEnv` validates the
 * whole environment and throws on any invalid value, e.g. a short `AUTH_SECRET` in `.env.local`
 * or weak secrets under `NODE_ENV=production`; the eval needs none of that, so it then validates
 * only the LLM keys with the same schema. Returns null (with a note) when the LLM is off.
 */
/** The env keys a validation error names (its message never echoes values). */
function invalidKeys(err: unknown): string {
  const issues = (err as { issues?: { key: string }[] } | null)?.issues;
  return Array.isArray(issues) && issues.length > 0
    ? issues.map((i) => i.key).join(", ")
    : errorText(err).split("\n")[0];
}

async function evalLlmConfig(notes: string[]): Promise<LlmConfig> {
  const { parseEnv } = await import("@/lib/env");
  const { llmConfigFromEnv } = await import("@/lib/services/llm");
  let env: ReturnType<typeof parseEnv>;
  try {
    env = parseEnv(process.env);
  } catch (err) {
    const llmOnly = Object.fromEntries(
      LLM_ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    try {
      env = parseEnv(llmOnly);
      notes.push(
        `The environment failed validation (${invalidKeys(err)}); the LLM settings alone were valid and are used.`,
      );
    } catch (inner) {
      notes.push(
        `\`--llm\` given but the LLM settings are invalid (${invalidKeys(inner)}): LLM skipped.`,
      );
      return null;
    }
  }
  const llm = llmConfigFromEnv(env, "fast");
  if (!llm)
    notes.push(
      "`--llm` given but the LLM is off (LLM_ENABLED=false or no GEMINI_API_KEY): LLM skipped.",
    );
  return llm;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const envFile = resolve(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  // Imported after the env file is loaded.
  const ai = await import("@/lib/ai");
  const { getBundledDataset } = await import("@/lib/dataset");
  const { buildParseContext, requestedRoomFor } =
    await import("@/lib/services/booking-parse");

  const dataset = getBundledDataset();
  const ctx = buildParseContext(dataset, REFERENCE_DATE);
  const units = datasetUnits(dataset.booking_requests);
  // Cases see the requested room as the API reports it (missing-need note included).
  const subjectOf = (outcome: ParseOutcome): CaseSubject => ({
    outcome,
    draft: outcome.draft,
    requested_room: requestedRoomFor(outcome, dataset.rooms),
  });

  const notes: string[] = [];
  const parsers: Parser[] = [{ name: "rules", llm: null }];
  if (args.llm) {
    const llm = await evalLlmConfig(notes);
    if (llm) parsers.push({ name: `llm (${llm.model})`, llm });
  }

  const reports: ParserReport[] = [];
  for (const parser of parsers) {
    reports.push(await evaluate(parser, ai, ctx, units, subjectOf, args.min));
  }
  const passed = reports.every((r) => r.passed);

  console.log(markdown(reports, { dataset, units, min: args.min, notes }));
  if (args.json) {
    const file = resolve(process.cwd(), args.json);
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          dataset_id: dataset.dataset_id,
          reference_date: REFERENCE_DATE,
          min: args.min,
          gate: "overall",
          passed,
          notes,
          parsers: reports,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nWrote ${file}`);
  }
  process.exitCode = passed ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(`[ai-eval] failed: ${errorText(err)}`);
  process.exitCode = 1;
});
