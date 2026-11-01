# Third-Party Software, Libraries and Solvers

This document lists all third-party open-source software, solver libraries, frontend/backend dependencies, external APIs, and starter-pack assets used in the CIT Campus Scheduling and Venue Management application.

---

## 1. Solvers & Optimization Engines

| Solver / Engine | Source / Implementation | License | Purpose & Role |
| :--- | :--- | :--- | :--- |
| **In-House Timetable Solver** (`SOLVER_ALGORITHM = "greedy+repair+SA"`) | Custom implementation in TypeScript (`src/lib/engine/solver.ts`, `src/lib/engine/solver-search.ts`) | Project-owned | **Timetable Generation & Disruption Optimization**: Rather than wrapping external runtime solvers like Google OR-Tools CP-SAT or Timefold (OptaPlanner), the project implements a deterministic, standalone optimization engine using unit-domain propagation, soft-aware greedy construction, min-conflicts repair with tabu restarts, and simulated annealing (S1–S6 soft objectives + fest penalty). Runs in ~300–800 ms with zero external binaries or native solver daemons. |
| **In-House Spectra Engine** | Custom implementation in TypeScript (`src/lib/engine/bookings.ts`) | Project-owned | **Venue & Booking Allocation Engine**: Deterministic multi-tier priority queue, role-capped quota enforcement, and greedy room-fit assignment with automatic conflict resolution. |
| **In-House Exam Scheduler** | Custom implementation in TypeScript (`src/lib/engine/exams.ts`) | Project-owned | **Exam Placement Engine**: Deterministic session and room placement under strict room capacity and student cohort conflict constraints. |
| **Starter-Pack Validator** | `CrunchWeek_StarterPack/validator.py` (Python 3 standard library) | Provided by Organizers | **Official Parity & Hard Constraint Verification**: Run against export artifacts (`exports/schedule.json`, `exports/schedule_after.json`) to verify 0 hard violations before schedule export. |

---

## 2. npm Open-Source Runtime Libraries

Versions as locked in `package-lock.json` and declared by each upstream project.

| Package | Version | License | Upstream Source / Purpose |
| :--- | :--- | :--- | :--- |
| `@google/genai` | 2.32.0 | Apache-2.0 | Official Google Gemini SDK for structured booking parsing and explanation phrasing |
| `@hookform/resolvers` | 6.0.2 | MIT | Zod validation resolver for React Hook Form |
| `@tanstack/react-query` | 5.105.0 | MIT | Asynchronous server-state management, caching, and cache invalidation |
| `bcryptjs` | 3.0.3 | BSD-3-Clause | Password hashing for local institutional authentication |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | Type-safe CSS variant composition |
| `cmdk` | 1.1.1 | MIT | Accessible, composable command palette primitive |
| `cn` | 0.4.0 | MIT | Utility function for merging Tailwind CSS classes |
| `framer-motion` | 14.9.0 | MIT | Motion and animation library for landing page transitions and interactive visualizations |
| `jose` | 6.2.14 | MIT | Edge-compatible JSON Web Token (JWT) signing and verification |
| `lucide-react` | 1.66.0 | ISC | Vector icon collection |
| `mongodb` | 7.8.0 | Apache-2.0 | Official Node.js MongoDB driver for database persistence |
| `next` | 16.4.3 | MIT | Full-stack React framework (App Router, Route Handlers, Turbopack, SSR, Server Components) |
| `next-themes` | 0.4.6 | MIT | Color theme switching (light / dark mode) |
| `nodemailer` | 10.3.1 | MIT-0 | SMTP transport engine for delivering OTP verification emails via Brevo relay |
| `nuqs` | 2.10.2 | MIT | Type-safe URL search parameters synchronization |
| `radix-ui` | 1.8.1 | MIT | Unstyled, accessible component primitives |
| `react` | 19.3.0 | MIT | Declarative component UI library |
| `react-dom` | 19.3.0 | MIT | DOM renderer for React 19 |
| `react-hook-form` | 7.91.0 | MIT | High-performance form state handling |
| `server-only` | 0.0.1 | MIT | Build-time enforcement ensuring server modules are never bundled to the client |
| `sonner` | 2.0.8 | MIT | Lightweight toast notification component |
| `tw-animate-css` | 1.4.0 | MIT | Animation utility classes compatible with Tailwind v4 |
| `zod` | 4.6.7 | MIT | TypeScript-first schema definition and data validation |

---

## 3. npm Developer & Tooling Dependencies

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `@tailwindcss/turbopack` | 4.3.3 | MIT | Fast Tailwind CSS v4 compiler plugin for Next.js Turbopack |
| `@types/bcryptjs` | 2.4.6 | MIT | TypeScript type definitions for bcryptjs |
| `@types/node` | 20.19.43 | MIT | TypeScript type definitions for Node.js runtime |
| `@types/nodemailer` | 8.0.2 | MIT | TypeScript type definitions for nodemailer |
| `@types/react` | 19.3.0 | MIT | TypeScript definitions for React 19 |
| `@types/react-dom` | 19.3.0 | MIT | TypeScript definitions for React DOM 19 |
| `eslint` | 9.39.5 | MIT | Static code analysis and linting engine |
| `eslint-config-next` | 16.4.3 | MIT | Official Next.js ESLint configuration |
| `eslint-config-prettier` | 10.1.8 | MIT | ESLint config to disable formatting rules that conflict with Prettier |
| `prettier` | 3.9.10 | MIT | Opinionated code formatter |
| `prettier-plugin-tailwindcss` | 0.8.1 | MIT | Automatic class sorting plugin for Tailwind CSS |
| `shadcn` | 4.23.0 | MIT | Component generator CLI and shared styling architecture |
| `tailwindcss` | 4.3.3 | MIT | Next-generation utility-first styling engine |
| `tsx` | 4.23.15 | MIT | TypeScript execution environment for seed, parity, export, and evaluation scripts |
| `typescript` | 5.9.3 | Apache-2.0 | Static type-checker for TypeScript code |
| `vitest` | 4.1.12 | MIT | High-performance unit and integration testing runner |

---

## 4. UI Component Primitives (shadcn/ui & Radix UI)

Open-source UI components vendored into `src/components/ui/` (style `radix-nova`, licensed under MIT) using the Radix UI accessibility foundation:

| Radix Primitive | Version | License | UI Components Utilizing It |
| :--- | :--- | :--- | :--- |
| `@radix-ui/react-avatar` | 1.3.1 | MIT | `Avatar` |
| `@radix-ui/react-dialog` | 1.3.1 | MIT | `Dialog`, `Sheet` |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | MIT | `DropdownMenu` |
| `@radix-ui/react-label` | 2.1.17 | MIT | `Label` |
| `@radix-ui/react-popover` | 1.3.1 | MIT | `Popover` |
| `@radix-ui/react-scroll-area` | 1.4.0 | MIT | `ScrollArea` |
| `@radix-ui/react-select` | 2.4.1 | MIT | `Select` |
| `@radix-ui/react-separator` | 1.2.0 | MIT | `Separator` |
| `@radix-ui/react-slot` | 1.5.0 | MIT | `Badge`, `Button` |
| `@radix-ui/react-tabs` | 1.2.1 | MIT | `Tabs` |
| `@radix-ui/react-tooltip` | 1.4.1 | MIT | `Tooltip` |

---

## 5. Typography & Fonts

| Font Family | License | Delivery Method |
| :--- | :--- | :--- |
| **Geist Sans** | SIL Open Font License 1.1 | Embedded self-hosted font via `next/font/google` |
| **Geist Mono** | SIL Open Font License 1.1 | Embedded self-hosted monospace font via `next/font/google` |

---

## 6. Cloud Services & External APIs

| Service | Category | Purpose |
| :--- | :--- | :--- |
| **MongoDB / MongoDB Atlas** | Managed Database | Primary data persistence for users, sessions, reference data, schedules, bookings, and audit logs |
| **Google Gemini API** | AI / LLM Service | Natural-language query parsing and decision explanations (`gemini-3.8-flash`) |
| **Vercel** | Edge & Serverless Platform | Cloud deployment, edge routing, and serverless route handler execution |
| **Brevo (Sendinblue)** | Transactional Email Relay | High-deliverability SMTP service for sending OTP verification codes |
| **GitHub Actions** | CI/CD | Automated build verification, linting, unit test execution, and schedule export validation |

---

## 7. Starter Pack Assets & Reference Files

| Asset | Source | Usage |
| :--- | :--- | :--- |
| `CrunchWeek_StarterPack/validator.py` | Hackathon Starter Pack | Ground-truth reference validator used unmodified in `npm run validate` |
| `CrunchWeek_StarterPack/data/cit_public.json` | Hackathon Starter Pack | Baseline campus dataset imported into MongoDB and bundled in `data/cit_public.json` |
| `CrunchWeek_StarterPack/examples/sample_disruption.json` | Hackathon Starter Pack | Standard benchmark disruption scenario used for disruption testing |
