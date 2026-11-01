import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { NO_STORE } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { getNotifications } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  return ok(await getNotifications(await getDb(), user), {
    headers: NO_STORE,
  });
});
