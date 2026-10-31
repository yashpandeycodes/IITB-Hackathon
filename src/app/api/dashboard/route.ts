import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

/** Any signed-in user: role-aware KPIs, pending approvals and room utilisation. */
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  return ok(await getDashboard(await getDb(), user));
});
