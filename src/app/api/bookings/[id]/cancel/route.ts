import { notFound, ok, withHandler } from "@/lib/api";
import { requireBookingWriteQuota, requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { BOOKING_ID, cancelBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * The requester or an admin: cancel a booking request and re-decide the rest → `BookingView`
 * (cancelling twice returns the same view). `404` for an unknown id or a request the user may not
 * see, `403` for an approver who may see it, `409` before any dataset import, for a dataset
 * request or while another change holds the lock, `429` after too many booking writes.
 */
export const POST = withHandler(async (request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  if (!BOOKING_ID.test(id)) throw notFound("No booking request with that id.");
  requireBookingWriteQuota(request, user);
  return ok(await cancelBooking(await getDb(), user, id), {
    headers: NO_STORE,
  });
});
