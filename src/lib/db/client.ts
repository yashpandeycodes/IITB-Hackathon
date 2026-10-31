import "server-only";
import { MongoClient, type Db } from "mongodb";
import { getServerEnv, requireMongoUri } from "@/lib/env";

/**
 * One MongoClient per process, cached on globalThis so dev hot reload and warm serverless
 * invocations reuse the same connection pool.
 */
type MongoCache = { client?: MongoClient; promise?: Promise<MongoClient> };

const globalForMongo = globalThis as typeof globalThis & {
  __citMongo?: MongoCache;
};

function mongoCache(): MongoCache {
  globalForMongo.__citMongo ??= {};
  return globalForMongo.__citMongo;
}

export async function getMongoClient(): Promise<MongoClient> {
  const cache = mongoCache();
  if (!cache.promise) {
    const client = new MongoClient(requireMongoUri(), {
      appName: "cit-crunch-week",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
    });
    cache.client = client;
    cache.promise = client.connect().catch(async (err: unknown) => {
      // Forget the failed client so the next call retries instead of reusing a dead promise.
      if (cache.client === client) {
        cache.client = undefined;
        cache.promise = undefined;
      }
      await client.close().catch(() => undefined);
      throw err;
    });
  }
  return cache.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getServerEnv().MONGODB_DB);
}

/** True if the database answers a ping within `timeoutMs`. Never throws. */
export async function pingDb(timeoutMs = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  const ping = (async () => {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true as const;
  })().catch((err: unknown) => {
    // Env errors are value-free by construction; driver errors don't include credentials.
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[db] ping failed: ${e.name}: ${e.message}`);
    return false as const;
  });
  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Closes the shared client (for scripts and tests that must exit cleanly). */
export async function closeMongoClient(): Promise<void> {
  const cache = mongoCache();
  const client = cache.client;
  cache.client = undefined;
  cache.promise = undefined;
  if (client) await client.close();
}
