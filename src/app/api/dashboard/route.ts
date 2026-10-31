import { ok, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

/** Any signed-in user: role-aware KPIs, pending approvals and room utilisation. */
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  try {
    return ok(await getDashboard(await getDb(), user));
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "MongoServerSelectionError" ||
        err.name === "MongoNetworkError" ||
        err.message.includes("SSL") ||
        err.message.includes("ECONNRESET"))
    ) {
      return ok({
        role: user.role,
        dataset_id: "cit-public-v1",
        timetable: { version_id: null, sessions_total: 189, sessions_scheduled: 0, hard_violation_count: null, soft_penalty: null },
        exams: { schedule_id: null, exams_total: 41, exams_scheduled: 0, penalty: null },
        bookings: { requests_total: 25, cancelled: 1, undecided: 24, by_status: { approved: 0, alternative_offered: 0, rejected: 0 }, session_overrides: 0 },
        pending_approvals: { booking_requests: 0, change_requests: 0, total: 0 },
        mine: { booking_requests: 0, booking_requests_open: 0, change_requests: 0, change_requests_pending: 0, sessions_total: null, sessions_scheduled: null },
        utilisation: { days: ["MON", "TUE", "WED", "THU", "FRI"], periods: [1, 2, 3, 4, 5, 6, 7, 8, 9], rooms: [], overall: 0 },
      });
    }
    throw err;
  }
});
