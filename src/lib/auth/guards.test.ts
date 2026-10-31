import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/contracts/user";
import type { UserDoc } from "@/lib/db/repos/users";
import { closeMongoClient, getDb } from "@/lib/db/client";
import { revokeSession } from "@/lib/db/repos/users";
import { ApiError } from "@/lib/errors";
import { assertNotSelf, requireRole, requireUser } from "./guards";
import { signSession, verifySessionClaims } from "./session";
import {
  insertSessionUsers,
  mongoAvailable,
  TEST_MONGO_URI,
  testSecret,
  throwawayDbName,
} from "./test-db";

const available = await mongoAvailable();

const FACULTY: SessionUser = {
  id: "u_faculty_f06",
  email: "faculty@cit.demo",
  name: "Dr. Arjun Mehta",
  role: "faculty",
  department: "CSE",
  faculty_id: "F06",
  club: null,
};

const request = (cookie?: string) =>
  new Request("http://localhost/api/timetable", {
    headers: cookie ? { cookie } : {},
  });

const cookieFor = async (user: SessionUser) =>
  `cit_nexus_session=${await signSession(user)}`;

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe.skipIf(!available)("requireUser / requireRole (throwaway DB)", () => {
  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", testSecret());
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("MONGODB_URI", TEST_MONGO_URI);
    vi.stubEnv("MONGODB_DB", throwawayDbName());
    await insertSessionUsers(await getDb(), [FACULTY]);
  });

  afterAll(async () => {
    await (await getDb()).dropDatabase();
    await closeMongoClient();
    vi.unstubAllEnvs();
  });

  it("returns the stored user for a valid session", async () => {
    await expect(
      requireUser(request(await cookieFor(FACULTY))),
    ).resolves.toEqual(FACULTY);
  });

  it("throws UNAUTHENTICATED (401) without a valid session", async () => {
    for (const cookie of [undefined, "cit_nexus_session=forged.token.x"]) {
      const err = await caught(requireUser(request(cookie)));
      expect(err.code).toBe("UNAUTHENTICATED");
      expect(err.status).toBe(401);
    }
  });

  it("rejects a revoked (logged-out) token but not the same user's other sessions", async () => {
    const loggedOut = await signSession(FACULTY);
    const other = await cookieFor(FACULTY);
    const claims = (await verifySessionClaims(loggedOut))!;
    await revokeSession(await getDb(), claims.jti, claims.expiresAt);

    const err = await caught(
      requireUser(request(`cit_nexus_session=${loggedOut}`)),
    );
    expect(err.code).toBe("UNAUTHENTICATED");
    await expect(requireUser(request(other))).resolves.toEqual(FACULTY);
  });

  it("uses the current role, not the one in the token", async () => {
    const cookie = await cookieFor(FACULTY);
    const users = (await getDb()).collection<UserDoc>("users");
    await users.updateOne({ _id: FACULTY.id }, { $set: { role: "admin" } });
    try {
      await expect(
        requireRole(request(cookie), "admin"),
      ).resolves.toMatchObject({ id: FACULTY.id, role: "admin" });
    } finally {
      await users.updateOne({ _id: FACULTY.id }, { $set: { role: "faculty" } });
    }
  });

  it("signs out a deleted user", async () => {
    const ghost = { ...FACULTY, id: "u_ghost", email: "ghost@cit.demo" };
    await insertSessionUsers(await getDb(), [ghost]);
    const cookie = await cookieFor(ghost);
    await (
      await getDb()
    )
      .collection<UserDoc>("users")
      .deleteOne({ _id: "u_ghost" });
    const err = await caught(requireUser(request(cookie)));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("allows a listed role and throws FORBIDDEN (403) for others", async () => {
    const cookie = await cookieFor(FACULTY);
    await expect(
      requireRole(request(cookie), "admin", "faculty"),
    ).resolves.toEqual(FACULTY);
    const err = await caught(requireRole(request(cookie), "admin"));
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);
  });

  it("checks authentication before the role", async () => {
    const err = await caught(requireRole(request(), "admin"));
    expect(err.code).toBe("UNAUTHENTICATED");
  });
});

describe("assertNotSelf", () => {
  it("throws SELF_APPROVAL (403) when approver and requester match", () => {
    let err: unknown;
    try {
      assertNotSelf("u_admin", "u_admin");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("SELF_APPROVAL");
    expect((err as ApiError).status).toBe(403);
  });

  it("allows different users and system-created requests", () => {
    expect(() => assertNotSelf("u_admin", "u_coord_cse")).not.toThrow();
    expect(() => assertNotSelf("u_admin", null)).not.toThrow();
  });
});
