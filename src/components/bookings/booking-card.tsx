"use client";

import { ArrowRight, Bot, FileText, MapPin, Repeat, Users } from "lucide-react";
import Link from "next/link";

import { CategoryChip } from "@/components/semantic/badges";
import type { BookingView, CalendarPeriod, SessionUser } from "@/lib/contracts";

import { DecisionBadge, RequestStateBadge } from "./booking-badges";
import {
  approvalNeededText,
  canCancel,
  decisionSlot,
  formatWhen,
  slotLabel,
} from "./booking-utils";
import { CancelBookingButton } from "./cancel-booking-button";

/** Where a request came from: the plain-language parser, the form or the dataset. */
export function SourceTag({ view }: { view: BookingView }) {
  const { request } = view;
  if (request.source === "nl") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#66E3F0]/30 bg-[#66E3F0]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#66E3F0]">
        <Bot className="h-2.5 w-2.5" aria-hidden="true" />
        {request.ai_meta?.source === "rules"
          ? "Plain language (rules)"
          : "Plain language"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[#98A6BB]">
      <FileText className="h-2.5 w-2.5" aria-hidden="true" />
      {request.source === "dataset" ? "Dataset" : "Form"}
    </span>
  );
}

/** Approval status of a request in words (needed, granted or refused), or null. */
export function approvalLines(view: BookingView): string[] {
  const lines: string[] = [];
  const needed = approvalNeededText(view.approval);
  if (needed && view.request.state !== "cancelled") lines.push(needed);
  if (view.request.approval)
    lines.push(
      `Approved by ${view.request.approval.approved_by} on ${formatWhen(view.request.approval.approved_at)}`,
    );
  if (view.request.rejection)
    lines.push(
      `Rejected by ${view.request.rejection.rejected_by}${view.request.rejection.comment ? `: ${view.request.rejection.comment}` : ""}`,
    );
  return lines;
}

export type BookingCardProps = {
  view: BookingView;
  user: SessionUser;
  periods: readonly CalendarPeriod[];
  roomName: (id: string) => string;
  /** Show who asked (for the admin's "all requests" list). */
  showRequester?: boolean;
};

/** One request with its state, decision, slot, reason, approval and actions. */
export function BookingCard({
  view,
  user,
  periods,
  roomName,
  showRequester,
}: BookingCardProps) {
  const { request, decision } = view;
  const slot = decision ? decisionSlot(decision, periods) : null;
  const firstWindow = request.windows[0];
  const approval = approvalLines(view);
  const cancellable = canCancel(view, user);

  return (
    <article className="space-y-3 rounded-3xl border border-white/10 bg-[#0B1220] p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/bookings/${encodeURIComponent(request.id)}`}
            className="text-sm font-bold break-words text-white hover:text-[#66E3F0] sm:text-base"
          >
            {request.title || "Untitled request"}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#98A6BB]">
            <span className="font-bold text-[#cbd5e1]">{request.id}</span>
            <span aria-hidden="true">·</span>
            <span>{formatWhen(request.submitted_at)}</span>
            {showRequester ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{request.requester || request.role}</span>
              </>
            ) : null}
            <SourceTag view={view} />
            {request.series_id ? (
              <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5">
                <Repeat className="h-2.5 w-2.5" aria-hidden="true" />
                Series
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <RequestStateBadge state={request.state} />
          {request.state !== "cancelled" ? (
            <DecisionBadge status={decision?.status} />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-start gap-1.5 text-white">
            <MapPin
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#66E3F0]"
              aria-hidden="true"
            />
            {decision?.room_id && slot ? (
              <span>
                <span className="font-bold">
                  {decision.room_id} · {roomName(decision.room_id)}
                </span>
                <span className="block text-[#cbd5e1]">{slot}</span>
              </span>
            ) : (
              <span className="text-[#98A6BB]">
                {request.state === "cancelled"
                  ? "Cancelled: no room held"
                  : decision?.status === "rejected"
                    ? "No room given"
                    : "Not decided yet"}
                {firstWindow ? (
                  <span className="block">
                    Asked for{" "}
                    {slotLabel(
                      firstWindow.day,
                      firstWindow.from_period,
                      firstWindow.to_period,
                      periods,
                    )}
                    {request.requested_room
                      ? ` · ${request.requested_room}`
                      : ""}
                  </span>
                ) : null}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[#98A6BB]">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{request.attendance} people</span>
            <span aria-hidden="true">·</span>
            <span>
              {request.duration_periods} period
              {request.duration_periods === 1 ? "" : "s"}
            </span>
          </div>
          <div>
            {decision ? (
              <CategoryChip
                category={decision.effective_category}
                isCapped={decision.category_capped}
                originalClaim={request.requested_category}
              />
            ) : (
              <CategoryChip category={request.requested_category} />
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          {decision?.reason ? (
            <p className="text-xs leading-relaxed text-[#cbd5e1]">
              {decision.reason}
            </p>
          ) : request.state === "cancelled" ? (
            <p className="text-xs text-[#98A6BB]">
              This request was cancelled; its slot went back to other requests.
            </p>
          ) : (
            <p className="text-xs text-[#98A6BB]">
              No decision yet: the engine decides once a timetable is active.
            </p>
          )}
          {approval.map((line) => (
            <p key={line} className="font-mono text-[11px] text-amber-300">
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-3">
        {cancellable ? <CancelBookingButton requestId={request.id} /> : null}
        <Link
          href={`/bookings/${encodeURIComponent(request.id)}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs font-bold text-[#66E3F0] hover:bg-white/10"
        >
          Details
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
