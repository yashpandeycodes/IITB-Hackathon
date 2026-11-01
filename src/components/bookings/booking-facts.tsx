import type { ReactNode } from "react";

import type {
  BookingFacts,
  CalendarPeriod,
  Day,
  DecisionFacts,
} from "@/lib/contracts";

import { formatWhen, slotLabel } from "./booking-utils";

function isBookingFacts(facts: DecisionFacts): facts is BookingFacts {
  return "candidate_rooms" in facts;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <dt className="font-mono text-[11px] text-[#98A6BB] uppercase">
        {label}
      </dt>
      <dd className="text-xs break-words text-[#cbd5e1]">{children}</dd>
    </div>
  );
}

function blockedText(
  entry: BookingFacts["blocked_by"][number],
  periods: readonly CalendarPeriod[],
): string {
  const first = entry.periods[0];
  const last = entry.periods[entry.periods.length - 1];
  const when =
    first !== undefined && last !== undefined
      ? slotLabel(entry.day as Day, first, last, periods)
      : entry.day;
  switch (entry.kind) {
    case "booking":
      return `Booking ${entry.id} holds ${entry.room_id ?? "the room"}, ${when}`;
    case "session":
      return `Class ${entry.id} in ${entry.room_id ?? "a room"}, ${when}`;
    case "group":
      return `Group ${entry.id} has a compulsory class, ${when}`;
    case "unavailable":
      return `${entry.room_id ?? entry.id} is closed, ${when}`;
  }
}

/** A light reading of the engine's structured facts (what the explanation is phrased from). */
export function BookingFactsSummary({
  facts,
  periods,
  roomName,
}: {
  facts: DecisionFacts;
  periods: readonly CalendarPeriod[];
  roomName: (id: string) => string;
}) {
  if (!isBookingFacts(facts)) {
    return (
      <dl className="space-y-2">
        <Row label="Rejected by">{facts.rejected_by}</Row>
        <Row label="When">{formatWhen(facts.rejected_at)}</Row>
        {facts.comment ? <Row label="Comment">{facts.comment}</Row> : null}
      </dl>
    );
  }

  return (
    <dl className="space-y-2">
      <Row label="Needed">
        {facts.attendance} people, {facts.duration} period
        {facts.duration === 1 ? "" : "s"}
      </Row>
      {facts.requested_room ? (
        <Row label="Requested room">
          {facts.requested_room_known
            ? `${facts.requested_room} (${roomName(facts.requested_room)})`
            : `${facts.requested_room} doesn't exist${facts.room_suggestion ? `; closest is ${facts.room_suggestion}` : ""}`}
          {facts.requested_room_missing.length > 0
            ? `; lacks ${facts.requested_room_missing.join(", ")}`
            : ""}
        </Row>
      ) : null}
      <Row label="Rooms that fit">
        {facts.candidate_rooms.length > 0
          ? `${facts.candidate_rooms.length}: ${facts.candidate_rooms.join(", ")}`
          : "None fit the type, size and needs"}
        {facts.candidate_rooms.length === 0 && facts.largest_room
          ? ` (largest suitable is ${facts.largest_room.room_id}, ${facts.largest_room.capacity} seats)`
          : ""}
      </Row>
      {facts.blocked_by.length > 0 ? (
        <Row label="In the way">
          <ul className="list-disc space-y-0.5 pl-4">
            {facts.blocked_by.slice(0, 8).map((b, i) => (
              <li key={`${b.kind}-${b.id}-${i}`}>{blockedText(b, periods)}</li>
            ))}
            {facts.blocked_by.length > 8 ? (
              <li>and {facts.blocked_by.length - 8} more</li>
            ) : null}
          </ul>
        </Row>
      ) : null}
      {facts.displaced.length > 0 ? (
        <Row label="Classes moved">
          <ul className="list-disc space-y-0.5 pl-4">
            {facts.displaced.map((d) => (
              <li key={d.session_id}>
                {d.session_id}: {d.from.room_id} {d.from.day} P
                {d.from.start_period} → {d.to.room_id} {d.to.day} P
                {d.to.start_period} (Week 7 only)
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
      {facts.cancelled ? (
        <Row label="Cancelled">
          By {facts.cancelled.by}, {formatWhen(facts.cancelled.at)}
          {facts.cancelled.note ? `: ${facts.cancelled.note}` : ""}
        </Row>
      ) : null}
    </dl>
  );
}
