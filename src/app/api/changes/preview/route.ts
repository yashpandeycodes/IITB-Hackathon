import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireChangeRunQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import {
  ChangeProposalRequestSchema,
  changeRequestBoundsIssues,
} from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { previewChange } from "@/lib/services/changes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin, coordinator, faculty: the proposal for a `ChangeProposalRequest` without storing
 * anything → `ChangePreview` (the moves, stability counts, soft delta or the conflicts, and the
 * `base_version` it was computed on). Same errors as `POST /api/changes`, except the pending cap
 * (a club gets `403` before its body is read).
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(
    request,
    "admin",
    "department_coordinator",
    "faculty",
  );
  requireChangeRunQuota(request, user);
  const body = await parseJsonBody(request, ChangeProposalRequestSchema, {
    precheck: changeRequestBoundsIssues,
  });
  return ok(await previewChange(await getDb(), user, body), {
    headers: NO_STORE,
  });
});
