import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Dependency rule (docs/architecture.md §3): app → services → (engine | ai | db) → contracts.
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

const restrict = (group, message) => [
  "error",
  { patterns: [{ group, message }] },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
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
