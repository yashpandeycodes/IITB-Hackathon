import { ResetRequestSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { resetDemo } from "@/lib/services/reset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin: reset the demo data to the bundled dataset. The body is optional
 * (`{ "from": "stored" }` keeps the last uploaded dataset). An overlapping reset or import
 * gets 409 `CONFLICT`.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  const hasBody =
    request.headers.get("content-type") !== null &&
    request.headers.get("content-length") !== "0";
  const body = hasBody
    ? await parseJsonBody(request, ResetRequestSchema)
    : ResetRequestSchema.parse({});
  const report = await resetDemo(await getDb(), {
    from: body.from,
    actor: user.id,
  });
  return ok(report);
});
