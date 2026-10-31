import { ok, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { validateCurrentSchedule } from "@/lib/services/export";

export const dynamic = "force-dynamic";

/** Admin: the validator port's report on the current export projection (`ValidatorReport`). */
export const GET = withHandler(async (request) => {
  await requireRole(request, "admin");
  return ok(await validateCurrentSchedule(await getDb()));
});
