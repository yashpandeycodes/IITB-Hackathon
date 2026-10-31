import { ok, withHandler } from "@/lib/api";
import { requireRole, requireScheduleRunQuota } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { runSpectra } from "@/lib/services/spectra";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin: re-decide every Week-7 request against the active timetable and replace the stored
 * decisions and overrides. `404 NOT_FOUND` without an active timetable, `409 CONFLICT` while
 * another run holds the lock, `429 RATE_LIMITED` after too many runs.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  requireScheduleRunQuota(request, user);
  return ok(await runSpectra(await getDb(), { actor: user.id }));
});
