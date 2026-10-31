import type { HealthStatus } from "@/lib/contracts";
import { ok, withHandler } from "@/lib/api";
import { getBundledDataset } from "@/lib/dataset";
import { getDb, pingDb } from "@/lib/db";
import { getActiveDatasetId } from "@/lib/services/dataset";

export const dynamic = "force-dynamic";

/** The loaded dataset's id, or the bundled one when the DB is down or empty. Never throws. */
async function datasetId(dbUp: boolean): Promise<string> {
  if (dbUp) {
    try {
      return await getActiveDatasetId(await getDb());
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(`[health] dataset lookup failed: ${e.name}: ${e.message}`);
    }
  }
  return getBundledDataset().dataset_id;
}

/** Liveness probe. Always 200 while the app runs; `db` reports Mongo reachability. */
export const GET = withHandler(async () => {
  const dbUp = await pingDb();
  const body: HealthStatus = {
    status: "ok",
    db: dbUp ? "up" : "down",
    dataset_id: await datasetId(dbUp),
    time: new Date().toISOString(),
  };
  return ok(body, { headers: { "Cache-Control": "no-store" } });
});
