/**
 * Dashboard read model (`GET /api/dashboard`).
 */
import { z } from "zod";

import { Day, Role, TeachingPeriod } from "./enums";
import { SoftPenaltySummarySchema } from "./timetable";
import { BookingStatsSchema } from "./violation";

const Count = z.number().int().nonnegative();
const Fraction = z.number().min(0).max(1);

/**
 * `GET /api/dashboard` response (`data`). Every block is present; counts are zero and
 * version fields null before anything has been generated.
 *
 * - `timetable`: the active version's coverage and quality. `hard_violation_count` and
 *   `soft_penalty` come from the version document (null with no active version).
 * - `exams`: the active exam schedule's coverage (`penalty` null with no schedule).
 * - `bookings`: Spectra-week requests (drafts excluded), decisions per status (only those of the
 *   active timetable version, like `session_overrides`), requests still
 *   waiting for a decision (not cancelled, no decision), Week-7 session overrides, and the
 *   validator's booking score for the stored decisions (null before Spectra has run).
 * - `pending_approvals`: what this user may act on now. Admin: requests in
 *   `pending_approval` plus `pending` change requests. Coordinator: `pending_approval`
 *   requests for their department's labs. Never the user's own requests (no self-approval).
 *   Faculty and club: zero.
 * - `mine`: the user's own requests (created by them, or dataset requests whose requester is
 *   their club or faculty name, also matched by a faculty id suffix such as "(F12)"), `booking_requests_open` being those still `submitted` or
 *   `pending_approval`; their change requests, `change_requests_pending` being `proposing` or
 *   `pending`; and `sessions_*` (their sessions, and how many the active timetable places) for a
 *   faculty login only, null otherwise.
 * - `utilisation`: regular-week room use from the active timetable over the calendar's
 *   teaching periods. `busy[d][p]` is 1 when room is in use on `days[d]` at `periods[p]`
 *   (0 otherwise); `fraction` is the room's busy share and `overall` the share over all rooms.
 */
export const DashboardSchema = z.strictObject({
  role: Role,
  dataset_id: z.string().min(1),
  timetable: z.strictObject({
    version_id: z.string().nullable(),
    sessions_total: Count,
    sessions_scheduled: Count,
    hard_violation_count: Count.nullable(),
    soft_penalty: SoftPenaltySummarySchema.nullable(),
  }),
  exams: z.strictObject({
    schedule_id: z.string().nullable(),
    exams_total: Count,
    exams_scheduled: Count,
    penalty: Count.nullable(),
  }),
  bookings: z.strictObject({
    requests_total: Count,
    cancelled: Count,
    undecided: Count,
    by_status: z.strictObject({
      approved: Count,
      alternative_offered: Count,
      rejected: Count,
    }),
    session_overrides: Count,
    booking_score: BookingStatsSchema.shape.booking_score.nullable(),
    booking_score_max_if_all_approved:
      BookingStatsSchema.shape.booking_score_max_if_all_approved.nullable(),
  }),
  pending_approvals: z.strictObject({
    booking_requests: Count,
    change_requests: Count,
    total: Count,
  }),
  mine: z.strictObject({
    booking_requests: Count,
    booking_requests_open: Count,
    change_requests: Count,
    change_requests_pending: Count,
    sessions_total: Count.nullable(),
    sessions_scheduled: Count.nullable(),
  }),
  utilisation: z.strictObject({
    days: z.array(Day),
    periods: z.array(TeachingPeriod),
    rooms: z.array(
      z.strictObject({
        room_id: z.string().min(1),
        busy: z.array(z.array(Fraction)),
        fraction: Fraction,
      }),
    ),
    overall: Fraction,
  }),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
