/**
 * Applies a disruption (change file) to a dataset, ported from `apply_disruption` in
 * `validator.py`. The input is never mutated; the result is a deep copy.
 */
import type {
  Dataset,
  Day,
  Disruption,
  DisruptionChange,
  Faculty,
} from "@/lib/contracts";

import { pyStr } from "./py";

/** A change file that cannot be applied (unknown change type or faculty id). */
export class DisruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisruptionError";
  }
}

/**
 * Applies every change in order. Unavailability on a day the calendar does not have is dropped
 * (the validator stores it but no placement can ever match it). Throws `DisruptionError` for an
 * unknown change type, like the validator.
 */
export function applyDisruption(
  dataset: Dataset,
  disruption: Pick<Disruption, "changes"> | { changes?: readonly unknown[] },
): Dataset {
  const d = structuredClone(dataset);
  d.room_unavailability ??= [];
  const calendarDays = new Set<string>(d.calendar.days);
  const daysOf = (days: readonly string[]) =>
    days.filter((day): day is Day => calendarDays.has(day));

  const fac = new Map<string, Faculty>();
  for (const member of d.faculty) fac.set(member.id, member);

  for (const raw of disruption.changes ?? []) {
    const ch = raw as DisruptionChange;
    switch (ch.type) {
      case "faculty_unavailable": {
        const member = fac.get(ch.faculty_id);
        if (!member) {
          throw new DisruptionError(`Unknown faculty ${ch.faculty_id}`);
        }
        member.unavailable ??= [];
        for (const day of daysOf(ch.days)) {
          member.unavailable.push({
            day,
            periods: [...ch.periods],
            reason: ch.reason ?? "",
          });
        }
        break;
      }
      case "room_unavailable":
        for (const day of daysOf(ch.days)) {
          d.room_unavailability.push({
            room_id: ch.room_id,
            day,
            periods: [...ch.periods],
            reason: ch.reason ?? "",
          });
        }
        break;
      case "add_faculty": {
        const member = structuredClone(ch.faculty);
        d.faculty.push(member);
        fac.set(member.id, member);
        break;
      }
      case "add_session":
        d.sessions.push(structuredClone(ch.session));
        break;
      case "remove_session":
        d.sessions = d.sessions.filter((s) => s.id !== ch.session_id);
        break;
      default:
        throw new DisruptionError(
          `Unknown change type: ${pyStr((ch as { type?: unknown }).type)}`,
        );
    }
  }
  return d;
}
