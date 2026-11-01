import { AssistantRequestSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireAssistantQuota, requireRole } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { assistantTurn } from "@/lib/services/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admins, coordinators and faculty: one turn with the timetable assistant. The message is read
 * (by the LLM when AI is on, else the rule parser), resolved against the sessions the user may
 * change, and answered with engine-verified options (submit one by posting its `proposal` to
 * `POST /api/changes`), the conflicts that rule the request out, a follow-up question, or an
 * explanation. Nothing is stored except an `ai_logs` entry. `403 FORBIDDEN` for clubs,
 * `400 VALIDATION_ERROR` for an empty message or a body over 8 KB, `429 RATE_LIMITED` after too
 * many turns.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(
    request,
    "admin",
    "department_coordinator",
    "faculty",
  );
  requireAssistantQuota(request, user);
  const body = await parseJsonBody(request, AssistantRequestSchema, {
    maxBytes: 8_192,
  });
  return ok(await assistantTurn(await getDb(), user, body, request.signal), {
    headers: NO_STORE,
  });
});
