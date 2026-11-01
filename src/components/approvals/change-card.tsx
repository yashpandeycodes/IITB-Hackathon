"use client";

import Link from "next/link";
import { ArrowRight, OctagonX, ShieldCheck } from "lucide-react";

import { StatusBadge } from "@/components/semantic/status-badge";
import type { ChangeRequest } from "@/lib/contracts";

import {
  CHANGE_KIND_LABEL,
  formatDateTime,
  roleLabel,
  signed,
  timeAgo,
} from "./approval-utils";

/** One change request in the approvals inbox: summary line, requester, age and the numbers. */
export function ChangeCard({
  change,
  canAct,
}: {
  change: ChangeRequest;
  /** The viewer may approve or reject it (an admin). */
  canAct: boolean;
}) {
  const infeasible = change.status === "infeasible";
  const added = change.diff.filter((d) => d.move === "added").length;
  const removed = change.diff.filter((d) => d.move === "removed").length;

  return (
    <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-[#0B1220] p-5 shadow-sm transition-all hover:border-[#8279FF]/40 sm:p-6 md:flex-row md:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-black text-[#66E3F0]">
            {change.id}
          </span>
          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/80">
            {CHANGE_KIND_LABEL[change.kind]}
          </span>
          <StatusBadge status={change.status} />
          <span
            className="font-mono text-[11px] text-[#98A6BB]"
            title={formatDateTime(change.created_at)}
          >
            · {timeAgo(change.created_at)}
          </span>
        </div>

        <h3 className="text-base font-bold break-words text-white sm:text-lg">
          {change.title || "Timetable change"}
        </h3>
        {change.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-[#cbd5e1]">
            {change.description}
          </p>
        ) : null}
        <p className="font-mono text-[11px] text-[#98A6BB]">
          Requested by {change.requested_by} (
          {roleLabel(change.requested_by_role)}) · built on{" "}
          {change.base_version}
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          {infeasible ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-rose-300">
              <OctagonX className="h-3 w-3" aria-hidden="true" />
              No valid fix · {change.conflicts.length} session
              {change.conflicts.length === 1 ? "" : "s"} can&apos;t be placed
            </span>
          ) : (
            <>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[11px] text-white">
                {change.moved_count} moved ({change.time_changed} time ·{" "}
                {change.room_only_changed} room only)
                {added ? ` · ${added} added` : ""}
                {removed ? ` · ${removed} removed` : ""}
              </span>
              <span className="rounded-full border border-[#10b981]/30 bg-[#10b981]/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#34d399]">
                {change.hard_violation_count} hard violations
                {change.hard_violation_count === 0 ? " ✓" : ""}
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] text-[#fbbf24]">
                Soft {signed(change.soft_delta)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <Link
          href={`/approvals/${encodeURIComponent(change.id)}`}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#8279FF] px-5 py-2.5 font-mono text-xs font-bold text-white shadow-lg shadow-[#8279FF]/20 transition-all hover:bg-[#7267f5]"
        >
          <span>{canAct ? "Review & decide" : "View diff"}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {!canAct && change.status === "pending" ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#98A6BB]">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            An admin approves this
          </span>
        ) : null}
      </div>
    </div>
  );
}
