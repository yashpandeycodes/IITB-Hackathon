"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";

import { apiGet } from "@/lib/api-client";
import {
  RoomAvailabilitySchema,
  type CalendarPeriod,
  type Need,
  type ReferenceRoom,
  type RoomType,
} from "@/lib/contracts";

import { errorText, slotLabel, type DraftWindowForm } from "./booking-utils";

function fits(
  room: ReferenceRoom,
  attendance: number | null,
  types: readonly RoomType[],
  needs: readonly Need[],
): string[] {
  const gaps: string[] = [];
  if (types.length > 0 && !types.includes(room.type as RoomType))
    gaps.push("not an accepted room type");
  if (attendance !== null && room.capacity < attendance)
    gaps.push(`seats ${room.capacity}`);
  const missing = needs.filter((n) =>
    n === "accessible" ? !room.accessible : !room.features.includes(n),
  );
  if (missing.length > 0) gaps.push(`no ${missing.join(", ")}`);
  return gaps;
}

export type VenueAuditProps = {
  firstWindow: DraftWindowForm | undefined;
  attendance: number | null;
  roomTypes: readonly RoomType[];
  needs: readonly Need[];
  requestedRoom: string | null;
  rooms: readonly ReferenceRoom[];
  periods: readonly CalendarPeriod[];
  durationPeriods: number | null;
  onUseRoom: (roomId: string) => void;
};

/**
 * Live Week-7 occupancy (`GET /api/rooms/available`) for the draft's first window: whether the
 * preferred room is free and which free rooms fit the draft. Advisory only; the engine decides.
 */
export function VenueAudit({
  firstWindow,
  attendance,
  roomTypes,
  needs,
  requestedRoom,
  rooms,
  periods,
  durationPeriods,
  onUseRoom,
}: VenueAuditProps) {
  const day = firstWindow?.day;
  const from = firstWindow?.from_period;
  const to = firstWindow?.to_period;

  const query = useQuery({
    queryKey: ["rooms", "available", "booking-check", day, from, to],
    queryFn: () =>
      apiGet(
        `/api/rooms/available?${new URLSearchParams({
          day: String(day),
          from_period: String(from),
          to_period: String(to),
        }).toString()}`,
        z.array(RoomAvailabilitySchema),
      ),
    enabled: Boolean(day && from && to && to >= from),
    staleTime: 15_000,
  });

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const freeFitting = useMemo(
    () =>
      (query.data ?? []).filter((a) => {
        const room = roomById.get(a.room_id);
        return (
          a.free &&
          (!room || fits(room, attendance, roomTypes, needs).length === 0)
        );
      }),
    [query.data, roomById, attendance, roomTypes, needs],
  );

  const requested = requestedRoom
    ? query.data?.find((a) => a.room_id === requestedRoom)
    : undefined;
  const requestedMeta = requestedRoom ? roomById.get(requestedRoom) : undefined;
  const requestedGaps = requestedMeta
    ? fits(requestedMeta, attendance, roomTypes, needs)
    : [];

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[#0B1220] p-5">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
        <span className="font-mono text-xs font-bold tracking-wider text-white uppercase">
          Live venue check
        </span>
        <span
          className={`h-2 w-2 rounded-full ${
            query.isFetching ? "animate-ping bg-amber-400" : "bg-[#10b981]"
          }`}
          aria-hidden="true"
        />
      </div>

      {!day || from === undefined || to === undefined ? (
        <p className="font-mono text-xs text-[#98A6BB]">
          Add a time window to see which rooms are free.
        </p>
      ) : (
        <>
          <p className="font-mono text-[11px] text-[#98A6BB]">
            {slotLabel(day, from, to, periods)} · Week 7. Advisory: the engine
            places your {durationPeriods ?? "?"}-period booking inside the
            window and decides by priority.
          </p>

          {query.isLoading ? (
            <div className="flex items-center gap-2 font-mono text-xs text-[#98A6BB]">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              Checking rooms…
            </div>
          ) : query.isError ? (
            <div className="space-y-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
              <p>{errorText(query.error, "Couldn't check rooms right now.")}</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="rounded-lg border border-rose-500/30 px-2 py-0.5 text-[11px] hover:bg-rose-500/20"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {requestedRoom ? (
                <div
                  className={`space-y-1 rounded-2xl border bg-[#101A2B] p-3.5 ${
                    requested?.free && requestedGaps.length === 0
                      ? "border-emerald-500/30"
                      : "border-amber-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-xs">
                    <span className="text-[#98A6BB]">Preferred room</span>
                    <span
                      className={`font-bold ${
                        requested?.free ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {!requested
                        ? "Not bookable for events"
                        : requested.free
                          ? "Free"
                          : "Busy"}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {requestedRoom}
                    {requestedMeta ? ` · ${requestedMeta.name}` : ""}
                  </div>
                  {requested && !requested.free ? (
                    <p className="text-xs text-[#cbd5e1]">
                      Held by{" "}
                      {requested.busy_with
                        .map(
                          (b) =>
                            `${b.label}${b.pending_approval ? " (awaiting approval)" : ""}`,
                        )
                        .join(", ")}
                    </p>
                  ) : null}
                  {requestedGaps.length > 0 ? (
                    <p className="text-xs text-amber-300">
                      Doesn&apos;t fit the draft: {requestedGaps.join("; ")}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div className="mb-2 font-mono text-[11px] text-[#98A6BB] uppercase">
                  Free rooms that fit ({freeFitting.length})
                </div>
                {freeFitting.length === 0 ? (
                  <p className="font-mono text-xs text-[#98A6BB]">
                    No room that fits is free for the whole window. The engine
                    may still find a shorter slot inside it, offer an
                    alternative, or explain why not.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {freeFitting.slice(0, 10).map((a) => {
                      const meta = roomById.get(a.room_id);
                      return (
                        <li
                          key={a.room_id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-[#070A12] p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
                              <span className="font-bold text-white">
                                {a.room_id}
                              </span>
                              <span className="text-[#cbd5e1]">
                                {meta?.name ?? ""}
                              </span>
                            </div>
                            {meta ? (
                              <div className="font-mono text-[10px] text-[#98A6BB]">
                                {meta.capacity} seats
                                {meta.features.length > 0
                                  ? ` · ${meta.features.join(", ")}`
                                  : ""}
                              </div>
                            ) : null}
                          </div>
                          {a.room_id === requestedRoom ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-emerald-400"
                              aria-label="Chosen"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onUseRoom(a.room_id)}
                              className="shrink-0 rounded-lg border border-[#66E3F0]/30 px-2 py-0.5 font-mono text-[10px] font-bold text-[#66E3F0] hover:bg-[#66E3F0]/10"
                            >
                              Prefer
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {(query.data ?? []).some((a) => !a.free) ? (
                <details className="font-mono text-[11px] text-[#98A6BB]">
                  <summary className="cursor-pointer hover:text-white">
                    Busy rooms (
                    {(query.data ?? []).filter((a) => !a.free).length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {(query.data ?? [])
                      .filter((a) => !a.free)
                      .map((a) => (
                        <li
                          key={a.room_id}
                          className="flex items-start gap-1.5"
                        >
                          <XCircle
                            className="mt-0.5 h-3 w-3 shrink-0 text-rose-400"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="text-[#cbd5e1]">{a.room_id}</span>
                            {": "}
                            {a.busy_with.map((b) => b.label).join(", ") ||
                              "occupied"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
