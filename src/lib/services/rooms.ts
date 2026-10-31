import "server-only";
import type { Db } from "mongodb";
import type {
  RoomAvailability,
  RoomAvailabilityQuery,
  RoomBusyKind,
} from "@/lib/contracts";
import {
  listRoomUnavailability,
  listRooms,
  listSessions,
  type RoomRecord,
} from "@/lib/db/repos/reference";
import { listSessionOverrides } from "@/lib/db/repos/session-overrides";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { applyOverrides, listHeldBookings } from "./timetable-view";

type BusyEntry = RoomAvailability["busy_with"][number];

/**
 * True when the room may be used for `query.use` (default `event`: only rooms whose
 * `allowed_uses` include it) and satisfies the capacity, type, feature and access filters.
 */
export function roomMatches(
  room: RoomRecord,
  query: RoomAvailabilityQuery,
): boolean {
  if (!room.allowed_uses.includes(query.use)) return false;
  if (query.min_capacity !== undefined && room.capacity < query.min_capacity) {
    return false;
  }
  if (query.types?.length && !query.types.includes(room.type)) return false;
  if (query.accessible === true && !room.accessible) return false;
  for (const need of query.needs ?? []) {
    const has =
      need === "accessible" ? room.accessible : room.features.includes(need);
    if (!has) return false;
  }
  return true;
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) =>
  a1 <= b2 && b1 <= a2;

const KIND_ORDER: Record<RoomBusyKind, number> = {
  unavailable: 0,
  session: 1,
  booking: 2,
};

/**
 * `GET /api/rooms/available`: every room that passes the filters (by default only rooms that
 * may host events), with what occupies it on `day` between `from_period` and `to_period`
 * (inclusive). This is the Week-7 picture: the active timetable with its session overrides
 * applied, the bookings decided against it that hold a room (approved or alternative offered)
 * and room unavailability. Free
 * rooms come first, smallest first.
 */
export async function getRoomAvailability(
  db: Db,
  query: RoomAvailabilityQuery,
): Promise<RoomAvailability[]> {
  const version = await getActiveTimetableVersion(db);
  const versionId = version?.id ?? null;
  const [rooms, sessions, overrides, held, unavailability] = await Promise.all([
    listRooms(db),
    listSessions(db, { includeRemoved: true }),
    listSessionOverrides(db, { timetable_version: versionId }),
    listHeldBookings(db, versionId),
    listRoomUnavailability(db, { day: query.day }),
  ]);
  const { day, from_period: from, to_period: to } = query;
  const busy = new Map<string, BusyEntry[]>();
  const add = (roomId: string, entry: BusyEntry) => {
    const list = busy.get(roomId) ?? [];
    if (
      !list.some(
        (e) =>
          e.kind === entry.kind && e.id === entry.id && e.label === entry.label,
      )
    ) {
      list.push(entry);
    }
    busy.set(roomId, list);
  };

  for (const entry of unavailability) {
    if (entry.periods.some((p) => p >= from && p <= to)) {
      add(entry.room_id, {
        kind: "unavailable",
        id: entry.room_id,
        label: entry.reason?.trim() || "Unavailable",
      });
    }
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const placement of applyOverrides(
    version?.assignments ?? [],
    overrides,
  )) {
    const session = sessionById.get(placement.session_id);
    if (!session || placement.day !== day) continue;
    const end = placement.start_period + session.duration - 1;
    if (!overlaps(placement.start_period, end, from, to)) continue;
    const moved = placement.displaced_by
      ? ` (moved for ${placement.displaced_by})`
      : "";
    add(placement.room_id, {
      kind: "session",
      id: session.id,
      label: `${session.course_id} ${session.kind} · ${session.groups.join(", ")}${moved}`,
    });
  }

  for (const { decision, request } of held) {
    if (decision.day !== day) continue;
    if (!overlaps(decision.start_period, decision.end_period, from, to))
      continue;
    add(decision.room_id, {
      kind: "booking",
      id: decision.request_id,
      label: request?.title || decision.request_id,
    });
  }

  return rooms
    .filter((room) => roomMatches(room, query))
    .map((room) => {
      const busyWith = (busy.get(room.id) ?? []).sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
      );
      return {
        room,
        availability: {
          room_id: room.id,
          free: busyWith.length === 0,
          busy_with: busyWith,
        },
      };
    })
    .sort(
      (a, b) =>
        Number(b.availability.free) - Number(a.availability.free) ||
        a.room.capacity - b.room.capacity ||
        a.room.id.localeCompare(b.room.id),
    )
    .map(({ availability }) => availability);
}
