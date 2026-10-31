import { TimetableCheckRequestSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { checkTimetableWhatIf } from "@/lib/services/timetable-view";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: what-if check. `{ assignments }` override those sessions' placements in
 * the active timetable; returns the hard violations and soft penalty of the result.
 */
export const POST = withHandler(async (request) => {
  await requireUser(request);
  const body = await parseJsonBody(request, TimetableCheckRequestSchema);
  return ok(await checkTimetableWhatIf(await getDb(), body));
});
