"use client";

/**
 * Small building blocks shared by the change-request screens: form fields, day / period
 * pickers, issue lists and the status / kind badges.
 */
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  OctagonAlert,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { ChangeKind, ChangeStatus } from "@/lib/contracts";
import { cn } from "@/lib/utils";

import type { IssueLine } from "./api-errors";
import { formatPeriodList } from "./change-format";

export const CARD_CLASS = "rounded-3xl border border-white/10 bg-[#0B1220]";

export const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-[#101A2B] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#66E3F0]/50 disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[11px] font-bold tracking-wider text-[#98A6BB] uppercase"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-[#98A6BB]/80">{hint}</p> : null}
    </div>
  );
}

export function ChipToggle({
  selected,
  onClick,
  children,
  disabled,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-[#66E3F0]/60 bg-[#66E3F0]/15 text-[#66E3F0]"
          : "border-white/10 bg-[#101A2B] text-[#98A6BB] hover:border-white/25",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function DayPicker({
  days,
  value,
  onChange,
}: {
  days: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const all = days.length > 0 && days.every((d) => value.includes(d));
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => (
        <ChipToggle
          key={d}
          selected={value.includes(d)}
          onClick={() =>
            onChange(days.filter((x) => toggle(value, d).includes(x)))
          }
        >
          {d}
        </ChipToggle>
      ))}
      <ChipToggle selected={all} onClick={() => onChange(all ? [] : [...days])}>
        All week
      </ChipToggle>
    </div>
  );
}

export function PeriodPicker({
  periods,
  value,
  onChange,
  lunchAfter,
}: {
  periods: readonly number[];
  value: readonly number[];
  onChange: (next: number[]) => void;
  /** Lunch sits after this period: used for the morning / afternoon presets. */
  lunchAfter: number;
}) {
  const sorted = (list: number[]) => [...list].sort((a, b) => a - b);
  const morning = periods.filter((p) => p <= lunchAfter);
  const afternoon = periods.filter((p) => p > lunchAfter);
  const presets: Array<{ label: string; list: number[] }> = [
    { label: "Whole day", list: [...periods] },
    { label: "Morning", list: morning },
    { label: "Afternoon", list: afternoon },
  ];
  const same = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {periods.map((p) => (
          <ChipToggle
            key={p}
            selected={value.includes(p)}
            onClick={() => onChange(sorted(toggle(value, p)))}
          >
            P{p}
          </ChipToggle>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets
          .filter((preset) => preset.list.length > 0)
          .map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(sorted(preset.list))}
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-[10px] font-bold transition-colors",
                same(value, preset.list)
                  ? "bg-[#8279FF]/25 text-[#c4c0ff]"
                  : "bg-white/5 text-[#98A6BB] hover:bg-white/10",
              )}
            >
              {preset.label}
            </button>
          ))}
        {value.length > 0 ? (
          <span className="font-mono text-[10px] text-[#98A6BB]">
            {formatPeriodList(value)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A list of problems returned by the API (or found in a file). */
export function IssueList({
  title,
  issues,
  tone = "error",
}: {
  title: string;
  issues: readonly IssueLine[];
  tone?: "error" | "warning";
}) {
  if (issues.length === 0) return null;
  const toneClass =
    tone === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("rounded-2xl border p-3 text-xs", toneClass)}
    >
      <div className="mb-1.5 font-mono font-bold">{title}</div>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 break-words">
            {issue.label ? (
              <span className="font-mono text-[11px] opacity-80">
                {issue.label}
              </span>
            ) : null}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-xs",
        tone === "info"
          ? "border-[#66E3F0]/25 bg-[#66E3F0]/5 text-[#c9f6fb]"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200",
      )}
    >
      {children}
    </div>
  );
}

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: LucideIcon }
> = {
  pending: {
    label: "Pending approval",
    className: "border-sky-500/30 bg-sky-500/15 text-sky-300",
    icon: Clock,
  },
  infeasible: {
    label: "No valid fix",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    icon: OctagonAlert,
  },
  applied: {
    label: "Applied",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    icon: XCircle,
  },
  withdrawn: {
    label: "Withdrawn",
    className: "border-slate-500/30 bg-slate-500/15 text-slate-300",
    icon: Undo2,
  },
};

/** Status of a change request; `withdrawn` for a request its own filer rejected. */
export function ChangeStatusBadge({
  status,
  withdrawn = false,
}: {
  status: ChangeStatus;
  withdrawn?: boolean;
}) {
  const meta =
    STATUS_META[status === "rejected" && withdrawn ? "withdrawn" : status] ??
    STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        meta.className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const KIND_LABELS: Record<ChangeKind, string> = {
  disruption: "Change",
  unavailability: "Unavailability",
  faculty_request: "Faculty request",
  manual_edit: "Manual placement",
};

export function ChangeKindChip({ kind }: { kind: ChangeKind }) {
  return (
    <span className="inline-flex items-center rounded border border-[#8279FF]/30 bg-[#8279FF]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap text-[#c4c0ff]">
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#101A2B] p-3">
      <div className="font-mono text-[10px] font-bold tracking-wider text-[#98A6BB] uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-lg font-black",
          tone === "good"
            ? "text-emerald-400"
            : tone === "bad"
              ? "text-rose-400"
              : "text-white",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] text-[#98A6BB]">{sub}</div>
      ) : null}
    </div>
  );
}

/** Optional note filed as the request's `description` (≤ 1000 characters). */
export function NoteField({
  id,
  value,
  onChange,
  placeholder = "Why is this change needed? (optional, shown to the approver)",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label="Note for the approver" htmlFor={id}>
      <textarea
        id={id}
        rows={2}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

/** Calendar days and teaching periods from the reference data (with safe fallbacks). */
export function calendarOptions(calendar: {
  days: readonly string[];
  periods: ReadonlyArray<{ id: number; teaching: boolean }>;
  lunch: { after_period: number };
}) {
  const days =
    calendar.days.length > 0
      ? [...calendar.days]
      : ["MON", "TUE", "WED", "THU", "FRI"];
  const teaching = calendar.periods.filter((p) => p.teaching).map((p) => p.id);
  return {
    days,
    periods: teaching.length > 0 ? teaching : [1, 2, 3, 4, 5, 6, 7, 8, 9],
    lunchAfter: calendar.lunch.after_period,
  };
}
