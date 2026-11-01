import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(async () => {
  const { closeMongoClient } = await import("./client");
  await closeMongoClient();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("pingDb", () => {
  it("returns false (never throws) when MONGODB_URI is missing", async () => {
    vi.resetModules();
    vi.stubEnv("MONGODB_URI", "");
    const { pingDb } = await import("./client");
    await expect(pingDb(200)).resolves.toBe(false);
  });

  it("returns false (never hangs) when the server is unreachable", async () => {
    vi.resetModules();
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=300",
    );
    const { pingDb } = await import("./client");
    const started = Date.now();
    await expect(pingDb(500)).resolves.toBe(false);
    // Loose bound: the ping gives up at its own timeout, well before the test times out.
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);
});

describe("COLLECTIONS", () => {
  it("lists every collection from the architecture doc", async () => {
    const { COLLECTION_NAMES } = await import("./collections");
    expect([...COLLECTION_NAMES].sort()).toEqual(
      [
        "datasets",
        "rooms",
        "room_unavailability",
        "faculty",
        "student_groups",
        "courses",
        "sessions",
        "exams",
        "booking_requests",
        "cancellations",
        "timetable_versions",
        "exam_schedules",
        "booking_decisions",
        "session_overrides",
        "change_requests",
        "baselines",
        "users",
        "revoked_sessions",
        "settings",
        "audit_log",
        "ai_logs",
        "locks",
      ].sort(),
    );
  });
});
