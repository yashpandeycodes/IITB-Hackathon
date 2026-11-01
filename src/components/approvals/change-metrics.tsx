"use client";

import type { ReactNode } from "react";

import type { ChangeRequest } from "@/lib/contracts";

import { signed, softBefore } from "./approval-utils";

function Tile({
  label,
  value,
  sub,
  tone = "text-white",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-4">
      <div className="font-mono text-[10px] tracking-wider text-[#98A6BB] uppercase">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-black ${tone}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-1 font-mono text-[11px] text-[#98A6BB]">{sub}</div>
      ) : null}
    </div>
  );
}

/** Sessions moved, hard violations, soft penalty before → after and stability vs the baseline. */
export function ChangeMetrics({ change }: { change: ChangeRequest }) {
  const infeasible = change.status === "infeasible";
  const added = change.diff.filter((d) => d.move === "added").length;
  const removed = change.diff.filter((d) => d.move === "removed").length;
  const before = softBefore(change);
  const after = change.soft_penalty?.total ?? null;
  const baseline = change.baseline_stability;
  const engine = change.engine;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Sessions moved"
          value={infeasible ? "—" : change.moved_count}
          sub={
            infeasible ? (
              "no valid fix"
            ) : (
              <>
                {change.time_changed} time · {change.room_only_changed} room
                only
                {added ? ` · +${added} added` : ""}
                {removed ? ` · ${removed} removed` : ""}
              </>
            )
          }
        />
        <Tile
          label="Hard violations"
          value={
            infeasible
              ? "—"
              : `${change.hard_violation_count}${change.hard_violation_count === 0 ? " ✓" : ""}`
          }
          tone={
            infeasible
              ? "text-rose-300"
              : change.hard_violation_count === 0
                ? "text-[#34d399]"
                : "text-rose-300"
          }
          sub={
            infeasible
              ? `${change.conflicts.length} session(s) can't be placed`
              : "re-checked by the validator port"
          }
        />
        <Tile
          label="Soft penalty"
          value={
            before === null || after === null ? "—" : `${before} → ${after}`
          }
          tone={
            change.soft_delta < 0
              ? "text-[#34d399]"
              : change.soft_delta > 0
                ? "text-[#fbbf24]"
                : "text-white"
          }
          sub={
            change.soft_penalty
              ? `${signed(change.soft_delta)} (lower is better)`
              : "not computed"
          }
        />
        {baseline ? (
          <Tile
            label="Vs schedule.json"
            value={baseline.sessions_moved}
            sub={`${baseline.time_changed} time · ${baseline.room_only_changed} room only (validator --baseline)`}
          />
        ) : (
          <Tile
            label="Found in"
            value={`${engine.ms} ms`}
            sub={`${engine.evictions} eviction${engine.evictions === 1 ? "" : "s"} · chain depth ${engine.depth}`}
          />
        )}
      </div>
      <p className="font-mono text-[10px] leading-relaxed text-[#98A6BB]">
        Rescheduler: {engine.algorithm} · {engine.broken} broken ·{" "}
        {engine.evictions} evictions · depth {engine.depth} · {engine.nodes}{" "}
        nodes · {engine.ms} ms ·{" "}
        {engine.stopped_by === "complete"
          ? "search complete"
          : `stopped by the ${engine.stopped_by} budget (best result kept)`}
        {change.soft_penalty
          ? ` · after: S1 ${change.soft_penalty.S1} · S2 ${change.soft_penalty.S2} · S3 ${change.soft_penalty.S3} · S4 ${change.soft_penalty.S4} · S5 ${change.soft_penalty.S5} · S6 ${change.soft_penalty.S6}`
          : ""}
      </p>
    </div>
  );
}
