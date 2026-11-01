# Third-Party Software and Services

This document lists the third-party open-source packages, UI components, in-house scheduling and optimization engines, external services, fonts, and organizer-provided starter-pack assets used by the CIT Campus Scheduling and Venue Management project.

Package versions are recorded from `package-lock.json` / `node_modules`, and licenses are listed as declared by the respective packages. Verify these details against the current dependency tree before release.

---

## 1. Solvers and Optimization Engines

| Solver / Engine | Source / Implementation | License / Origin | Purpose |
| :--- | :--- | :--- | :--- |
| In-House Timetable Solver (`SOLVER_ALGORITHM = "greedy+repair+SA"`) | `src/lib/engine/solver.ts`, `src/lib/engine/solver-search.ts` | Project-owned | Deterministic timetable generation and disruption optimization using unit-domain propagation, soft-aware greedy construction, min-conflicts repair with tabu restarts, and simulated annealing. Optimizes S1–S6 soft objectives and fest penalties. Designed to run without external solver binaries or native solver daemons. |
| In-House Spectra Engine | `src/lib/engine/bookings.ts` | Project-owned | Venue and booking allocation using a deterministic multi-tier priority queue, role-capped quota enforcement, greedy room-fit assignment, and conflict handling. |
| In-House Exam Scheduler | `src/lib/engine/exams.ts` | Project-owned | Deterministic examination session and room placement subject to room-capacity and student-cohort conflict constraints. |
| Starter-Pack Validator | `CrunchWeek_StarterPack/validator.py` | Organizer-provided; Python standard library | Official validator for exported schedules, including `exports/schedule.json` and `exports/schedule_after.json`, used to check hard-constraint compliance. Run against the relevant exports before release. |

The timetable, booking, and examination engines are implemented in TypeScript within the project. The timetable solver does not wrap external runtime solvers such as Google OR-Tools CP-SAT or Timefold (OptaPlanner).

Any performance figures, including the expected runtime of the timetable solver, should be treated as environment-dependent and verified through benchmarks before being published as guarantees.

---

## 2. npm Runtime Dependencies

Versions and licenses below are those recorded for the project dependencies.

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `@google/genai` | 2.32.0 | Apache-2.0 | Official Google Gemini SDK for booking-request parsing, timetable-assistant intent extraction and replies, and explanation generation. |
| `@hookform/resolvers` | 6.0.2 | MIT | Connects Zod schemas to React Hook Form through `zodResolver`. |
| `@tanstack/react-query` | 5.105.0 | MIT | Server-state fetching, caching, and mutations in the UI. |
| `bcryptjs` | 3.0.3 | BSD-3-Clause | Password hashing for user accounts. |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | Variant-based CSS class composition for UI components. |
| `cmdk` | 1.1.1 | MIT | Command palette primitive used by shadcn/ui `Command`. |
| `cn` | 0.4.0 | MIT | Tailwind CSS class-name merging utility. |
| `framer-motion` | 14.9.0 | MIT | Landing-page animations, reveals, tab transitions, node pulses, and interactive visualizations. |
| `jose` | 6.2.14 | MIT | Signing and verifying session JWTs. |
| `lucide-react` | 1.66.0 | ISC | React icon library. |
| `mongodb` | 7.8.0 | Apache-2.0 | Official MongoDB Node.js driver for database persistence. |
| `next` | 16.4.3 | MIT | React framework providing the App Router, Route Handlers, `proxy.ts`, Server Components, SSR, and `next/font`. |
| `next-themes` | 0.4.6 | MIT | Light and dark theme switching. |
| `nodemailer` | 10.3.1 | MIT-0 | SMTP email delivery for account OTPs through the Brevo relay. |
| `nuqs` | 2.10.2 | MIT | Type-safe URL search-parameter state management. |
| `radix-ui` | 1.8.1 | MIT | Accessible UI primitives used by shadcn/ui components. |
| `react` | 19.3.0 | MIT | React component UI library. |
| `react-dom` | 19.3.0 | MIT | React DOM renderer. |
| `react-hook-form` | 7.91.0 | MIT | Form state management and validation integration. |
| `server-only` | 0.0.1 | MIT | Build-time guard against importing server-only modules into client bundles. |
| `sonner` | 2.0.8 | MIT | Toast notifications. |
| `tw-animate-css` | 1.4.0 | MIT | Animation utility classes compatible with Tailwind CSS v4. |
| `zod` | 4.6.7 | MIT | Schema validation for database contracts, APIs, forms, LLM outputs, and exports. |

---

## 3. npm Development and Tooling Dependencies

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `@tailwindcss/turbopack` | 4.3.3 | MIT | Tailwind CSS v4 integration with Turbopack. |
| `@types/bcryptjs` | 2.4.6 | MIT | TypeScript type definitions for bcryptjs. |
| `@types/node` | 20.19.43 | MIT | TypeScript type definitions for Node.js. |
| `@types/nodemailer` | 8.0.2 | MIT | TypeScript type definitions for Nodemailer. |
| `@types/react` | 19.3.0 | MIT | TypeScript type definitions for React. |
| `@types/react-dom` | 19.3.0 | MIT | TypeScript type definitions for React DOM. |
| `eslint` | 9.39.5 | MIT | Code linting and static analysis. |
| `eslint-config-next` | 16.4.3 | MIT | Next.js ESLint rules. |
| `eslint-config-prettier` | 10.1.8 | MIT | Disables ESLint formatting rules that conflict with Prettier. |
| `prettier` | 3.9.10 | MIT | Code formatting. |
| `prettier-plugin-tailwindcss` | 0.8.1 | MIT | Automatic Tailwind CSS class sorting. |
| `shadcn` | 4.23.0 | MIT | shadcn/ui CLI and shared Tailwind styles, including `shadcn/tailwind.css`. |
| `tailwindcss` | 4.3.3 | MIT | Utility-first CSS framework. |
| `tsx` | 4.23.15 | MIT | Executes TypeScript scripts, including project scripts in `scripts/`. |
| `typescript` | 5.9.3 | Apache-2.0 | Type checking and TypeScript compilation. |
| `vitest` | 4.1.12 | MIT | Unit and integration testing. |

---

## 4. UI Components: shadcn/ui and Radix UI

The following shadcn/ui components are copied into `src/components/ui/` using the shadcn CLI with the `radix-nova` style. The copied component source is maintained in this repository and is subject to the applicable upstream component licenses and notices.

### shadcn/ui Components

The components listed below are MIT-licensed as declared by the project.

| Component | Purpose |
| :--- | :--- |
| `avatar` | User avatars. |
| `badge` | Status labels and compact indicators. |
| `button` | Interactive actions. |
| `card` | Content containers. |
| `command` | Command palette interface. |
| `dialog` | Modal dialogs. |
| `dropdown-menu` | Contextual action menus. |
| `input` | Text input controls. |
| `input-group` | Grouped input elements. |
| `label` | Accessible form labels. |
| `popover` | Floating contextual content. |
| `scroll-area` | Styled scrollable regions. |
| `select` | Selection controls. |
| `separator` | Visual separators. |
| `sheet` | Drawer-style panels. |
| `skeleton` | Loading placeholders. |
| `sonner` | Toast notifications. |
| `table` | Tabular data presentation. |
| `tabs` | Tabbed navigation. |
| `textarea` | Multiline text input. |
| `tooltip` | Contextual hints. |

### Radix UI Primitives

The following Radix primitives are provided through the `radix-ui` dependency.

| Primitive | Version | License | Used By |
| :--- | :--- | :--- | :--- |
| `@radix-ui/react-avatar` | 1.3.1 | MIT | `avatar` |
| `@radix-ui/react-dialog` | 1.3.1 | MIT | `dialog`, `sheet` |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | MIT | `dropdown-menu` |
| `@radix-ui/react-label` | 2.1.17 | MIT | `label` |
| `@radix-ui/react-popover` | 1.3.1 | MIT | `popover` |
| `@radix-ui/react-scroll-area` | 1.4.0 | MIT | `scroll-area` |
| `@radix-ui/react-select` | 2.4.1 | MIT | `select` |
| `@radix-ui/react-separator` | 1.2.0 | MIT | `separator` |
| `@radix-ui/react-slot` | 1.5.0 | MIT | `badge`, `button` |
| `@radix-ui/react-tabs` | 1.2.1 | MIT | `tabs` |
| `@radix-ui/react-tooltip` | 1.4.1 | MIT | `tooltip` |

---

## 5. Fonts and Typography

| Font | License | Delivery Method |
| :--- | :--- | :--- |
| Geist | SIL Open Font License 1.1 | Loaded through `next/font/google` and self-hosted in the build. |
| Geist Mono | SIL Open Font License 1.1 | Loaded through `next/font/google` and self-hosted in the build. |

---

## 6. External Services and APIs

| Service | Category | Purpose / Status |
| :--- | :--- | :--- |
| MongoDB / MongoDB Atlas | Database | Primary data persistence for users, sessions, reference data, schedules, bookings, and audit logs. Development may use a local `mongod` instance or the `mongo:7` Docker image. |
| Google Gemini API | AI / LLM service | Natural-language booking-request parsing, timetable-assistant intent extraction and replies, and explanation phrasing. Model IDs are configurable through environment variables. |
| Vercel | Hosting platform | Application deployment and execution of supported server-side and serverless routes. |
| GitHub Actions | CI/CD | Automated linting, type checking, tests, build verification, and schedule/export validation. Exact checks depend on the workflow configuration. |
| Brevo (transactional email API) | Email delivery | Sends sign-up and login one-time passwords through the SMTP relay. |
| Google Identity (OAuth 2.0) | Authentication | Planned "Continue with Google" sign-in integration; not yet wired into the application, according to the current project documentation. |

External services may have their own terms, pricing, privacy policies, and service-specific requirements that are separate from the licenses of npm packages.

---

## 7. Organizer-Provided Starter Pack Assets

The project uses the following assets from `CrunchWeek_StarterPack/`.

| Asset | Source / Location | Usage |
| :--- | :--- | :--- |
| `CrunchWeek_StarterPack/validator.py` | Organizer-provided starter pack | Official schedule validator, used unmodified to check schedule exports. |
| `CrunchWeek_StarterPack/data/cit_public.json` | Organizer-provided starter pack; copied into `data/` | Baseline campus dataset imported by the application. |
| `CrunchWeek_StarterPack/examples/sample_disruption.json` | Organizer-provided starter pack; copied into `data/` | Standard disruption scenario used for testing and generating `schedule_after.json`. |
| `CrunchWeek_StarterPack/examples/*` (other files) | Organizer-provided starter pack | Reference examples for export formats and AI evaluation inputs. |

The starter-pack validator and data files are used as provided rather than being represented as project-authored third-party libraries.

---

## 8. Licensing and Attribution Notes

- Package versions and license identifiers should be checked against the merged `package-lock.json` and installed dependency tree.
- Third-party packages retain their respective upstream licenses and copyright notices.
- Copied shadcn/ui and Radix-based component source should retain any required upstream notices.
- Geist and Geist Mono are distributed under the SIL Open Font License 1.1.
- The in-house timetable, booking, and examination engines are project implementations, not external solver packages.
- Organizer-provided starter-pack assets remain subject to any applicable organizer terms and competition rules.
- Listing a service or package here does not imply endorsement by its maintainers or providers.
