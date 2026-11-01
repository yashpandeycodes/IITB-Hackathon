"use client";

import {
  ArrowRight,
  CheckCircle2,
  ListOrdered,
  Plus,
  Shuffle,
} from "lucide-react";
import Link from "next/link";

import type {
  CalendarPeriod,
  CreateBookingResult,
  SessionUser,
} from "@/lib/contracts";

import { DecisionBadge } from "./booking-badges";
import { BookingCard } from "./booking-card";
import { decisionSlot } from "./booking-utils";

type Slot = CreateBookingResult["bumped"][number]["before"];

function slotText(
  slot: Slot,
  periods: readonly CalendarPeriod[],
  roomName: (id: string) => string,
): string {
  const when = decisionSlot(slot, periods);
  if (!slot.room_id || !when) return "no room";
  return `${slot.room_id} (${roomName(slot.room_id)}), ${when}`;
}

export type BookingResultProps = {
  result: CreateBookingResult;
  user: SessionUser;
  periods: readonly CalendarPeriod[];
  roomName: (id: string) => string;
  onNewRequest: () => void;
};

/** What happened after submitting: each created request, earlier bookings it moved, totals. */
export function BookingResult({
  result,
  user,
  periods,
  roomName,
  onNewRequest,
}: BookingResultProps) {
  const { bookings, bumped, spectra } = result;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-3xl border border-emerald-500/30 bg-[#0B1220] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-bold text-white">
              Request submitted
              {bookings.length > 1
                ? ` (${bookings.length} days in a series)`
                : ""}
            </h2>
            <p className="font-mono text-xs text-[#98A6BB]">
              The engine re-decided every Week-7 request in priority order. Here
              is where yours landed.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNewRequest}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#66E3F0] px-3.5 py-2 font-mono text-xs font-bold text-[#070A12]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New request
          </button>
          <Link
            href="/bookings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 font-mono text-xs font-bold text-[#cbd5e1] hover:bg-white/10"
          >
            My requests
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {bookings.map((view) => (
        <BookingCard
          key={view.request.id}
          view={view}
          user={user}
          periods={periods}
          roomName={roomName}
        />
      ))}

      {bumped.length > 0 ? (
        <div className="space-y-2 rounded-3xl border border-amber-500/30 bg-[#0B1220] p-5">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-300 uppercase">
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            Earlier bookings moved by this request ({bumped.length})
          </div>
          <p className="font-mono text-[11px] text-[#98A6BB]">
            Your request outranked these, so the engine gave them another room
            or slot (or none). Their requesters see the new decision.
          </p>
          <ul className="space-y-2">
            {bumped.map((b) => (
              <li
                key={b.request_id}
                className="space-y-1 rounded-2xl border border-white/5 bg-[#070A12] p-3 font-mono text-xs text-[#cbd5e1]"
              >
                <div className="font-bold text-white">{b.request_id}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DecisionBadge status={b.before.status} />
                  <span>{slotText(b.before, periods, roomName)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ArrowRight
                    className="h-3 w-3 text-[#98A6BB]"
                    aria-label="now"
                  />
                  <DecisionBadge status={b.after.status} />
                  <span>{slotText(b.after, periods, roomName)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {spectra ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3 font-mono text-[11px] text-[#98A6BB]">
          <span className="inline-flex items-center gap-1.5 text-[#cbd5e1]">
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            Week 7 after this run:
          </span>
          <span className="text-emerald-400">{spectra.approved} approved</span>
          <span className="text-amber-400">
            {spectra.alternatives} alternatives
          </span>
          <span className="text-rose-400">{spectra.rejected} rejected</span>
          <span>{spectra.session_overrides} classes moved</span>
        </div>
      ) : (
        <p className="font-mono text-[11px] text-[#98A6BB]">
          No timetable is active yet, so the request is recorded as submitted
          and will be decided when one is.
        </p>
      )}
    </div>
  );
}
