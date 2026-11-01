"use client";

/** One change request in the /changes list: who, what, the outcome, and Open / Withdraw. */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Undo2 } from "lucide-react";

import { ROLE_META } from "@/config/roles";
import type { ChangeRequest } from "@/lib/contracts";

import { formatTimestamp } from "./change-format";
import { CARD_CLASS, ChangeKindChip, ChangeStatusBadge } from "./change-ui";
import { ProposalSummaryLine } from "./proposal-view";

export function ChangeListItem({
  change,
  isMine,
  onWithdraw,
  withdrawing,
}: {
  change: ChangeRequest;
  isMine: boolean;
  /** Set when the user may withdraw this request (their own, pending or infeasible). */
  onWithdraw?: () => void;
  withdrawing?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const withdrawn =
    change.status === "rejected" && change.decided_by === change.requested_by;
  const role =
    ROLE_META[change.requested_by_role]?.label ?? change.requested_by_role;

  return (
    <article
      className={`${CARD_CLASS} flex flex-col justify-between gap-4 p-4 sm:p-5 md:flex-row md:items-center`}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-[#66E3F0]">
            {change.id}
          </span>
          <ChangeStatusBadge status={change.status} withdrawn={withdrawn} />
          <ChangeKindChip kind={change.kind} />
          <span className="font-mono text-[10px] text-[#98A6BB]">
            {isMine ? "You" : change.requested_by} · {role} ·{" "}
            {formatTimestamp(change.created_at)}
          </span>
        </div>
        <h3 className="text-sm font-bold break-words text-white sm:text-base">
          {change.title}
        </h3>
        {change.description ? (
          <p className="line-clamp-2 text-xs break-words text-[#98A6BB]">
            {change.description}
          </p>
        ) : null}
        <ProposalSummaryLine change={change} />
        {change.comment &&
        (change.status === "rejected" || change.status === "applied") ? (
          <p className="font-mono text-[11px] break-words text-[#98A6BB]">
            {change.status === "applied" ? "Approved" : "Decision"}:{" "}
            {change.comment}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onWithdraw ? (
          confirming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onWithdraw();
                  setConfirming(false);
                }}
                disabled={withdrawing}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 px-3 py-2 font-mono text-xs font-bold text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
              >
                {withdrawing ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Undo2 className="size-3.5" aria-hidden="true" />
                )}
                Confirm withdraw
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-[#98A6BB] hover:bg-white/10"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={withdrawing}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 font-mono text-xs font-bold text-[#98A6BB] transition-colors hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-50"
            >
              {withdrawing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="size-3.5" aria-hidden="true" />
              )}
              Withdraw
            </button>
          )
        ) : null}
        <Link
          href={`/approvals/${encodeURIComponent(change.id)}`}
          className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 font-mono text-xs font-bold text-white transition-colors hover:bg-white/20"
        >
          Open
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
