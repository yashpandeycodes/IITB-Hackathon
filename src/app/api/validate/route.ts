import { ok, parseSearchParams, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { ValidateQuerySchema } from "@/lib/contracts";
import { getDb } from "@/lib/db";
import { validateExportFile } from "@/lib/services/export";

export const dynamic = "force-dynamic";

/**
 * Admin: the validator port's report (`ValidatorReport`) on what `GET /api/export?file=…` would
 * serve. `?file=schedule` (default) or `schedule_after`, which is checked against the changed
 * dataset with the baseline, so the report includes `stability` (`409 CONFLICT` before any
 * change is applied).
 */
export const GET = withHandler(async (request) => {
  await requireRole(request, "admin");
  const { file } = parseSearchParams(request.nextUrl, ValidateQuerySchema);
  return ok(await validateExportFile(await getDb(), file));
});
