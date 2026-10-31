import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getActiveExams } from "@/lib/services/exams";

export const dynamic = "force-dynamic";

/** Any signed-in user: the active exam schedule, or null before one exists. */
export const GET = withHandler(async (request) => {
  await requireUser(request);
  return ok(await getActiveExams(await getDb()));
});
