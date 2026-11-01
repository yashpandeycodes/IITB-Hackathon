import "server-only";
import type { Db } from "mongodb";
import type { AppNotification, SessionUser } from "@/lib/contracts";
import { listBookings } from "@/lib/services/bookings";
import { getActiveTimetableVersion } from "@/lib/db/repos/timetable-versions";
import { getActiveExamSchedule } from "@/lib/db/repos/exam-schedules";
import { listBookingDecisions } from "@/lib/db/repos/booking-decisions";

export async function getNotifications(
  db: Db,
  user: SessionUser
): Promise<AppNotification[]> {
  const notifications: AppNotification[] = [];

  // 1. User's Own Bookings (All authenticated users: admin, coordinator, faculty, club)
  const myBookings = await listBookings(db, user, { scope: "mine" });
  for (const b of myBookings.slice(0, 15)) {
    const req = b.request;
    const dec = b.decision;
    const reqTitle = req.title || `Booking ${req.id}`;
    const timestamp = req.submitted_at || new Date().toISOString();

    if (req.state === "pending_approval") {
      notifications.push({
        id: `my-booking-pending-${req.id}`,
        title: `${reqTitle} — Awaiting Approval`,
        message: `Your booking request for ${req.requested_room || "venue"} is awaiting approver review.`,
        category: "booking",
        type: "warning",
        badge: "PENDING",
        href: `/bookings/${req.id}`,
        timestamp,
        read: false,
      });
    } else if (dec?.status === "approved") {
      notifications.push({
        id: `my-booking-approved-${req.id}-${dec.room_id}`,
        title: `${reqTitle} — Booking Confirmed`,
        message: `Venue ${dec.room_id} has been allocated on ${dec.day} P${dec.start_period}–P${dec.end_period}.`,
        category: "booking",
        type: "success",
        badge: "APPROVED",
        href: `/bookings/${req.id}`,
        timestamp: dec.decided_at || timestamp,
        read: false,
      });
    } else if (dec?.status === "alternative_offered") {
      notifications.push({
        id: `my-booking-alt-${req.id}-${dec.room_id}`,
        title: `${reqTitle} — Alternative Offered`,
        message: `Alternative slot allocated in ${dec.room_id} on ${dec.day} P${dec.start_period}–P${dec.end_period}.`,
        category: "booking",
        type: "warning",
        badge: "ALTERNATIVE",
        href: `/bookings/${req.id}`,
        timestamp: dec.decided_at || timestamp,
        read: false,
      });
    } else if (dec?.status === "rejected") {
      const isCapped =
        dec.reason_code === "REJ_OUTRANKED" ||
        (dec.reason && dec.reason.toLowerCase().includes("cap"));
      notifications.push({
        id: `my-booking-rej-${req.id}`,
        title: `${reqTitle} — Venue Request Denied`,
        message: dec.reason || `Denied by engine (${dec.reason_code || "DENIED"}).`,
        category: "booking",
        type: "error",
        badge: isCapped ? "CAPPED" : "DENIED",
        href: `/bookings/${req.id}`,
        timestamp: dec.decided_at || timestamp,
        read: false,
      });
    } else if (req.state === "cancelled") {
      notifications.push({
        id: `my-booking-cancelled-${req.id}`,
        title: `${reqTitle} — Booking Cancelled`,
        message: `Your booking was cancelled and the venue slot freed.`,
        category: "booking",
        type: "info",
        badge: "CANCELLED",
        href: `/bookings`,
        timestamp,
        read: false,
      });
    } else if (req.state === "submitted") {
      notifications.push({
        id: `my-booking-submitted-${req.id}`,
        title: `${reqTitle} — Booking Submitted`,
        message: `Request for ${req.requested_room || "venue"} submitted. Awaiting timetable run.`,
        category: "booking",
        type: "info",
        badge: "SUBMITTED",
        href: `/bookings/${req.id}`,
        timestamp,
        read: false,
      });
    }
  }

  // 2. Pending Approvals (Admin & Department Coordinator)
  if (user.role === "admin" || user.role === "department_coordinator") {
    const approvals = await listBookings(db, user, { scope: "approvals" });
    if (approvals.length > 0) {
      notifications.push({
        id: `approvals-pending-count-${approvals.length}`,
        title: "Action Required: Pending Approvals",
        message: `You have ${approvals.length} venue booking request${approvals.length > 1 ? "s" : ""} waiting for your review.`,
        category: "booking",
        type: "warning",
        badge: "ACTION REQ",
        href: "/approvals",
        timestamp: new Date().toISOString(),
        read: false,
      });

      for (const appr of approvals.slice(0, 5)) {
        notifications.push({
          id: `approval-item-${appr.request.id}`,
          title: `Sign-off Needed: ${appr.request.title}`,
          message: `${appr.request.requester} requested ${appr.request.requested_room || "a venue"} (${appr.request.duration_periods} period(s)).`,
          category: "booking",
          type: "warning",
          badge: "REVIEW",
          href: "/approvals",
          timestamp: appr.request.submitted_at || new Date().toISOString(),
          read: false,
        });
      }
    }
  }

  // 3. Timetable Status & Violations
  const activeVersion = await getActiveTimetableVersion(db);
  if (activeVersion) {
    if (user.role === "admin" && (activeVersion.hard_violation_count ?? 0) > 0) {
      const clashes = activeVersion.hard_violation_count ?? 0;
      notifications.push({
        id: `timetable-hard-clash-${activeVersion.id}-${clashes}`,
        title: "Hard Constraint Clash Detected",
        message: `Active timetable has ${clashes} hard rule violation${clashes > 1 ? "s" : ""}. Export is locked.`,
        category: "timetable",
        type: "error",
        badge: "CLASH",
        href: "/admin",
        timestamp: activeVersion.created_at || new Date().toISOString(),
        read: false,
      });
    }

    if (user.role !== "club") {
      const penalty = activeVersion.soft_penalty?.total ?? 0;
      notifications.push({
        id: `timetable-operational-${activeVersion.id}`,
        title: `Operational Timetable ${activeVersion.id}`,
        message: `${activeVersion.assignments.length} assignments scheduled (${penalty} penalty pts, 0 hard clashes).`,
        category: "timetable",
        type: "info",
        badge: "ACTIVE",
        href: "/timetable",
        timestamp: activeVersion.created_at || new Date().toISOString(),
        read: false,
      });
    }
  }

  // 4. Exams (Admin & Coordinators)
  if (user.role === "admin" || user.role === "department_coordinator") {
    const activeExam = await getActiveExamSchedule(db);
    if (activeExam) {
      notifications.push({
        id: `exam-schedule-active-${activeExam.id}`,
        title: "Exam Schedule Active",
        message: `${activeExam.exams.length} examinations scheduled (penalty: ${activeExam.penalty ?? 0}).`,
        category: "exam",
        type: "info",
        badge: "EXAMS",
        href: "/exams",
        timestamp: activeExam.created_at || new Date().toISOString(),
        read: false,
      });
    }
  }

  // 5. Spectra Decisions (Admin & Permitted Users)
  if (user.role === "admin") {
    const decisions = await listBookingDecisions(db);
    for (const d of decisions.slice(0, 6)) {
      if (
        d.status === "rejected" &&
        (d.reason_code === "REJ_OUTRANKED" ||
          (d.reason && d.reason.toLowerCase().includes("cap")))
      ) {
        notifications.push({
          id: `spectra-cap-${d.request_id}`,
          title: "Spectra Quota Capped",
          message: d.reason || `Request ${d.request_id} outranked or quota capped.`,
          category: "spectra",
          type: "warning",
          badge: "CAPPED",
          href: "/spectra",
          timestamp: d.decided_at || new Date().toISOString(),
          read: false,
        });
      }
    }
  }

  return notifications;
}

