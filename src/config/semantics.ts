/**
 * One place that maps every domain value to its label, icon and colour classes
 * (docs/frontend.md §3.2). Colour is never the only signal: every chip renders
 * the icon and the label (or a visible code) alongside the tokens.
 *
 * Class strings use the semantic tokens from globals.css:
 * `border-<name>/40 bg-<name>-subtle text-<name>-foreground`.
 */
import {
  ArrowLeftRight,
  Ban,
  BookOpen,
  Building,
  CheckCheck,
  CircleCheck,
  CircleX,
  Drama,
  FilePen,
  FlaskConical,
  Gavel,
  Hourglass,
  Landmark,
  Layers,
  Loader,
  MessagesSquare,
  Mic,
  NotebookPen,
  OctagonAlert,
  OctagonX,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type {
  Category,
  ChangeStatus,
  DecisionStatus,
  RequestState,
  SessionKind,
} from "@/lib/contracts/enums";

export type SemanticMeta = {
  label: string;
  icon: LucideIcon;
  /** Border, background and text classes for a chip. */
  className: string;
  /** Extra classes for the icon (e.g. a spinner). */
  iconClassName?: string;
};

const tone = {
  lecture:
    "border-kind-lecture/40 bg-kind-lecture-subtle text-kind-lecture-foreground",
  tutorial:
    "border-kind-tutorial/40 bg-kind-tutorial-subtle text-kind-tutorial-foreground",
  lab: "border-kind-lab/40 bg-kind-lab-subtle text-kind-lab-foreground",
  basket:
    "border-kind-basket/40 bg-kind-basket-subtle text-kind-basket-foreground",
  approved:
    "border-status-approved/40 bg-status-approved-subtle text-status-approved-foreground",
  alternative:
    "border-status-alternative/40 bg-status-alternative-subtle text-status-alternative-foreground",
  rejected:
    "border-status-rejected/40 bg-status-rejected-subtle text-status-rejected-foreground",
  pending:
    "border-status-pending/40 bg-status-pending-subtle text-status-pending-foreground",
  cancelled:
    "border-status-cancelled/40 bg-status-cancelled-subtle text-status-cancelled-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
  hard: "border-hard/40 bg-hard-subtle text-hard-foreground",
  soft: "border-soft/40 bg-soft-subtle text-soft-foreground",
} as const;

// ------------------------------------------------------------------ sessions

/** Session kinds plus the elective basket, which the grid renders as its own kind. */
export type DisplayKind = SessionKind | "basket";

export const KIND_META: Record<
  DisplayKind,
  SemanticMeta & {
    /** Grid shorthand: L, T, P (practical), OEB. */ code: string;
  }
> = {
  lecture: {
    label: "Lecture",
    code: "L",
    icon: BookOpen,
    className: tone.lecture,
  },
  tutorial: {
    label: "Tutorial",
    code: "T",
    icon: MessagesSquare,
    className: tone.tutorial,
  },
  lab: { label: "Lab", code: "P", icon: FlaskConical, className: tone.lab },
  basket: {
    label: "Elective basket",
    code: "OEB",
    icon: Layers,
    className: tone.basket,
  },
};

// ------------------------------------------------------------------ statuses

export const DECISION_STATUS_META: Record<DecisionStatus, SemanticMeta> = {
  approved: { label: "Approved", icon: CircleCheck, className: tone.approved },
  alternative_offered: {
    label: "Alternative offered",
    icon: ArrowLeftRight,
    className: tone.alternative,
  },
  rejected: { label: "Rejected", icon: CircleX, className: tone.rejected },
};

export const REQUEST_STATE_META: Record<RequestState, SemanticMeta> = {
  draft: { label: "Draft", icon: FilePen, className: tone.neutral },
  submitted: { label: "Submitted", icon: Send, className: tone.pending },
  pending_approval: {
    label: "Awaiting approval",
    icon: Hourglass,
    className: tone.pending,
  },
  decided: { label: "Decided", icon: Gavel, className: tone.neutral },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    className: `${tone.cancelled} line-through`,
  },
};

export const CHANGE_STATUS_META: Record<ChangeStatus, SemanticMeta> = {
  proposing: {
    label: "Finding a fix…",
    icon: Loader,
    className: tone.pending,
    iconClassName: "motion-safe:animate-spin",
  },
  pending: {
    label: "Pending approval",
    icon: Hourglass,
    className: tone.pending,
  },
  approved: { label: "Approved", icon: CircleCheck, className: tone.approved },
  rejected: { label: "Rejected", icon: CircleX, className: tone.rejected },
  infeasible: { label: "No valid fix", icon: OctagonX, className: tone.hard },
  applied: { label: "Applied", icon: CheckCheck, className: tone.approved },
};

/** Any status the UI shows in a `StatusBadge`. Shared values mean the same thing everywhere. */
export type StatusValue = DecisionStatus | RequestState | ChangeStatus;

const STATUS_META: Record<StatusValue, SemanticMeta> = {
  ...REQUEST_STATE_META,
  ...CHANGE_STATUS_META,
  ...DECISION_STATUS_META,
};

export function getStatusMeta(status: StatusValue): SemanticMeta {
  return STATUS_META[status];
}

// ---------------------------------------------------------------- categories

/** Priority categories, coloured per docs/frontend.md §3.2. */
export const CATEGORY_META: Record<Category, SemanticMeta> = {
  exam: {
    label: "Exam",
    icon: NotebookPen,
    className: "border-cat-exam/40 bg-cat-exam-subtle text-cat-exam-foreground",
  },
  regular_session: {
    label: "Regular class",
    icon: BookOpen,
    className:
      "border-cat-regular/40 bg-cat-regular-subtle text-cat-regular-foreground",
  },
  institute_event: {
    label: "Institute event",
    icon: Landmark,
    className:
      "border-cat-institute/40 bg-cat-institute-subtle text-cat-institute-foreground",
  },
  guest_lecture: {
    label: "Guest lecture",
    icon: Mic,
    className:
      "border-cat-guest/40 bg-cat-guest-subtle text-cat-guest-foreground",
  },
  department_event: {
    label: "Department event",
    icon: Building,
    className:
      "border-cat-department/40 bg-cat-department-subtle text-cat-department-foreground",
  },
  club_event: {
    label: "Club event",
    icon: Drama,
    className: "border-cat-club/40 bg-cat-club-subtle text-cat-club-foreground",
  },
};

// --------------------------------------------------------------------- rules

export type RuleSeverity = "hard" | "soft";

export const RULE_SEVERITY_META: Record<RuleSeverity, SemanticMeta> = {
  hard: { label: "Hard constraint", icon: OctagonAlert, className: tone.hard },
  soft: { label: "Soft penalty", icon: TriangleAlert, className: tone.soft },
};

/**
 * `S1`–`S6` are soft penalties; `H*` (timetable), `B*` (bookings) and `E*` (exams)
 * are hard. Unknown prefixes are treated as hard so they are never understated.
 */
export function getRuleSeverity(code: string): RuleSeverity {
  return code.trim().toUpperCase().startsWith("S") ? "soft" : "hard";
}
