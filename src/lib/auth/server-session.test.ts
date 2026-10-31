/**
 * `getSessionUser()` for Server Components: the same checks as the Route Handler guards, fed by
 * a mocked `cookies()` from `next/headers`, against a throwaway database.
 */
import type { Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SessionUser } from "@/lib/contracts/user";
import type { UserDoc } from "@/lib/db/repos/users";
import { openTestDb } from "@/lib/db/repos/test-db";

const state = vi.hoisted(() => {
  // Read lazily by the env module; set before anything calls getServerEnv().
  process.env.AUTH_SECRET = "route-test-secret-0123456789-abcdefghijklmnop";
  process.env.JWT_SECRET = "";
  process.env.MONGODB_URI = "";
  return {
    db: undefined as Db | undefined,
    /** The request's cookies, as `await cookies()` would return them. */
    jar: new Map<string, string>(),
  };
});

vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: async () => {
    if (!state.db) throw new Error("test database not open");
    return state.db;
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = state.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  })),
}));

const { cookies } = await import("next/headers");
const { signSession, verifySessionClaims, SESSION_COOKIE } =
  await import("./session");
const { seedDemoUsers } = await import("./seed");
const { findUserByEmail, revokeSession, toUser } =
  await import("@/lib/db/repos/users");
const { getSessionUser } = await import("./server-session");

const testDb = await openTestDb("server-session.test");
state.db = testDb?.db;
const db = testDb?.db as Db;

afterAll(async () => {
  await testDb?.cleanup();
});

const users = () => db.collection<UserDoc>("users");

describe.skipIf(!testDb)("getSessionUser (MongoDB)", () => {
  let faculty: SessionUser;

  beforeAll(async () => {
    await seedDemoUsers(db);
    const doc = await findUserByEmail(db, "faculty@cit.demo");
    if (!doc) throw new Error("demo faculty was not seeded");
    faculty = toUser(doc);
  });

  beforeEach(() => {
    state.jar.clear();
    vi.mocked(cookies).mockClear();
  });

  const signIn = async (user: SessionUser) => {
    const token = await signSession(user);
    state.jar.set(SESSION_COOKIE, token);
    return token;
  };

  it("returns the stored user for a valid session cookie", async () => {
    await signIn(faculty);
    await expect(getSessionUser()).resolves.toEqual(faculty);
    expect(cookies).toHaveBeenCalled();
  });

  it("is null without a cookie or with a forged one", async () => {
    await expect(getSessionUser()).resolves.toBeNull();
    state.jar.set(SESSION_COOKIE, "forged.token.x");
    await expect(getSessionUser()).resolves.toBeNull();
    // Another cookie's value is never read as the session.
    state.jar.clear();
    state.jar.set("other", await signSession(faculty));
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("is null for a revoked (logged-out) token", async () => {
    const token = await signIn(faculty);
    const claims = (await verifySessionClaims(token))!;
    await revokeSession(db, claims.jti, claims.expiresAt);
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("uses the current role, not the one in the token", async () => {
    await signIn(faculty);
    await users().updateOne({ _id: faculty.id }, { $set: { role: "admin" } });
    try {
      await expect(getSessionUser()).resolves.toMatchObject({
        id: faculty.id,
        role: "admin",
      });
    } finally {
      await users().updateOne(
        { _id: faculty.id },
        { $set: { role: "faculty" } },
      );
    }
  });

  it("is null for an unverified account", async () => {
    await signIn(faculty);
    await users().updateOne(
      { _id: faculty.id },
      { $set: { is_verified: false } },
    );
    try {
      await expect(getSessionUser()).resolves.toBeNull();
    } finally {
      await users().updateOne(
        { _id: faculty.id },
        { $set: { is_verified: true } },
      );
    }
  });

  it("is null once the account is deleted", async () => {
    const ghost: SessionUser = {
      ...faculty,
      id: "u_ghost",
      email: "ghost@cit.demo",
    };
    const doc = await users().findOne({ _id: faculty.id });
    await users().insertOne({ ...doc!, _id: ghost.id, email: ghost.email });
    await signIn(ghost);
    await expect(getSessionUser()).resolves.toMatchObject({ id: "u_ghost" });
    await users().deleteOne({ _id: ghost.id });
    await expect(getSessionUser()).resolves.toBeNull();
  });
});
