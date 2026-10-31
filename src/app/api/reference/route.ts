import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { getReferenceData } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: the active dataset's calendar, rooms, faculty, student groups, courses, sessions,
 * exams and Spectra requests (`ReferenceData`), for labels, pickers and filters.
 */
export const GET = withHandler(async (request) => {
  await requireUser(request);
  return ok(await getReferenceData(await getDb()), { headers: NO_STORE });
});
