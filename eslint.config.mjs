import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Dependency rule (docs/architecture.md §3): app → services → (engine | ai | db) → contracts.
// In flat config a later block's `no-restricted-imports` replaces an earlier one for the same
// files, so general blocks come first and each specific block lists everything it forbids.
const SERVER_ONLY_MODULES = [
  "@/lib/db",
  "@/lib/db/*",
  "@/lib/services",
  "@/lib/services/*",
  "@/lib/ai",
  "@/lib/ai/*",
  "@/lib/auth",
  "@/lib/auth/*",
  "@/lib/env",
  "@/lib/dataset",
  "mongodb",
];

// Illustrative landing-page content; it must never feed the app, the engine or exports.
const LANDING_ONLY_MODULES = ["@/lib/mock-data"];

const restrict = (group, message) => [
  "error",
  { patterns: [{ group, message }] },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/mock-data.ts"],
    rules: {
      "no-restricted-imports": restrict(
        LANDING_ONLY_MODULES,
        "mock-data.ts is illustrative landing-page content only.",
      ),
    },
  },
  {
    // Route handlers: parse, authorise, call a service. Only getDb/pingDb from the db layer.
    files: ["src/app/api/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              importNames: [
                "getCollection",
                "getMongoClient",
                "COLLECTIONS",
                "COLLECTION_NAMES",
              ],
              message: "Routes reach data through services; only getDb/pingDb.",
            },
          ],
          patterns: [
            {
              group: [
                ...LANDING_ONLY_MODULES,
                "@/lib/db/repos",
                "@/lib/db/repos/*",
                "@/lib/engine",
                "@/lib/engine/*",
                "mongodb",
              ],
              message:
                "Routes call services; repositories, the engine and the driver sit behind them.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/services/**/*.ts"],
    ignores: ["**/*.test.ts", "**/test-*.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          ...LANDING_ONLY_MODULES,
          "@/lib/api",
          "@/lib/api/*",
          "next",
          "next/*",
          // These reach Next.js (cookies, responses) or the session layer: routes only.
          // Services use @/lib/auth/policy (and rate-limit) instead.
          "@/lib/auth/guards",
          "@/lib/auth/http",
          "@/lib/auth/session",
          "@/lib/auth/current-user",
          "@/lib/auth/server-session",
        ],
        "Services are framework-free: no route helpers, session guards or Next.js imports.",
      ),
    },
  },
  {
    files: ["src/lib/db/**/*.ts"],
    // user.model.ts is a type-only shim re-exporting the role label type for a frontend file.
    ignores: [
      "**/*.test.ts",
      "**/test-*.ts",
      "src/lib/db/models/user.model.ts",
    ],
    rules: {
      "no-restricted-imports": restrict(
        [
          ...LANDING_ONLY_MODULES,
          "@/lib/services",
          "@/lib/services/*",
          "@/lib/auth",
          "@/lib/auth/*",
          "@/lib/api",
          "@/lib/api/*",
          "@/lib/engine",
          "@/lib/engine/*",
        ],
        "The db layer depends only on contracts, env and the driver.",
      ),
    },
  },
  {
    files: ["src/lib/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          "@/lib/*",
          "!@/lib/contracts",
          "!@/lib/contracts/*",
          "next",
          "next/*",
          "react",
        ],
        "Contracts depend on zod only.",
      ),
    },
  },
  {
    // The AI layer is a pure adapter: contracts + the Gemini SDK (allow-list, like contracts);
    // the service passes context and config. node:fs / node:path / node:crypto are deliberate
    // (prompt loader, cache key). Tests may also read the bundled dataset.
    files: ["src/lib/ai/**/*.ts"],
    ignores: ["**/*.test.ts", "src/lib/ai/test-context.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          "@/lib/*",
          "!@/lib/contracts",
          "!@/lib/contracts/*",
          "@/config/*",
          "@/components/*",
          "mongodb",
          "next",
          "next/*",
          "react",
        ],
        "The AI layer may import only @/lib/contracts and the Gemini SDK; services pass context and config.",
      ),
    },
  },
  {
    files: ["src/lib/ai/**/*.test.ts", "src/lib/ai/test-context.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          "@/lib/*",
          "!@/lib/contracts",
          "!@/lib/contracts/*",
          "!@/lib/dataset",
          "@/config/*",
          "@/components/*",
          "mongodb",
          "next",
          "next/*",
          "react",
        ],
        "AI tests may import contracts and the bundled dataset only.",
      ),
    },
  },
  {
    files: ["src/lib/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          ...SERVER_ONLY_MODULES,
          ...LANDING_ONLY_MODULES,
          "@/lib/validation",
          "@/lib/api",
          "@/lib/api/*",
          "next",
          "next/*",
          "react",
          "fs",
          "node:*",
        ],
        "The engine is pure: it may import only @/lib/contracts and pure helpers.",
      ),
    },
  },
  {
    // Engine tests may load the bundled dataset; engine modules may not.
    files: ["src/lib/engine/**/*.test.ts", "src/lib/engine/test-fixtures.ts"],
    rules: {
      "no-restricted-imports": restrict(
        [
          ...SERVER_ONLY_MODULES.filter((m) => m !== "@/lib/dataset"),
          ...LANDING_ONLY_MODULES,
          "@/lib/validation",
          "@/lib/api",
          "@/lib/api/*",
          "next",
          "next/*",
          "react",
        ],
        "Engine tests may use contracts, the bundled dataset and node built-ins only.",
      ),
    },
  },
  {
    // UI code, plus the client-side fetch helpers it imports.
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/config/**/*.ts",
      "src/lib/api-client.ts",
      "src/lib/redirect.ts",
    ],
    rules: {
      "no-restricted-imports": restrict(
        [...SERVER_ONLY_MODULES, ...LANDING_ONLY_MODULES],
        "UI code must not import server-only modules or landing mock data; go through the API client or a server component.",
      ),
    },
  },
  {
    files: ["src/components/landing/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrict(
        SERVER_ONLY_MODULES,
        "UI code must not import server-only modules; go through the API client or a server component.",
      ),
    },
  },
  {
    // CIT Nexus screens merged from main (frontend team). These findings stay visible as
    // warnings until the frontend team fixes them (listed in docs/project-status.md); every
    // other file keeps the strict rules.
    files: [
      "src/app/admin/page.tsx",
      "src/app/assistant/page.tsx",
      "src/components/auth/login-form.tsx",
      "src/components/timetable/agenda-list.tsx",
      "src/lib/contracts/ui.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".data/**",
    // Local tooling (git-ignored), e.g. extra worktrees with their own builds.
    ".claude/**",
    "next-env.d.ts",
    "CrunchWeek_StarterPack/**",
  ]),
]);

export default eslintConfig;
