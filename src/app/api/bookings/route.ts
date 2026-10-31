import { ok, parseJsonBody, parseSearchParams, withHandler } from "@/lib/api";
import {
  requireBookingWriteQuota,
  requireRole,
  requireUser,
} from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import {
  BookingListQuerySchema,
  CreateBookingRequestSchema,
} from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { createBooking, listBookings } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";
// A submission re-decides every Spectra request (well under a second, plus a short lock wait).
export const maxDuration = 60;

/** Booking drafts are small; anything bigger is not a draft. */
const MAX_BODY_BYTES = 16_384;

/**
 * Any signed-in user: `?scope=mine` (default) lists the user's own requests, `scope=all` every
 * request (admin only, `403` otherwise), `scope=approvals` the requests waiting for this user's
 * approval (never their own). Optional `state` filter. → `BookingView[]`.
 */
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  const query = parseSearchParams(request.nextUrl, BookingListQuerySchema);
  return ok(await listBookings(await getDb(), user, query), {
    headers: NO_STORE,
  });
});

/**
 * Admin, coordinator, faculty, club: submit a `CreateBookingRequest` (a complete draft) →
 * `201 CreateBookingResult` (one request per series day, with decisions when a timetable is
 * active, and the earlier decisions they bumped). `400 VALIDATION_ERROR` (unknown room, with a
 * suggestion; unknown group; a compulsory group the role may not name; a day off the calendar;
 * a duration no window fits). `409 CONFLICT` before any dataset import, past the per-user cap of
 * open requests (details `{limit, open}`), for class moves the official schedule can't show, or
 * while another change holds the lock past a short wait. `429 RATE_LIMITED` after too many
 * booking writes.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(
    request,
    "admin",
    "department_coordinator",
    "faculty",
    "club",
  );
  requireBookingWriteQuota(request, user);
  const body = await parseJsonBody(request, CreateBookingRequestSchema, {
    maxBytes: MAX_BODY_BYTES,
  });
  return ok(await createBooking(await getDb(), user, body), {
    status: 201,
    headers: NO_STORE,
  });
});
