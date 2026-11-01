"use client";

/**
 * The rescheduler's answer for a change (a preview or a stored request): stability counts,
 * the moves table, and the conflicting constraints when there is no valid fix.
 */
import {
  ArrowRight,
  CheckCircle2,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";

import { HardRuleChip } from "@/components/semantic/badges";
import { useReferenceData } from "@/hooks/use-reference-data";
import type {
  ChangeProposal,
  ChangeRequest,
  ConflictEntry,
  MoveDiff,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

import { formatDelta, formatSlot, ruleLabel } from "./change-format";
import { StatTile } from "./change-ui";

export type ProposalLike = Pick<
  ChangeProposal,
  | "feasible"
  | "title"
  | "warnings"
  | "diff"
  | "moved_count"
  | "time_changed"
  | "room_only_changed"
  | "soft_penalty"
  | "soft_delta"
  | "hard_violation_count"
  | "conflicts"
  | "baseline_stability"
  | "engine"
>;

export function proposalCounts(p: Pick<ProposalLike, "diff">) {
  let added = 0;
  let removed = 0;
  for (const d of p.diff) {
    if (d.move === "added") added++;
    else if (d.move === "removed") removed++;
  }
  return { added, removed };
}

/** Soft penalty of the base timetable and of the proposal (null when infeasible). */
export function softPenaltyChange(
  p: Pick<ProposalLike, "soft_penalty" | "soft_delta">,
): { before: number; after: number; delta: number } | null {
  if (!p.soft_penalty) return null;
  const after = p.soft_penalty.total;
  return { before: after - p.soft_delta, after, delta: p.soft_delta };
}

/** One line for list rows: "9 moved (0 time · 9 room only) · 1 added · 0 hard · soft 3 → 3". */
export function ProposalSummaryLine({
  change,
}: {
  change: Pick<
    ChangeRequest,
    | "status"
    | "diff"
    | "moved_count"
    | "time_changed"
    | "room_only_changed"
    | "hard_violation_count"
    | "soft_penalty"
    | "soft_delta"
    | "conflicts"
    | "feasible"
  >;
}) {
  if (!change.feasible || change.status === "infeasible") {
    const first = change.conflicts[0];
    return (
      <div className="space-y-0.5 font-mono text-[11px] text-amber-300">
        <div className="flex items-start gap-1.5">
          <OctagonAlert
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            {first ? first.summary : "No valid fix exists for this change."}
            {change.conflicts.length > 1
              ? ` (+${change.conflicts.length - 1} more session${change.conflicts.length > 2 ? "s" : ""})`
              : ""}
          </span>
        </div>
      </div>
    );
  }
  const { added, removed } = proposalCounts(change);
  const soft = softPenaltyChange(change);
  const parts = [
    `${change.moved_count} moved (${change.time_changed} time · ${change.room_only_changed} room only)`,
  ];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px]">
      <span className="text-white/90">{parts.join(" · ")}</span>
      <span
        className={cn(
          "font-bold",
          change.hard_violation_count === 0
            ? "text-emerald-400"
            : "text-rose-400",
        )}
      >
        {change.hard_violation_count} hard violations
        {change.hard_violation_count === 0 ? " ✓" : ""}
      </span>
      {soft ? (
        <span className="text-[#98A6BB]">
          soft {soft.before} → {soft.after}
        </span>
      ) : null}
    </div>
  );
}

const MOVE_META: Record<
  MoveDiff["move"],
  { label: string; className: string }
> = {
  room_only: {
    label: "Room only",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  time_only: {
    label: "Time",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  time_and_room: {
    label: "Time + room",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  },
  added: {
    label: "Added",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  removed: {
    label: "Removed",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
};

function MoveChip({ move }: { move: MoveDiff["move"] }) {
  const meta = MOVE_META[move];
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function causeText(d: MoveDiff): string {
  switch (d.cause) {
    case "broken":
      return d.rules.length > 0
        ? `Old slot breaks ${d.rules.join(", ")}`
        : "Old slot breaks a hard rule";
    case "evicted":
      return d.displaced_by
        ? `Moved to make room for ${d.displaced_by}`
        : "Moved to make room";
    case "requested":
      return "Requested placement";
    case "added":
      return "New session";
    case "removed":
      return "Session removed";
  }
}

export function MovesTable({ diff }: { diff: readonly MoveDiff[] }) {
  const { referenceData, courseName } = useReferenceData();
  const sessions = new Map(referenceData.sessions.map((s) => [s.id, s]));
  if (diff.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-[#98A6BB]">
        No session has to move: every class keeps its slot.
      </div>
    );
  }
  const courseOf = (id: string) => sessions.get(id)?.course_id ?? null;
  const durationOf = (id: string) => sessions.get(id)?.duration ?? 1;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-[#101A2B] font-mono text-[10px] tracking-wider text-[#98A6BB] uppercase">
              <th className="p-2.5">Session</th>
              <th className="p-2.5">From</th>
              <th className="p-2.5" aria-hidden="true" />
              <th className="p-2.5">To</th>
              <th className="p-2.5">Move</th>
              <th className="p-2.5">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {diff.map((d) => {
              const course = courseOf(d.session_id);
              return (
                <tr key={d.session_id} className="align-top">
                  <td className="p-2.5">
                    <div className="font-mono font-bold text-[#66E3F0]">
                      {d.session_id}
                    </div>
                    {course ? (
                      <div className="max-w-[14rem] truncate text-[11px] text-[#98A6BB]">
                        {course} · {courseName(course)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2.5 font-mono whitespace-nowrap text-white/80">
                    {formatSlot(d.from, durationOf(d.session_id))}
                  </td>
                  <td className="p-2.5 text-[#98A6BB]">
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </td>
                  <td className="p-2.5 font-mono font-bold whitespace-nowrap text-white">
                    {formatSlot(d.to, durationOf(d.session_id))}
                  </td>
                  <td className="p-2.5">
                    <MoveChip move={d.move} />
                  </td>
                  <td className="p-2.5">
                    <div className="font-mono text-[11px] text-white/90">
                      {causeText(d)}
                    </div>
                    <div className="text-[11px] text-[#98A6BB]">{d.reason}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {diff.map((d) => {
          const course = courseOf(d.session_id);
          return (
            <li
              key={d.session_id}
              className="space-y-1.5 rounded-2xl border border-white/10 bg-[#101A2B] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold text-[#66E3F0]">
                    {d.session_id}
                  </div>
                  {course ? (
                    <div className="truncate text-[11px] text-[#98A6BB]">
                      {courseName(course)}
                    </div>
                  ) : null}
                </div>
                <MoveChip move={d.move} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                <span className="text-white/70">
                  {formatSlot(d.from, durationOf(d.session_id))}
                </span>
                <ArrowRight
                  className="size-3 text-[#98A6BB]"
                  aria-hidden="true"
                />
                <span className="font-bold text-white">
                  {formatSlot(d.to, durationOf(d.session_id))}
                </span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">
                <span className="font-mono text-white/80">{causeText(d)}</span>
                {" · "}
                {d.reason}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ConflictList({
  conflicts,
}: {
  conflicts: readonly ConflictEntry[];
}) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        The rescheduler found no valid fix, but reported no specific conflict.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {conflicts.map((c) => (
        <li
          key={c.session_id}
          className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3"
        >
          <div className="flex items-start gap-2">
            <OctagonAlert
              className="mt-0.5 size-4 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold text-amber-300">
                {c.session_id}
              </div>
              <p className="text-xs text-white/90">{c.summary}</p>
            </div>
          </div>
          {c.contradictions.length > 0 ? (
            <ul className="ml-6 list-disc space-y-0.5 text-[11px] text-amber-100/90">
              {c.contradictions.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          ) : null}
          {c.blocking.length > 0 ? (
            <div className="ml-6 space-y-1">
              <div className="font-mono text-[10px] tracking-wider text-[#98A6BB] uppercase">
                Candidate slots ruled out by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.blocking.map((b, i) => (
                  <span
                    key={`${b.rule}-${i}`}
                    className="inline-flex flex-wrap items-center gap-1 text-[11px] text-white/80"
                  >
                    <HardRuleChip code={b.rule} label={ruleLabel(b.rule)} />
                    <span className="font-mono text-[#98A6BB]">
                      ×{b.count}
                      {b.detail ? ` · ${b.detail}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Stats, moves and conflicts of a proposal. */
export function ProposalView({
  proposal,
  baseVersion,
}: {
  proposal: ProposalLike;
  baseVersion?: string | null;
}) {
  const { added, removed } = proposalCounts(proposal);
  const soft = softPenaltyChange(proposal);
  const feasible = proposal.feasible;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        {feasible ? (
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <OctagonAlert
            className="mt-0.5 size-5 shrink-0 text-amber-400"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0">
          <div
            className={cn(
              "text-sm font-bold",
              feasible ? "text-emerald-300" : "text-amber-300",
            )}
          >
            {feasible
              ? "A valid fix exists"
              : "No valid fix: these constraints are in conflict"}
          </div>
          <div className="text-xs break-words text-white/90">
            {proposal.title}
          </div>
          {baseVersion ? (
            <div className="font-mono text-[10px] text-[#98A6BB]">
              Computed on {baseVersion}
            </div>
          ) : null}
        </div>
      </div>

      {proposal.warnings.length > 0 ? (
        <div className="space-y-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {proposal.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      {feasible ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label="Sessions moved"
              value={proposal.moved_count}
              sub={`${proposal.time_changed} time · ${proposal.room_only_changed} room only`}
            />
            <StatTile
              label="Added / removed"
              value={`${added} / ${removed}`}
              sub="not counted as moves"
            />
            <StatTile
              label="Hard violations"
              value={proposal.hard_violation_count}
              tone={proposal.hard_violation_count === 0 ? "good" : "bad"}
              sub="independent re-check"
            />
            <StatTile
              label="Soft penalty"
              value={soft ? `${soft.before} → ${soft.after}` : "—"}
              sub={soft ? `${formatDelta(soft.delta)} (lower is better)` : ""}
            />
          </div>
          {proposal.baseline_stability ? (
            <div className="font-mono text-[11px] text-[#98A6BB]">
              Against the baseline schedule.json:{" "}
              {proposal.baseline_stability.sessions_moved} moved (
              {proposal.baseline_stability.time_changed} time ·{" "}
              {proposal.baseline_stability.room_only_changed} room only)
            </div>
          ) : null}
          <MovesTable diff={proposal.diff} />
        </>
      ) : (
        <ConflictList conflicts={proposal.conflicts} />
      )}

      <div className="font-mono text-[10px] text-[#98A6BB]">
        {proposal.engine.algorithm} · {proposal.engine.ms} ms ·{" "}
        {proposal.engine.evictions} eviction
        {proposal.engine.evictions === 1 ? "" : "s"} · search{" "}
        {proposal.engine.stopped_by === "complete"
          ? "complete"
          : `stopped by the ${proposal.engine.stopped_by} budget`}
      </div>
    </div>
  );
}
