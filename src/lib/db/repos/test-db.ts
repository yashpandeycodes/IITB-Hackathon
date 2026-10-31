/**
 * Test-only helper: a throwaway database on the local MongoDB (`TEST_MONGODB_URI`, default
 * `mongodb://127.0.0.1:27017`; never `MONGODB_URI`, so tests can't touch a real database).
 * Returns null when Mongo is unreachable so suites can skip.
 */
import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";

export type TestDb = {
  db: Db;
  client: MongoClient;
  /** Drops the database and closes the client. */
  cleanup: () => Promise<void>;
};

const DEFAULT_URI = "mongodb://127.0.0.1:27017";

export async function openTestDb(label: string): Promise<TestDb | null> {
  const uri = process.env.TEST_MONGODB_URI ?? DEFAULT_URI;
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 1_500,
    connectTimeoutMS: 1_500,
  });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
  } catch {
    await client.close().catch(() => undefined);
    console.warn(
      `[${label}] MongoDB is not reachable at ${uri.replace(/\/\/[^@]*@/, "//***@")}; ` +
        "skipping database tests (start it with `npm run db:start`).",
    );
    return null;
  }
  const name = `cit_test_data_${randomBytes(4).toString("hex")}`;
  const db = client.db(name);
  return {
    db,
    client,
    cleanup: async () => {
      await db.dropDatabase().catch(() => undefined);
      await client.close();
    },
  };
}
