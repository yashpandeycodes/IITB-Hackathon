import bcrypt from "bcryptjs";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserDoc } from "@/lib/db/repos/users";
import { seedDemoUsers } from "./seed";
import { mongoAvailable, TEST_MONGO_URI, throwawayDbName } from "./test-db";

const available = await mongoAvailable();

describe.skipIf(!available)("seedDemoUsers (throwaway DB)", () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = await new MongoClient(TEST_MONGO_URI).connect();
    db = client.db(throwawayDbName());
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  const users = () => db.collection<UserDoc>("users");

  it("inserts the four verified demo accounts with cost-10 hashes", async () => {
    expect(await seedDemoUsers(db)).toEqual({ inserted: 4, updated: 0 });

    const docs = await users().find().sort({ _id: 1 }).toArray();
    expect(docs.map((d) => [d._id, d.id, d.email, d.role])).toEqual([
      ["u_admin", "u_admin", "admin@cit.demo", "admin"],
      ["u_club_dramatics", "u_club_dramatics", "club@cit.demo", "club"],
      [
        "u_coord_cse",
        "u_coord_cse",
        "coord.cse@cit.demo",
        "department_coordinator",
      ],
      ["u_faculty_f06", "u_faculty_f06", "faculty@cit.demo", "faculty"],
    ]);
    for (const doc of docs) {
      expect(doc.is_verified).toBe(true);
      expect(doc.password_hash).toMatch(/^\$2[aby]\$10\$/);
      expect(doc).toMatchObject({
        otp_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        google_id: null,
        pending_nonce_hash: null,
        unverified_expires_at: null,
      });
    }
    const faculty = docs.find((d) => d._id === "u_faculty_f06")!;
    expect(faculty).toMatchObject({ department: "CSE", faculty_id: "F06" });
    expect(await bcrypt.compare("Faculty@123", faculty.password_hash!)).toBe(
      true,
    );
  });

  it("is idempotent", async () => {
    const before = await users().find().toArray();
    expect(await seedDemoUsers(db)).toEqual({ inserted: 0, updated: 0 });
    expect(await users().find().toArray()).toEqual(before);
  });

  it("re-hashes only an account whose password no longer matches", async () => {
    const { password_hash: clubHash } = (await users().findOne({
      _id: "u_club_dramatics",
    }))!;
    await users().updateOne(
      { _id: "u_admin" },
      { $set: { password_hash: await bcrypt.hash("changed", 4) } },
    );

    expect(await seedDemoUsers(db)).toEqual({ inserted: 0, updated: 1 });
    const admin = (await users().findOne({ _id: "u_admin" }))!;
    expect(await bcrypt.compare("Admin@123", admin.password_hash!)).toBe(true);
    expect(
      (await users().findOne({ _id: "u_club_dramatics" }))!.password_hash,
    ).toBe(clubHash);
  });

  it("restores drifted identity fields without touching the password", async () => {
    const { password_hash } = (await users().findOne({ _id: "u_coord_cse" }))!;
    await users().updateOne(
      { _id: "u_coord_cse" },
      { $set: { role: "admin", is_verified: false } },
    );
    expect(await seedDemoUsers(db)).toEqual({ inserted: 0, updated: 1 });
    expect(await users().findOne({ _id: "u_coord_cse" })).toMatchObject({
      role: "department_coordinator",
      is_verified: true,
      password_hash,
    });
  });

  it("creates the users and revoked_sessions indexes", async () => {
    expect(await users().indexes()).toContainEqual(
      expect.objectContaining({
        name: "unverified_ttl",
        expireAfterSeconds: 0,
        partialFilterExpression: { is_verified: false },
      }),
    );
    expect(await db.collection("revoked_sessions").indexes()).toContainEqual(
      expect.objectContaining({
        name: "expires_at_ttl",
        expireAfterSeconds: 0,
      }),
    );
  });

  it("keeps emails unique", async () => {
    const indexes = await users().indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ name: "email_unique", unique: true }),
    );
    await expect(
      users().insertOne({
        ...(await users().findOne({ _id: "u_admin" }))!,
        _id: "u_dupe",
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});
