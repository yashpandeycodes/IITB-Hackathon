import { ok, withHandler } from "@/lib/api";
import { requireRole, requireScheduleRunQuota } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { generateExams } from "@/lib/services/exams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin: schedule the midsem exams and make the result the active exam schedule.
 * `422 INFEASIBLE` when an exam can't be placed, `409 CONFLICT` while another run holds the lock,
 * `429 RATE_LIMITED` after too many runs.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  requireScheduleRunQuota(request, user);
  return ok(await generateExams(await getDb(), { actor: user.id }));
});
