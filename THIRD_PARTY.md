# Third-Party Software and Services

Versions are the installed versions from `package-lock.json` / `node_modules`. Licenses are as declared by each package.

## npm dependencies

| Package                    | Version | License      | Purpose                                                              |
| -------------------------- | ------- | ------------ | -------------------------------------------------------------------- |
| `@hookform/resolvers`      | 6.0.2   | MIT          | Connects Zod schemas to react-hook-form (`zodResolver`)              |
| `@tanstack/react-query`    | 5.105.0 | MIT          | Server-state fetching, caching and mutations in the UI               |
| `bcryptjs`                 | 3.0.3   | BSD-3-Clause | Password hashing for user accounts                                   |
| `class-variance-authority` | 0.7.1   | Apache-2.0   | Variant-based class names for UI components                          |
| `cmdk`                     | 1.1.1   | MIT          | Command palette (shadcn/ui `Command`)                                |
| `cn`                       | 0.4.0   | MIT          | Tailwind class-name merging (`cn()` helper)                          |
| `framer-motion`            | 14.9.0  | MIT          | Landing-page motion (reveals, tab transitions, node pulses)          |
| `jose`                     | 6.2.14  | MIT          | Signing and verifying session JWTs                                   |
| `lucide-react`             | 1.66.0  | ISC          | Icons                                                                |
| `mongodb`                  | 7.8.0   | Apache-2.0   | Official MongoDB driver                                              |
| `next`                     | 16.4.3  | MIT          | React framework: App Router, Route Handlers, `proxy.ts`, `next/font` |
| `next-themes`              | 0.4.6   | MIT          | Light / dark theme switching                                         |
| `nuqs`                     | 2.10.2  | MIT          | Type-safe URL search-param state                                     |
| `radix-ui`                 | 1.8.1   | MIT          | Accessible UI primitives used by the shadcn/ui components            |
| `react`                    | 19.3.0  | MIT          | UI library                                                           |
| `react-dom`                | 19.3.0  | MIT          | React DOM renderer                                                   |
| `react-hook-form`          | 7.91.0  | MIT          | Form state and validation                                            |
| `server-only`              | 0.0.1   | MIT          | Build-time guard that keeps server modules out of client bundles     |
| `sonner`                   | 2.0.8   | MIT          | Toast notifications                                                  |
| `tw-animate-css`           | 1.4.0   | MIT          | Tailwind v4 animation utilities                                      |
| `zod`                      | 4.6.7   | MIT          | Schemas for every data contract (DB, API, forms, LLM output, export) |

## npm devDependencies

| Package                       | Version  | License    | Purpose                                                          |
| ----------------------------- | -------- | ---------- | ---------------------------------------------------------------- |
| `@tailwindcss/turbopack`      | 4.3.3    | MIT        | Tailwind CSS v4 loader for Turbopack                             |
| `@types/bcryptjs`             | 2.4.6    | MIT        | bcryptjs type definitions                                        |
| `@types/node`                 | 20.19.43 | MIT        | Node.js type definitions                                         |
| `@types/react`                | 19.3.0   | MIT        | React type definitions                                           |
| `@types/react-dom`            | 19.3.0   | MIT        | React DOM type definitions                                       |
| `eslint`                      | 9.39.5   | MIT        | Linting                                                          |
| `eslint-config-next`          | 16.4.3   | MIT        | Next.js ESLint rules                                             |
| `eslint-config-prettier`      | 10.1.8   | MIT        | Turns off ESLint rules that conflict with Prettier               |
| `prettier`                    | 3.9.10   | MIT        | Code formatting                                                  |
| `prettier-plugin-tailwindcss` | 0.8.1    | MIT        | Sorts Tailwind classes                                           |
| `shadcn`                      | 4.23.0   | MIT        | shadcn/ui CLI and shared Tailwind styles (`shadcn/tailwind.css`) |
| `tailwindcss`                 | 4.3.3    | MIT        | Utility-first CSS framework                                      |
| `tsx`                         | 4.23.15  | MIT        | Runs TypeScript scripts (`scripts/*.ts`)                         |
| `typescript`                  | 5.9.3    | Apache-2.0 | Type checking                                                    |
| `vitest`                      | 4.1.12   | MIT        | Unit tests                                                       |

## shadcn/ui components (MIT)

Source copied into `src/components/ui/` with the shadcn CLI (style `radix-nova`) and owned by this repo: `avatar`, `badge`, `button`, `card`, `command`, `dialog`, `dropdown-menu`, `input`, `input-group`, `label`, `popover`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `tooltip`.

Radix UI primitives they use (all MIT, via the `radix-ui` package):

| Primitive                       | Version | Used by           |
| ------------------------------- | ------- | ----------------- |
| `@radix-ui/react-avatar`        | 1.3.1   | `avatar`          |
| `@radix-ui/react-dialog`        | 1.3.1   | `dialog`, `sheet` |
| `@radix-ui/react-dropdown-menu` | 2.2.1   | `dropdown-menu`   |
| `@radix-ui/react-label`         | 2.1.17  | `label`           |
| `@radix-ui/react-popover`       | 1.3.1   | `popover`         |
| `@radix-ui/react-scroll-area`   | 1.4.0   | `scroll-area`     |
| `@radix-ui/react-select`        | 2.4.1   | `select`          |
| `@radix-ui/react-separator`     | 1.2.0   | `separator`       |
| `@radix-ui/react-slot`          | 1.5.0   | `badge`, `button` |
| `@radix-ui/react-tabs`          | 1.2.1   | `tabs`            |
| `@radix-ui/react-tooltip`       | 1.4.1   | `tooltip`         |

## Fonts

| Font              | License                   | How it is loaded                         |
| ----------------- | ------------------------- | ---------------------------------------- |
| Geist, Geist Mono | SIL Open Font License 1.1 | `next/font/google`, self-hosted at build |

## External services

| Service                         | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| MongoDB / MongoDB Atlas         | Database (local `mongod` or `mongo:7` Docker image in development)       |
| Google Gemini API               | Parsing English/Hinglish requests and phrasing explanations              |
| Vercel                          | Hosting                                                                  |
| GitHub Actions                  | CI (lint, typecheck, test, build, export validation)                     |
| Brevo (transactional email API) | Sends sign-up / login one-time passwords (account auth merged from main) |
| Google Identity (OAuth 2.0)     | "Continue with Google" sign-in (planned; not wired yet)                  |

## Organisers' starter pack

| Item                                                                         | Use                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `CrunchWeek_StarterPack/validator.py`                                        | Official validator, run on our exports. Used unmodified.        |
| `CrunchWeek_StarterPack/data/cit_public.json` (copied to `data/`)            | Dataset imported by the app. Used unmodified.                   |
| `CrunchWeek_StarterPack/examples/sample_disruption.json` (copied to `data/`) | Practice disruption for `schedule_after.json`. Used unmodified. |
| `CrunchWeek_StarterPack/examples/*` (other files)                            | Export format reference and AI test inputs                      |
