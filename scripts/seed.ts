/**
 * Resets the demo database: `npx tsx --conditions=react-server scripts/seed.ts [--stored]`.
 *
 * Reads MONGODB_URI / MONGODB_DB from the environment, loading `.env.local` first when it
 * exists. Loads the bundled `data/cit_public.json`; `--stored` re-imports the last upload.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

async function main(): Promise<void> {
  const envFile = resolve(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  // Imported after the env file is loaded; the env module reads process.env lazily.
  const { closeMongoClient, getDb } = await import("@/lib/db");
  const { resetDemo } = await import("@/lib/services/reset");

  const from = process.argv.includes("--stored") ? "stored" : "bundled";
  try {
    const report = await resetDemo(await getDb(), { from, actor: "system" });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closeMongoClient();
  }
}

main().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[seed] failed: ${e.name}: ${e.message}`);
  process.exitCode = 1;
});
