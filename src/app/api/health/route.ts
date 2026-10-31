import { ok, withHandler } from "@/lib/api";
import { getBundledDataset } from "@/lib/dataset";
import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "ok";
  db: "up" | "down";
  dataset_id: string;
  time: string;
};

/** Liveness probe. Always 200 while the app runs; `db` reports Mongo reachability. */
export const GET = withHandler(async () => {
  const dbUp = await pingDb();
  const body: HealthStatus = {
    status: "ok",
    db: dbUp ? "up" : "down",
    dataset_id: getBundledDataset().dataset_id,
    time: new Date().toISOString(),
  };
  return ok(body, { headers: { "Cache-Control": "no-store" } });
});
