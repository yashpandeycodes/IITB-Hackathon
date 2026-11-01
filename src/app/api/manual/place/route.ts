import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireChangeRunQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { ManualPlacementRequestSchema } from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { placeManually } from "@/lib/services/manual";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin, or a coordinator for their department's sessions: pin one session at a slot
 * (`ManualPlacementRequest`) → `201 ChangeRequest` (`kind: "manual_edit"`, waiting for an admin's
 * approval). With `repair: false` (default) the slot must be free: `409 HARD_CONSTRAINT` with the
 * violations otherwise, nothing stored. With `repair: true` whatever is in the way moves and the
 * request is `pending` or `infeasible`. Other errors as `POST /api/changes`.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin", "department_coordinator");
  requireChangeRunQuota(request, user);
  const body = await parseJsonBody(request, ManualPlacementRequestSchema, {
    maxBytes: 4_096,
  });
  return ok(await placeManually(await getDb(), user, body), {
    status: 201,
    headers: NO_STORE,
  });
});
