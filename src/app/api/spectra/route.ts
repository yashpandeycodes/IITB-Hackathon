import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { getSpectraState } from "@/lib/services/spectra";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: the active timetable's stored Spectra decisions, Week-7 overrides and
 * their booking stats (`SpectraState`); null/empty before a timetable is active or Spectra has
 * run. `decided_by` / `approved_by` are included for admins only. Re-running is
 * `POST /api/spectra/run` (admin).
 */
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  // The body depends on the role (approver ids for admins): never cache it.
  return ok(await getSpectraState(await getDb(), user), { headers: NO_STORE });
});
