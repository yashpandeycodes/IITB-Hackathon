import { notFound, ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireChangeRunQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { ChangeDecisionRequestSchema } from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { approveChange } from "@/lib/services/change-apply";
import { CHANGE_ID } from "@/lib/services/changes";

export const dynamic = "force-dynamic";
// Approval re-checks the proposal, writes the changes, activates the version and re-runs Spectra.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * Admin: `{comment?}` → `ChangeApplyResult` (the applied request, the version now active, the
 * pending proposals it superseded). The changes are written into the dataset and the proposed
 * timetable is activated. `404` (unknown or not visible), `403` (not an admin) / `403
 * SELF_APPROVAL` (the admin's own request, unless it is a `disruption` or `manual_edit` they
 * filed as an admin: their own `faculty_request` or `unavailability`, or anything they filed
 * under another role, needs another admin), `409 CONFLICT` (not pending, no dataset, the first
 * approval while schedule.json isn't exportable, lock busy), `409 STALE_VERSION` (another
 * timetable is active now; the request is rejected), `409 HARD_CONSTRAINT` (no longer valid
 * against the current data), `429`. The role is checked before the rate limit, so a refused
 * non-admin doesn't use up change-run quota.
 */
export const POST = withHandler(async (request, context: Context) => {
  const user = await requireRole(request, "admin");
  const { id } = await context.params;
  if (!CHANGE_ID.test(id)) throw notFound("No change request with that id.");
  requireChangeRunQuota(request, user);
  const body = await parseJsonBody(request, ChangeDecisionRequestSchema, {
    maxBytes: 4_096,
  });
  return ok(await approveChange(await getDb(), user, id, body), {
    headers: NO_STORE,
  });
});
