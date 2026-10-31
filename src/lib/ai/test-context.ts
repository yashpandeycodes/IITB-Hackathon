/**
 * Test helper: the parse context for the bundled dataset (as the service builds it, plus group
 * sizes), with fest-week Monday as the reference date.
 */
import type { Dataset } from "@/lib/contracts";
import { getBundledDataset } from "@/lib/dataset";

import type { ParseContext } from "./types";

export const REFERENCE_DATE = "2027-02-08";

export function datasetContext(
  dataset: Dataset = getBundledDataset(),
  referenceDate = REFERENCE_DATE,
): ParseContext {
  return {
    datasetId: dataset.dataset_id,
    calendar: {
      days: dataset.calendar.days,
      periods: dataset.calendar.periods.map(({ id, start, end, teaching }) => ({
        id,
        start,
        end,
        teaching,
      })),
      lunch: {
        after_period: dataset.calendar.lunch.after_period,
        start: dataset.calendar.lunch.start,
        end: dataset.calendar.lunch.end,
      },
    },
    rooms: dataset.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      features: r.features,
      accessible: r.accessible,
      allowed_uses: r.allowed_uses,
    })),
    groups: dataset.student_groups.map((g) => ({
      id: g.id,
      name: g.name,
      year: g.year,
      department: g.department,
      size: g.size,
    })),
    referenceDate,
  };
}
