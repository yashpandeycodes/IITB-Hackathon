import { TimetableViewQuerySchema } from "@/lib/contracts";
import { ok, parseSearchParams, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getTimetableView } from "@/lib/services/timetable-view";

export const dynamic = "force-dynamic";

/** Any signed-in user (read-only for every role): `?view=group|faculty|room&id=…&week=regular|spectra`. */
export const GET = withHandler(async (request) => {
  await requireUser(request);
  const query = parseSearchParams(request.nextUrl, TimetableViewQuerySchema);
  return ok(await getTimetableView(await getDb(), query));
});
