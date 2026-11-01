import { ExportQuerySchema } from "@/lib/contracts";
import { parseSearchParams, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { exportFile } from "@/lib/services/export";

export const dynamic = "force-dynamic";

/**
 * Admin: download an export file. The body is the file itself, not an envelope.
 * - `?file=schedule` (default): `schedule.json`; once a change request has been applied, the
 *   timetable as it was just before the first one (the `--baseline`).
 * - `file=schedule_after`: `schedule_after.json`, the timetable after the applied changes
 *   (`409 CONFLICT` before any).
 * - `file=disruption`: `disruption.json`, every applied change in apply order (`409 CONFLICT`
 *   before any).
 * When the validator port finds a hard violation the response is the `409 HARD_CONSTRAINT`
 * envelope with the violations instead; `409 CONFLICT` when Spectra decisions are missing.
 */
export const GET = withHandler(async (request) => {
  await requireRole(request, "admin");
  const { file } = parseSearchParams(request.nextUrl, ExportQuerySchema);
  const { filename, body } = await exportFile(await getDb(), file);
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
