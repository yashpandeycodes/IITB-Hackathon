"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  MoveRight,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { CategoryChip } from "@/components/semantic/badges";
import { StatusBadge } from "@/components/semantic/status-badge";
import { decideBooking, isApiClientError } from "@/lib/api-client";
import type { BookingView } from "@/lib/contracts";
import { formatDay, formatPeriodRange } from "@/lib/format";

import {
  AFTER_BOOKING_KEYS,
  errorMessage,
  formatDateTime,
  timeAgo,
} from "./approval-utils";

type Decision = "approve" | "reject";

/** One booking waiting for this user's approval, with Approve / Reject and an optional comment. */
export function BookingApprovalCard({
  booking,
  roomName,
}: {
  booking: BookingView;
  roomName: (id: string) => string;
}) {
  const queryClient = useQueryClient();
  const { request, decision, approval } = booking;
  const [comment, setComment] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: (choice: Decision) =>
      decideBooking(request.id, {
        decision: choice,
        comment: comment.trim() || undefined,
      }),
    onSuccess: (view, choice) => {
      setInlineError(null);
      const slot = view.decision;
      const where =
        slot?.room_id && slot.day && slot.start_period && slot.end_period
          ? ` ${slot.room_id} ${formatDay(slot.day)} P${slot.start_period}–P${slot.end_period} is confirmed.`
          : "";
      if (choice === "approve") {
        toast.success(`Approved ${request.id}.${where}`);
      } else {
        toast.success(`Rejected ${request.id}. The slot is free again.`);
      }
      for (const key of AFTER_BOOKING_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    },
    onError: (error) => {
      const message = errorMessage(error);
      toast.error(message);
      if (isApiClientError(error)) {
        if (error.code === "SELF_APPROVAL") {
          setInlineError("You can't approve or reject your own request.");
        } else if (error.code === "FORBIDDEN") {
          setInlineError(
            "You aren't the approver for this booking (class moves need an admin; a lab needs its department's coordinator).",
          );
        } else if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
          setInlineError(message);
          void queryClient.invalidateQueries({ queryKey: ["bookings"] });
        } else {
          setInlineError(message);
        }
      } else {
        setInlineError(message);
      }
    },
  });

  const facts =
    decision?.facts && "displaced" in decision.facts ? decision.facts : null;
  const displaced = facts?.displaced ?? [];
  const isClassMove = approval.approver_role === "admin";
  const pending = decide.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-[#0B1220] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-black text-[#66E3F0]">
          {request.id}
        </span>
        <StatusBadge status={request.state} />
        {decision ? (
          <CategoryChip
            category={decision.effective_category}
            isCapped={decision.category_capped}
            originalClaim={request.requested_category}
          />
        ) : null}
        <span
          className="ml-auto font-mono text-[10px] text-[#98A6BB]"
          title={formatDateTime(request.submitted_at)}
        >
          {timeAgo(request.submitted_at)}
        </span>
      </div>

      <div>
        <h3 className="text-base font-bold break-words text-white">
          {request.title || "Untitled booking"}
        </h3>
        <p className="mt-0.5 text-xs text-[#98A6BB]">
          {request.requester || request.role}
          {request.department ? ` · ${request.department}` : ""} ·{" "}
          {request.attendance} people · {request.duration_periods} period
          {request.duration_periods === 1 ? "" : "s"}
          {request.needs.length ? ` · needs ${request.needs.join(", ")}` : ""}
        </p>
      </div>

      {/* The slot the engine proposes (held while it waits). */}
      <div className="rounded-2xl border border-white/10 bg-[#101A2B] p-3 font-mono text-xs">
        {decision && decision.status !== "rejected" && decision.day ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-white">
              {decision.room_id ? roomName(decision.room_id) : "—"}
            </span>
            <span className="text-[#66E3F0]">
              {formatDay(decision.day, "long")} P{decision.start_period}–P
              {decision.end_period}
            </span>
            {decision.start_period && decision.end_period ? (
              <span className="text-[#98A6BB]">
                ({formatPeriodRange(decision.start_period, decision.end_period)}
                )
              </span>
            ) : null}
            {decision.status === "alternative_offered" ? (
              <span className="text-amber-300">· alternative slot</span>
            ) : null}
          </div>
        ) : (
          <span className="text-[#98A6BB]">No slot proposed yet.</span>
        )}
        {decision?.reason ? (
          <p className="mt-1.5 font-sans text-[11px] leading-relaxed text-[#cbd5e1]">
            {decision.reason}
          </p>
        ) : null}
      </div>

      {/* Why this needs an approver. */}
      <div
        className={`rounded-2xl border p-3 text-xs ${
          isClassMove
            ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        }`}
      >
        <div className="flex items-center gap-1.5 font-mono font-bold">
          {isClassMove ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isClassMove
            ? "Moves classes for Week 7 — Admin approval"
            : `Uses a ${approval.department ?? "department"} lab — department coordinator approval`}
        </div>
        {displaced.length > 0 ? (
          <ul className="mt-2 space-y-1 font-mono text-[11px]">
            {displaced.map((move) => (
              <li
                key={move.session_id}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="font-bold text-white">{move.session_id}</span>
                <span className="line-through opacity-70">
                  {formatDay(move.from.day)} P{move.from.start_period}{" "}
                  {move.from.room_id}
                </span>
                <MoveRight className="h-3 w-3" aria-hidden="true" />
                <span className="font-bold">
                  {formatDay(move.to.day)} P{move.to.start_period}{" "}
                  {move.to.room_id}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="sr-only" htmlFor={`comment-${request.id}`}>
        Comment for {request.id}
      </label>
      <input
        id={`comment-${request.id}`}
        type="text"
        value={comment}
        maxLength={500}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional, shown to the requester)"
        className="w-full rounded-xl border border-white/10 bg-[#101A2B] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#66E3F0]"
      />

      {inlineError ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          {inlineError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide.mutate("reject")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && decide.variables === "reject" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide.mutate("approve")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#66E3F0] px-4 py-2 font-mono text-xs font-bold text-[#070A12] transition-colors hover:bg-[#4fd6e4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && decide.variables === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Approve
        </button>
      </div>
    </div>
  );
}
