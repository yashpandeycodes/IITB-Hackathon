import { ExportQuerySchema } from "@/lib/contracts";
import { parseSearchParams, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { exportSchedule } from "@/lib/services/export";

export const dynamic = "force-dynamic";

/**
 * Admin: download `schedule.json` (`?file=schedule`, the default) as a file. The body is the
 * export itself, not an envelope. When the validator port finds a hard violation the response is
 * the `409 HARD_CONSTRAINT` envelope with the violations instead.
 */
export const GET = withHandler(async (request) => {
  await requireRole(request, "admin");
  const { file } = parseSearchParams(request.nextUrl, ExportQuerySchema);
  const schedule = await exportSchedule(await getDb());
  return new Response(JSON.stringify(schedule, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${file}.json"`,
      "cache-control": "no-store",
    },
  });
});
