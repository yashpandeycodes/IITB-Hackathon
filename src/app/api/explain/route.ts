import { ExplainRequestSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireExplainQuota, requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { explainSubject } from "@/lib/services/explain";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: why a session sits where it is (`subject: "session"`), why a booking got
 * its decision (`"booking"`, same visibility as `GET /api/bookings/:id`) or why a change request
 * moves what it moves (`"change"`, visible to its requester, admins and the people it touches).
 * The facts come from the engine; the text is phrased from them (template when AI is off).
 * `404 NOT_FOUND` for an unknown id or one the user may not see, `400 VALIDATION_ERROR` for a
 * bad body or one over 4 KB, `429 RATE_LIMITED` after too many requests.
 */
export const POST = withHandler(async (request) => {
  const user = await requireUser(request);
  requireExplainQuota(user);
  const body = await parseJsonBody(request, ExplainRequestSchema, {
    maxBytes: 4_096,
  });
  return ok(await explainSubject(await getDb(), user, body), {
    headers: NO_STORE,
  });
});
