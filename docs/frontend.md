# Frontend Plan: Design and Development

> How the UI looks, what each screen does, and how we build it in 24 hours.
> Types and API routes come from [architecture.md](./architecture.md) (§4 contracts, §6 API). Feature priorities come from [backend.md](./backend.md) (§2).

---

## 1. Goals: what the judges check

| Rubric line | What the judge does | What we must make effortless |
|---|---|---|
| **Usability and dashboard (10)** | Opens the app knowing only the README and demo accounts, then must **find a room, read a timetable, approve a change** | One-click demo logins. "Find a room" on the dashboard. "Approvals (n)" badge in the nav. Timetables are 1 click from anywhere. |
| **UI and design (10)** | Uses the live app on laptop **and phone** | Consistent shadcn styling, readable grids, mobile day view, skeleton/empty/error states everywhere |
| **UI/UX (15 %)** (event rubric) | Overall polish and flow | Clear hierarchy, no dead ends, every action gives feedback (toast + state change) |
| **Rescheduling: clear view (4 of 15)** | Applies a change file, reviews it, approves | Before/after diff grid, move list, "0 hard violations ✓" badge, explicit Approve step |
| **Use of AI (15)** | Types tricky requests | Editable draft, visible assumption chips, follow-up question card, "capped" notices, works with AI off |
| **Video** | Every required flow on screen | Each flow fits in ≤ 3 clicks (see the script in [architecture.md §12.7](./architecture.md#127-five-minute-video-script-covers-every-item-the-pdf-asks-for)) |

**Design principle:** *the timetable grid is the hero.* If the grid is beautiful and readable on a phone, half the UI marks are won.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (latest stable), App Router, TypeScript strict | Fixed by team. RSC for fast first paint. |
| Styling | Tailwind CSS v4 + CSS variables | Fast, consistent, dark mode via tokens |
| Components | **shadcn/ui** (Radix primitives) + lucide-react icons | Accessible, polished defaults, we own the code |
| Server state | TanStack Query v5 | Caching, mutations, invalidation, loading/error states |
| URL state | `nuqs` | Shareable views (`/timetable/group/Y1-A?week=spectra`) |
| Forms | react-hook-form + `zodResolver` using **the same Zod contracts** as the API | One validation source |
| Toasts | `sonner` (shadcn) | Feedback for every mutation |
| Command palette | `cmdk` (shadcn Command) | ⌘K jump to any group, faculty, room or request |
| Charts | shadcn charts (Recharts) for bars/donuts. Custom CSS-grid heatmap. | A heatmap is simpler as a CSS grid |
| Drag and drop (C3) | `@dnd-kit/core` | Accessible, keyboard support |
| Motion | Tailwind transitions. `motion` only for the diff ghost animation. | Keep the bundle light |

Everything used goes into `THIRD_PARTY.md`.

---

## 3. Design system

### 3.1 Tokens (`src/app/globals.css`, shadcn theme variables)

> **Visual direction: CIT Nexus** (the team's landing/login/signup design, see `PROGRESS.md`): dark-only "campus command centre" — obsidian `#070A12`, navy surfaces `#0B1220`/`#101A2B`/`#132035`, cyan accent `#66E3F0`, violet `#8279FF`, soft white `#F4F7FB`, muted slate `#98A6BB`. The CIT Nexus variables at the top of `globals.css` are the source; the shadcn component tokens and the semantic tokens below are mapped onto that palette for the signed-in app.

- **Font:** Geist Sans (UI) + Geist Mono (ids like `MA101-AB-L1`, `BR-07`, `P6`).
- **Radius:** `--radius: 0.75rem`. Cards `rounded-xl`, chips `rounded-full`.
- **Spacing:** 4-px scale. Page padding `p-4 md:p-6`. Card gap `gap-4`.
- **Elevation:** flat cards with `border` + `shadow-sm`. Drawers and dialogs get `shadow-lg`.
- **Theme:** dark only, matching the CIT Nexus landing pages (`next-themes` forced to dark for toasts and the `dark:` variant).

### 3.2 Colour semantics (always paired with an icon or text, so colour-blind users are covered)

| Meaning | Token | Hue (dark theme) | Icon / label |
|---|---|---|---|
| Lecture | `--kind-lecture` | indigo-500 / indigo-400 | `L` |
| Tutorial | `--kind-tutorial` | teal-500 / teal-400 | `T` |
| Lab (3 h) | `--kind-lab` | amber-500 / amber-400 | `P` (practical) + flask icon |
| Elective basket | `--kind-basket` | fuchsia-500 | layers icon + "OEB-1" |
| Week-7 override | `--override` | violet outline, dashed | ⚡ "Week 7 only" |
| Event booking (Spectra view) | `--booking` | pink, diagonal hatch | ticket icon |
| Approved | `--status-approved` | green-600 | ✓ Approved |
| Alternative offered | `--status-alternative` | amber-600 | ↔ Alternative |
| Rejected | `--status-rejected` | red-600 | ✕ Rejected |
| Pending | `--status-pending` | blue-600 | ⏳ Pending |
| Cancelled | `--status-cancelled` | zinc-500, strikethrough | ⊘ Cancelled |
| Hard violation | `--hard` | red | octagon-alert + rule code (H4) |
| Soft penalty | `--soft` | amber | triangle-alert + code (S2) |

**Priority category chips** (ordered as `priority_order`): Exam (red) · Regular class (slate) · Institute event (violet) · Guest lecture (sky) · Department event (emerald) · Club event (pink). When the role cap applies, show `club_event` with a small **"capped"** badge and a tooltip with the original claim.

### 3.3 Time display (only in `src/lib/format.ts`)

- `P6` → "14:00–15:00". Short form "P6 · 2 PM" on phones.
- Lunch is a visual separator row between P5 and P6: "Lunch · 13:00–14:00". It's never a period.
- P10–P13 (events only) appear in the Spectra-week view with a shaded "Evening (events only)" band.
- `MON` → "Mon" (compact) / "Monday" (full). Exam slots: `AM` "09:30–11:30", `PM` "14:00–16:00".

### 3.4 Accessibility

- WCAG AA contrast in the dark theme. Lighthouse a11y ≥ 90.
- Full keyboard navigation. Grid cells are buttons with `aria-label="MA101 lecture, Monday 09:00, LH-1, Dr. Shalini Gupta"`.
- Focus rings visible. Dialogs trap focus (Radix). Toasts are announced (`aria-live`).
- Never colour-only: status chips always include text.

---

## 4. Information architecture

### 4.1 Navigation (sidebar on desktop, bottom tab bar + "More" sheet on phone)

| Item | Admin | Coordinator | Faculty | Club |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Timetables | ✅ | ✅ | ✅ (defaults to "My timetable") | ✅ |
| Find a room | ✅ | ✅ | ✅ | ✅ |
| Bookings (new + mine) | ✅ | ✅ | ✅ | ✅ |
| Spectra week | ✅ | ✅ | ✅ (read) | ✅ (read) |
| Approvals `(n)` | ✅ | ✅ (dept labs) | — | — |
| Changes | ✅ | ✅ | ✅ (my requests) | — |
| AI assistant | ✅ | ✅ | ✅ | — (club uses the booking parser) |
| Exams | ✅ | ✅ | ✅ | ✅ (read) |
| Admin | ✅ | — | — | — |

Top bar: page title + breadcrumbs · week toggle (Regular / Spectra week / Exam week) on timetable pages · ⌘K search · role badge · user menu (logout).

### 4.2 Route map

| Route | Roles | Purpose | Data (API) |
|---|---|---|---|
| `/` · `/signup` | public | CIT Nexus landing page; access-request screen (never creates accounts) | — |
| `/login` | public | Email form (+ one-click demo-account cards with real sign-in, Phase 2) | `POST /api/auth/login` |
| `/dashboard` | all | Role-aware KPIs and to-dos | `GET /api/dashboard` |
| `/timetable/[view]/[id]` | all | Grid by `group` / `faculty` / `room` | `GET /api/timetable?view&id&week` |
| `/rooms` | all | Find a free room | `GET /api/rooms/available` |
| `/bookings` | all | My requests (Admin: all) with status + reason | `GET /api/bookings` |
| `/bookings/new` | all except none | Describe it (NL) / Fill the form | `POST /api/bookings/parse`, `POST /api/bookings` |
| `/spectra` | all | 25+ Week-7 decisions, table + room timeline | `GET /api/bookings?week=7`, `POST /api/spectra/run` (admin) |
| `/approvals` | admin, coordinator | Inbox: change proposals, bookings needing approval | `GET /api/changes?status=pending`, `GET /api/bookings?state=pending_approval` |
| `/approvals/[id]` | admin, coordinator | Diff review + approve/reject | `GET /api/changes/:id`, `POST …/approve` |
| `/changes` · `/changes/new` | admin, coordinator, faculty | Disruptions and change requests | `POST /api/changes` |
| `/assistant` | admin, coordinator, faculty | Chat with verified option cards | `POST /api/assistant` |
| `/exams` | all | Exam week grid | `GET /api/exams` |
| `/admin` | admin | Data, Generate, Validate, Export, Settings, Reset | `/api/admin/*`, `/api/timetable/generate`, `/api/validate`, `/api/export`, `/api/settings` |

---

## 5. Screen specs

### 5.1 Login (`/login`)

- Left: brand panel with the theme line "**Crunch Week**: zero clashes in Week 7" and three stat pills from the dataset (189 sessions · 27 rooms · 25 Spectra requests).
- Right: **four demo cards** (Admin, Dept coordinator, Faculty, Club rep), each with an icon, a one-line "what you can do" and a **Login** button. A collapsible email/password form sits below.
- States: button spinner, error toast "Invalid credentials".

### 5.2 Dashboard (`/dashboard`), role-aware

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Good evening, Admin                       [Find a room ▸] [Generate ▸]    │
├──────────┬──────────┬──────────┬──────────┬──────────┬───────────────────┤
│ 189/189  │ 0 hard ✓ │ Soft 48  │ 64 / 70  │ 3 pending│ 61 % utilisation  │
│ scheduled│ violations│ penalty │ booking  │ approvals│ (teaching hours)  │
├──────────┴──────────┴──────────┴─────┬────┴──────────┴───────────────────┤
│ Pending approvals                    │ Room utilisation heatmap          │
│ • CR-0001 F07 Monday leave (4 moves) │ rooms × (MON..FRI × P1..P9)       │
│ • BR-21 CS-LAB-2 (dept lab)          │ ■■□■■■□…                          │
├──────────────────────────────────────┼───────────────────────────────────┤
│ Current conflicts                    │ Spectra week summary              │
│ ✓ No conflicts in the active timetable│ donut: 21 approved · 2 alt · 2 rej│
└──────────────────────────────────────┴───────────────────────────────────┘
```

- **Admin:** all of the above plus quick actions (Generate, Upload change file, Export, Validate).
- **Coordinator:** department timetables (chips for its groups), pending dept-lab bookings to approve, my change requests.
- **Faculty:** "My week" mini-grid (today highlighted), my requests, buttons for Mark unavailability and Ask the assistant.
- **Club:** my requests with status chip and **reason**, a big "Book a venue" CTA, and Find a room.
- Each KPI card is a link (e.g. "3 pending" → `/approvals`).

### 5.3 Timetable explorer (`/timetable/[view]/[id]`): the hero screen

```
 [Group ▾ Y1-A] [Faculty] [Room]     Week: (Regular) (Spectra wk 7) (Exam wk)   ⤓ ICS  🖨
┌──────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│      │ Mon         │ Tue         │ Wed         │ Thu         │ Fri         │
├──────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ P1 8 │             │ MA101  L    │             │ ...         │             │
│ P2 9 │ PH191  P ┐  │ LH-1 · F19  │ ID101 L ⚡  │             │             │
│ P3 10│ PHY-LAB  │  │             │ AUD         │             │             │
│ P4 11│ F21      ┘  │             │             │             │             │
│ P5 12│             │             │             │             │             │
├──────┴─────────────┴──── Lunch · 13:00–14:00 ──┴─────────────┴─────────────┤
│ P6 2 │ OEB-1 ▣ OE301 LH-3 · OE302 LH-5 · OE303 CR-101  (basket, stacked)    │
│ ...  │                                                                     │
│ P9 5 │                                                                     │
├──────┴──── Evening · events only (Spectra view) ───────────────────────────┤
│ P10–13  hatched pink booking cards (e.g. "Quiz prelims · SH-1")            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** CSS grid, 5 day columns × 9 period rows (13 in the Spectra view). Labs **span 3 rows** (`row-span-3`). Basket sessions render as one card with stacked sub-rows.
- **Session card:** course code (mono, bold) · kind chip · room · faculty short name. Group view shows the room, room view shows the groups, faculty view shows groups and room. Colour comes from the kind.
- **Override / booking markers:** ⚡ dashed violet outline for Week-7 overrides (tooltip "Moved for Spectra Inauguration (BR-01)"). Bookings in the Spectra view are hatched pink cards.
- **Session drawer** (click a card): details (course title, groups, size vs capacity bar, faculty, room features) · **"Why here?"** button → explanation text + fact bullets (from `/api/explain`) · **"Request change"** (faculty/coordinator) → prefilled change form · Admin: "Move…" opens manual placement with a live check.
- **Entity picker:** combobox with search (groups, faculty, rooms). Recent picks are remembered. Faculty default to their own timetable.
- **Phone (< 768 px):** day tabs (Mon–Fri, swipe) + vertical agenda list (time rail on the left, cards full width, lunch divider). There's a toggle back to the compact grid.
- **States:** skeleton grid · empty "No timetable yet. Admin → Generate" (CTA visible for admin) · error card with Retry.

### 5.4 Find a room (`/rooms`)

- Filters: day, from–to period (range slider, P1–P13), min capacity, needs (projector, PA, stage, computers, AC, power benches), accessible toggle, room type.
- Result: list of room cards (name, type, capacity, features icons, accessible badge) with **Free ✓ / Busy ✕ (by MA101 / BR-07)**. Primary action: **Book this** → `/bookings/new` prefilled.
- Secondary view: **availability matrix** for the chosen day (rooms × P1–P13, free cells green). Tap a free run to book it.

### 5.5 New booking (`/bookings/new`): AI + manual

```
┌ Describe it ───────────────┬ Fill the form ┐       ┌ Live check ──────────────────┐
│ "seminar hall kal shaam 6  │                │       │ Prediction: ✓ Approved        │
│  baje, 2 ghante, 100 log,  │  🎤            │       │ SH-1 · Tue 18:00–20:00        │
│  mic chahiye"   [Parse ▸]  │                │       │ Candidates                    │
│ Try: [Hinglish] [Vague] …  │                │       │ ✓ SH-1  150 seats, PA         │
├────────────────────────────┴────────────────┤       │ ✕ SH-2  booked by BR-14       │
│ ❓ Follow-up: "How long will it run?" [1h][2h][3h]  │ ✕ AUD   no seminar-hall type  │
│ Title     [Rehearsal                ]               │ Category: club_event          │
│ Attendance[100] ⓘ assumed from "100 log"            │ (capped from institute_event) │
│ Day       [Tue ▾] ⓘ "kal" → Tue (ref Mon)           └───────────────────────────────┘
│ From–to   [P10 18:00] – [P11 19:00]                 │
│ Room types[Seminar hall ×]  Needs [PA system ×]     │
│ Requested room [Any ▾]   Mandatory for [—]          │
│                                   [Submit request] │
└─────────────────────────────────────────────────────┘
```

- **Two tabs:** *Describe it* (textarea + mic button (C10) + example chips including Hinglish and vague ones) and *Fill the form*. Both end in the **same** `BookingDraftForm`, a react-hook-form bound to the shared Zod schema.
- After parsing: fields are prefilled. Each inferred value carries an **assumption chip** (amber ⓘ with the source phrase). A **follow-up card** at the top shows quick-answer buttons when `follow_up` is set.
- **Live check panel** (debounced on change → `/api/timetable/check` / availability preview): predicted outcome, candidate rooms with ✓/✕ and reasons, category with a "capped" notice, and warnings like "SH-2 isn't accessible, SH-1 is [Use SH-1]".
- **AI-off mode:** banner "AI is unavailable. The form works normally." The *Describe it* tab shows the rule-based parse or is disabled. The form tab is always usable.
- **Submit result:** a full-width result card (status chip, room/time, reason) with "View my bookings" and "Book another".
- **Recurring:** "Repeat on" day toggles create a series. Shown as one card with per-day results.

### 5.6 My bookings (`/bookings`)

- Table (desktop) / cards (phone): title, when, room, status chip, **reason** (always visible, not hidden in a tooltip), category (+capped), actions (Cancel, Accept alternative).
- Filters: status, day. Empty state: "No requests yet. Book a venue →".

### 5.7 Spectra week board (`/spectra`)

- **Header KPIs:** approved / alternative / rejected counts, booking score `64 / 70`, priority inversions `0 ✓`. Admin also gets a **Re-run decisions** button.
- **Decisions table:** ID · title · requester · category (requested → effective + capped badge) · asked (day, time, requested room) · decision (chip + room/time) · reason. Group series rows (SER-DANCE, SER-ROBOWARS). Sortable by priority. Row click → drawer with the full explanation and the competing requests.
- **Room timeline:** Gantt-style rows for event-capable rooms (AUD, OAT, SH-1, SH-2, LH-1…), columns MON–FRI × P1–P13. Classes in grey, bookings coloured by category, overrides marked ⚡.
- Phone: table becomes cards. The timeline scrolls horizontally with a sticky room column.

### 5.8 Approvals (`/approvals`, `/approvals/[id]`)

```
 CR-0001 · Faculty leave: F07 every Monday       requested by CSE Coordinator · 2 min ago
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ 4 sessions moved (3 time · 1 room only)   0 hard violations ✓   soft +2      │
 └──────────────────────────────────────────────────────────────────────────────┘
 [ Before | After | Overlay ]   view: (CSE-2 ▾)
 grid with moved sessions: ghost (dashed, faded) at old slot → solid highlighted at new slot
 ┌ Moves ────────────────────────────────────────────────────────────────────────┐
 │ CS203-L1  Mon P3 CR-201 → Tue P4 CR-201   time   F07 unavailable Mon          │
 │ CS204-L2  Tue P2 CR-102 → Tue P2 CR-103   room   CR-102 closed (water leak)   │
 └───────────────────────────────────────────────────────────────────────────────┘
 Comment [                         ]          [Reject]  [Approve & apply]
```

- **Inbox:** tabs Changes / Bookings. Each item card shows the summary line, requester and age.
- **Detail:** summary banner, **Before / After / Overlay** toggle on the same `TimetableGrid` (overlay = ghost + arrow, animated), a moves table (session, from, to, type, reason), affected groups and faculty chips (click to switch the grid view).
- **Approve** is disabled with tooltip "You can't approve your own request" when the requester is the current user. It shows `STALE_VERSION` as "The timetable changed since this proposal. Re-propose."
- **Infeasible proposals:** red banner "No valid fix", followed by the **conflict report**: per session, the blocking constraints with counts, plus a "Try instead" suggestion (e.g. "allow 2 room-only moves" / "relax: Friday P9"). With C11, a small conflict graph.

### 5.9 Changes (`/changes`, `/changes/new`)

- **New change tabs:** Faculty leave · Room closure · Add session · Remove session · **Upload change file** (drag-and-drop JSON → Zod errors shown inline per field). All produce the starter-pack `changes[]`.
- **Propose** → loading state "Finding the smallest fix…" → result opens the approval detail view (read-only for non-admins).
- **List:** status chips (pending, approved, applied, rejected, infeasible), requester, moved count.

### 5.10 AI assistant (`/assistant`), faculty-first

- Chat layout with suggestions: "Move my Friday 3 PM lecture to Thursday morning", "I'm unavailable next Monday", "When is CS-LAB-1 free on Wednesday?", "Why is CS202 at 8 AM?".
- Assistant replies render text **plus option cards**: each card shows the proposed slot, a mini diff ("0 other sessions move"), soft impact, and a **"✓ Verified by constraint engine"** badge. Buttons: *Submit as change request* / *Explain*.
- Unavailable answers render as a reasons list (rule chips: H2 faculty busy, H3 CSE-2 busy …) and nearest alternatives.
- Typing indicator, error bubble with retry, and AI-off banner ("Use Changes → New instead").

### 5.11 Exams (`/exams`)

- Grid: 6 day columns (MON–SAT) × 2 rows (AM 09:30–11:30, PM 14:00–16:00). Each cell lists exam cards (course ids, groups, size, rooms with seat split "AUD 250 + LH-1 100 + LH-2 10").
- Group filter. Per-group check line "✓ max one exam per day". Phone: day tabs.

### 5.12 Admin (`/admin`), tabbed

| Tab | Content |
|---|---|
| **Data** | Dataset card (id, counts, loaded at). "Load bundled dataset" / upload `cit_public.json` (Zod errors inline). **Reset demo data** (danger zone, confirm dialog, progress steps). |
| **Generate** | Seed + time budget inputs, **Generate timetable**, **Generate exams**, **Run Spectra decisions**. Live progress (C2: line chart of hard → 0, soft ↓, iteration count). Version list with Activate. |
| **Validate** | Report styled like `validator.py`: hard by rule (H1–H14, B, E) with expandable details, soft S1–S6 table, booking score, alternatives, inversions, exam penalty, stability (when a baseline exists). |
| **Export** | Download `schedule.json` and `schedule_after.json` (disabled with a reason if there are hard violations). Shows the last export time and hash. |
| **Settings** | Priority order (drag list, "Reset to dataset order", with a warning that judging uses the dataset order) · LLM enabled toggle · reference date for "today/kal" · team name. |

---

## 6. Component inventory (`src/components/`)

| Component | Key props | Used in |
|---|---|---|
| `TimetableGrid` | `cells: TimetableCell[]`, `week: "regular" \| "spectra" \| "exam"`, `mode: "view" \| "diff" \| "edit"`, `ghosts?`, `onCellClick` | Timetable, Approvals, Dashboard mini, DnD editor |
| `SessionCard` | `session`, `assignment`, `variant: "full" \| "compact" \| "ghost"`, `override?` | Grid, lists |
| `AgendaList` | same as the grid, for phones | Timetable (mobile) |
| `DiffSummary` · `MovesTable` | `ChangeRequest` | Approvals |
| `ConflictReport` | `conflicts[]` | Approvals, Changes, Assistant |
| `RoomTimeline` | `rooms`, `items` (sessions + bookings), `days`, `periods` | Spectra, Find a room |
| `KpiCard` | `label`, `value`, `tone`, `href` | Dashboard, Spectra |
| `StatusBadge` · `CategoryChip` · `RuleChip` · `KindChip` (`src/components/semantic/`, mapping in `src/config/semantics.ts`) | enum values from contracts | everywhere |
| `ReasonText` | `reason`, `reason_code`, `onExplain` | Bookings, Spectra |
| `NLBookingInput` | `onParsed(draft)` (mic optional) | New booking |
| `BookingDraftForm` | `defaultValues: BookingDraft`, `assumptions`, `followUp` | New booking |
| `LiveCheckPanel` | `draft` (debounced) | New booking, manual placement |
| `ApprovalCard` | `item`, `canApprove`, `selfRequest` | Approvals inbox |
| `UtilizationHeatmap` | `matrix[room][day][period]` | Dashboard, Admin |
| `ValidatorReport` | `ValidatorReport` | Admin |
| `EntityPicker` | `kind`, `value`, `onChange` | Timetable, filters |
| `CommandPalette` | — (loads index lazily) | Global |
| `EmptyState` · `ErrorState` · `SkeletonGrid` | `title`, `cta?`, `onRetry?` | everywhere |
| `ChatThread` · `OptionCard` | assistant messages, verified options | Assistant |

All prop types import from `@/lib/contracts`. **No component defines its own copy of a data shape.**

---

## 7. Loading, empty and error states (explicitly judged)

| State | Pattern | Example copy |
|---|---|---|
| Loading (page) | Route-level `loading.tsx` with a skeleton of the real layout (grid skeleton, KPI skeletons) | — |
| Loading (action) | Button spinner + disabled. Long jobs get a progress card. | "Generating… hard 12 → 0" |
| Empty | Illustration-free card: icon, one sentence, one CTA | "No pending approvals. You're all caught up." |
| Empty (no data yet) | Role-aware CTA | Admin: "No timetable yet. **Generate**". Others: "The admin hasn't generated a timetable yet." |
| Error (fetch) | `error.tsx` boundary per route + inline `ErrorState` with **Retry** | "Couldn't load the timetable. Retry" |
| Error (validation) | Inline field errors from Zod issues, plus a summary at the top of the form | "Attendance must be a positive number" |
| Error (constraint) | `RuleChip` list with plain-English detail and suggested fixes | "H4: LH-1 is used by MA101 on Mon P2" |
| AI down | Non-blocking banner + form still works | "AI is unavailable right now. Fill the form below." |
| Offline / 500 | Toast + retry. Mutations are not retried silently. | — |
| Not allowed | 403 page with a link back to the dashboard | "Only the Dean's office can approve timetable changes." |

---

## 8. Responsive strategy (360 px → 1440 px+)

| Breakpoint | Layout |
|---|---|
| `< 640` phone | Bottom tab bar (Dashboard, Timetable, Rooms, Approvals — or Bookings for roles without approvals — and More). Timetable = day tabs + agenda. Tables → stacked cards. Drawers → full-height sheets. Room timeline scrolls horizontally with a sticky first column. |
| `640–1024` tablet | Collapsible sidebar (icons). Grid with compact cards (code + room only). |
| `≥ 1024` laptop | Full sidebar, full grid, side panels (live check, drawer) inline |

Test on 360×740 (Android), 390×844 (iPhone), 768×1024, 1366×768 (typical judge laptop) and 1920×1080.

---

## 9. Data fetching and state

- **Typed client** `src/lib/api-client.ts`: `apiGet(path, Schema)`, `apiPost(path, body, Schema)`, `apiPatch`, `apiDelete` unwrap the `{ ok, data | error }` envelope and throw `ApiClientError` (code from [architecture.md §4.5](./architecture.md#45-api-envelope-and-error-codes), or `NETWORK_ERROR` / `BAD_RESPONSE`).
- **Reads:** RSC pages fetch initial data on the server (fast first paint, no spinner on navigation). Client components hydrate into TanStack Query with `initialData`.
- **Query keys:** `["timetable", view, id, week]`, `["bookings", filters]`, `["changes", status]`, `["dashboard"]`, `["spectra"]`, `["exams"]`, `["rooms", filters]`.
- **Mutations invalidate:** approve change → `timetable`, `changes`, `dashboard`. Submit booking → `bookings`, `spectra`, `rooms`, `dashboard`. Generate → everything.
- **URL state (nuqs):** view, id, week, filters. Every screen is shareable and back-button friendly.
- **Mock-first development:** `src/lib/fixtures/` builds view models from `data/cit_public.json` plus a placeholder assignment. `NEXT_PUBLIC_USE_FIXTURES=true` makes the client resolve from fixtures, so frontend work starts at H1 without waiting for the solver.
- **Engine in the browser (C3):** `src/workers/engine.worker.ts` imports `@/lib/engine/checker` (pure TS). The drag-and-drop editor validates each hover target in < 5 ms and paints invalid cells with the blocking rule. The server re-checks on submit.

---

## 10. Wow UI (pick by time left; see [backend.md §2.3](./backend.md#23-difficulty--wow-quadrant))

| Feature | Effort | Moment in the video |
|---|:-:|---|
| Live solver progress (SSE): counter and sparkline of hard → 0, soft ↓ | 1.5 h | Opening "Generate" shot |
| Diff ghost overlay with animated arrows | 1 h | Rescheduling approval |
| Drag-and-drop manual scheduling with live validation (green/red cells + rule tooltip) | 3 h | "A conflict being blocked" |
| Voice input (en-IN / hi-IN) for bookings | 0.5 h | Hinglish request spoken aloud |
| ⌘K command palette | 1 h | Usability |
| Print stylesheet + ICS export of any timetable | 1 h | Polish |

---

## 11. Frontend 24-hour plan (owner C; B helps on forms after H14)

| Hours | Tasks | Done when |
|---|---|---|
| 0–1 | *(team)* scaffold, Tailwind + shadcn init, contracts | App deploys to Vercel |
| 1–5 | App shell (sidebar, topbar, bottom tabs), theme tokens, login with demo cards, `TimetableGrid` + `SessionCard` on fixtures, `format.ts` | Grid renders Y1-A from fixtures on phone and laptop |
| 5–10 | Timetable explorer (picker, week toggle, drawer, agenda view), dashboard KPIs + empty/error states, wire to real `/api/timetable` | Real generated timetable visible by group, faculty and room |
| 10–14 | New booking (NL tab, draft form, assumption chips, follow-up card, live check), My bookings, Find a room, Spectra board table | Hinglish request → submitted booking on screen. AI-off path works. |
| 14–18 | Approvals inbox + detail (diff, moves, approve guard), Changes (forms + upload), Assistant chat + option cards, Exams grid, Admin tabs | Full disruption flow clickable end to end |
| 18–21 | Wow picks (SSE progress, diff overlay, voice, ⌘K), room timeline, heatmap, mobile pass, a11y pass | QA checklist below passes |
| 21–23 | README screenshots, record video (script in [architecture.md §12.7](./architecture.md#127-five-minute-video-script-covers-every-item-the-pdf-asks-for)) | Video uploaded |
| 23–24 | *(team)* incognito run-through on the live link | Submitted |

### Pre-submission UI QA checklist

- [ ] Judge path from the README alone: login as Admin → **find a room** → **read a timetable** → **approve a change**, each in ≤ 3 clicks
- [ ] All 4 demo cards log in on the **deployed** link. Logout works.
- [ ] Every page has skeleton, empty and error states (simulate with the network throttled/offline)
- [ ] 360 px: no horizontal page scroll (except the intended timeline), tap targets ≥ 40 px
- [ ] Dark mode: no unreadable text, chips keep contrast
- [ ] Booking works with `LLM_ENABLED=false`
- [ ] Self-approval button is disabled with an explanation
- [ ] Export is disabled with a reason when there are hard violations
- [ ] No console errors. Lighthouse a11y ≥ 90 and performance ≥ 80 on `/dashboard` and `/timetable`.
- [ ] Favicon, page titles (`Timetables · CIT Scheduler`), 404 page
