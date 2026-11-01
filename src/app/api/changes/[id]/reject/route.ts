import { notFound, ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireChangeRunQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { ChangeDecisionRequestSchema } from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { CHANGE_ID, rejectChange } from "@/lib/services/changes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * An admin, or the requester withdrawing it: `{comment?}` → the rejected `ChangeRequest` (its
 * draft timetable is deleted). Works on `pending` and `infeasible` requests. `404` (unknown or
 * not visible), `403` (a club, or neither an admin nor the requester), `409 CONFLICT` (already
 * decided, lock busy), `429`. The role is checked before the rate limit, so a club (which can't
 * file changes, so has none to withdraw) doesn't use up change-run quota.
 */
export const POST = withHandler(async (request, context: Context) => {
  const user = await requireRole(
    request,
    "admin",
    "department_coordinator",
    "faculty",
  );
  const { id } = await context.params;
  if (!CHANGE_ID.test(id)) throw notFound("No change request with that id.");
  requireChangeRunQuota(request, user);
  const body = await parseJsonBody(request, ChangeDecisionRequestSchema, {
    maxBytes: 4_096,
  });
  return ok(await rejectChange(await getDb(), user, id, body), {
    headers: NO_STORE,
  });
});
