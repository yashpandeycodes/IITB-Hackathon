import { notFound, ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireBookingWriteQuota, requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { BookingDecideRequestSchema } from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { BOOKING_ID, decideBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * An eligible approver (an admin, or the coordinator of the lab's department; class moves: an
 * admin), never the requester: `{decision: "approve" | "reject", comment?}` → `BookingView`.
 * `404` for an unknown id or a request the user may not see, `403` (role, other department, a
 * class move) / `403 SELF_APPROVAL`, `409` before any dataset import or unless it waits for
 * approval, `429` after too many booking writes.
 */
export const POST = withHandler(async (request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  if (!BOOKING_ID.test(id)) throw notFound("No booking request with that id.");
  requireBookingWriteQuota(request, user);
  const body = await parseJsonBody(request, BookingDecideRequestSchema, {
    maxBytes: 4_096,
  });
  return ok(await decideBooking(await getDb(), user, id, body), {
    headers: NO_STORE,
  });
});
