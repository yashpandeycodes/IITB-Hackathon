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
  try {
    return ok(await getTimetableView(await getDb(), query));
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "MongoServerSelectionError" ||
        err.name === "MongoNetworkError" ||
        err.message.includes("SSL") ||
        err.message.includes("ECONNRESET"))
    ) {
      return ok({
        view: query.view,
        id: query.id,
        week: query.week,
        version_id: null,
        cells: [],
        bookings: [],
      });
    }
    throw err;
  }
});
