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
    files: ["src/components/**/*.{ts,tsx}", "src/config/**/*.ts"],
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
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".data/**",
    "next-env.d.ts",
    "CrunchWeek_StarterPack/**",
  ]),
]);

export default eslintConfig;
