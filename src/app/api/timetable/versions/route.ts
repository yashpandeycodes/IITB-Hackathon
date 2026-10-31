import { ok, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { listTimetableVersionSummaries } from "@/lib/services/timetable";

export const dynamic = "force-dynamic";

/** Admin: every stored timetable version, newest first, without assignments. */
export const GET = withHandler(async (request) => {
  await requireRole(request, "admin");
  return ok(await listTimetableVersionSummaries(await getDb()));
});
