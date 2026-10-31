import { SettingsPatchSchema } from "@/lib/contracts";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getSettings, updateSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

/** Any signed-in user: the app settings (defaults until an admin saves them). */
export const GET = withHandler(async (request) => {
  await requireUser(request);
  return ok(await getSettings(await getDb()));
});

/** Admin: update any subset of the settings (`SettingsPatch`). */
export const PATCH = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  const patch = await parseJsonBody(request, SettingsPatchSchema);
  return ok(await updateSettings(await getDb(), patch, user.id));
});
