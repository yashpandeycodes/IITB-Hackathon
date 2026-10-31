import { ParseBookingRequestSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireAiParseQuota, requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { parseBookingRequest } from "@/lib/services/booking-parse";

export const dynamic = "force-dynamic";

/**
 * Any signed-in user: turn a plain-language request (English or Hinglish) into an editable
 * booking draft, with the category from the user's role cap, the problems a submission would be
 * refused for, and what the engine would decide for it right now (with who must approve it).
 * Nothing is booked. Works with AI off (the rule parser). `400 VALIDATION_ERROR` for empty text
 * or a body over 8 KB, `429 RATE_LIMITED` after too many parses.
 */
export const POST = withHandler(async (request) => {
  const user = await requireUser(request);
  requireAiParseQuota(request, user);
  const { text } = await parseJsonBody(request, ParseBookingRequestSchema, {
    maxBytes: 8_192,
  });
  return ok(await parseBookingRequest(await getDb(), user, text), {
    headers: NO_STORE,
  });
});
