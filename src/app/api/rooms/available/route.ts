import { RoomAvailabilityQuerySchema } from "@/lib/contracts";
import { ok, parseSearchParams, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getRoomAvailability } from "@/lib/services/rooms";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: rooms matching the filters with what occupies them in Week 7,
 * `?day=THU&from_period=10&to_period=12&min_capacity=150&needs=stage,pa_system&types=auditorium&accessible=true`.
 * The viewer decides which live booking titles are shown (others' are "Booked").
 */
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  const query = parseSearchParams(request.nextUrl, RoomAvailabilityQuerySchema);
  return ok(await getRoomAvailability(await getDb(), query, user));
});
