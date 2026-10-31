import { z } from "zod";
import { ok, parseJsonBody, withHandler } from "@/lib/api";
import { requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { importDataset } from "@/lib/services/dataset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A `cit_public.json` is ~140 KB; judges' files get generous headroom. */
const MAX_DATASET_BYTES = 2_000_000;

/**
 * Admin: replace the dataset with an uploaded `cit_public.json`-shaped JSON body. A bad file
 * is a VALIDATION_ERROR whose details list `{ path, message }` issues (including dangling
 * references); an overlapping reset or import gets 409 `CONFLICT`.
 */
export const POST = withHandler(async (request) => {
  const user = await requireRole(request, "admin");
  const body = await parseJsonBody(request, z.unknown(), {
    maxBytes: MAX_DATASET_BYTES,
  });
  const report = await importDataset(await getDb(), body, "upload", {
    actor: user.id,
  });
  return ok(report);
});
