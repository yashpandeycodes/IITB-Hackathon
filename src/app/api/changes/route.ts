import { ok, parseJsonBody, parseSearchParams, withHandler } from "@/lib/api";
import { requireChangeRunQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import {
  ChangeListQuerySchema,
  ChangeProposalRequestSchema,
  changeRequestBoundsIssues,
} from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { listChanges, proposeChange } from "@/lib/services/changes";

export const dynamic = "force-dynamic";
// A proposal runs the rescheduler under the dataset lock.
export const maxDuration = 60;

/**
 * Admin, coordinator, faculty (a club gets `403`): change requests the user may see, newest
 * first, at most 100 (`ChangeRequest[]`). `?scope=all` (default: everything visible), `mine`
 * (filed by the user) or `pending` (waiting for approval); optional `status` (`pending`,
 * `infeasible`, `applied` or `rejected`; anything else is a `400`). `nl_prompt` is null except
 * for the requester and admins.
 */
export const GET = withHandler(async (request) => {
  const user = await requireRole(
    request,
    "admin",
    "department_coordinator",
    "faculty",
  );
  const query = parseSearchParams(request.nextUrl, ChangeListQuerySchema);
  return ok(await listChanges(await getDb(), user, query), {
    headers: NO_STORE,
  });
});

/**
 * Admin, coordinator, faculty: file a `ChangeProposalRequest` → `201 ChangeRequest`, `pending`
 * with the proposed moves or `infeasible` with the conflicting constraints. A starter-pack change
 * file (`{id?, dataset?, description?, changes}`) can be posted exactly as it is (`kind` defaults
 * to `disruption`); forms and the assistant send `kind` (and `placements`) explicitly. `400 VALIDATION_ERROR`:
 * a malformed body (Zod's `{formErrors, fieldErrors}` as details), or `PathIssue[]` details for
 * a size limit broken inside `changes` / `placements`, changes that don't fit the kind, unknown
 * ids, or nothing that would change. `403` (role, or outside the user's department / own
 * sessions, `details.issues`), `409 CONFLICT` (no dataset loaded, no active timetable, 20 open
 * (pending or infeasible) requests on the active timetable already, the lock stayed busy),
 * `429`.
 */
export const POST = withHandler(async (request) => {
  // Role first, then quota, then the body: a club gets 403 whatever it sends.
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
  return ok(await proposeChange(await getDb(), user, body), {
    status: 201,
    headers: NO_STORE,
  });
});
