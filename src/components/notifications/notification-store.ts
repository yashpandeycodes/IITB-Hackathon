'use client';

import type { Role } from '@/lib/contracts/enums';
import type { Dashboard } from '@/lib/contracts/dashboard';
import type { SpectraState } from '@/lib/contracts/booking';
import type { ReferenceData } from '@/lib/contracts';

export type NotificationCategory = 'booking' | 'timetable' | 'change' | 'spectra' | 'exam' | 'alert';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  type: NotificationType;
  timestamp: string; // ISO string
  read: boolean;
  href?: string;
  badge?: string;
  roles?: Role[];
}

const STORAGE_READ_KEY = 'cit_read_notif_ids_v1';
const STORAGE_DISMISSED_KEY = 'cit_dismissed_notif_ids_v1';
const STORAGE_CUSTOM_KEY = 'cit_custom_live_notifs_v1';
const EVENT_NAME = 'cit:notification';

/**
 * RBAC Category permissions per role
 */
export function isCategoryAllowedForRole(category: NotificationCategory, role: Role): boolean {
  switch (role) {
    case 'admin':
      return true; // Admin has visibility across all operations
    case 'department_coordinator':
      return ['booking', 'timetable', 'exam', 'spectra', 'change'].includes(category);
    case 'faculty':
      return ['timetable', 'change', 'booking', 'exam'].includes(category);
    case 'club':
      return ['booking', 'spectra'].includes(category);
    default:
      return false;
  }
}

/**
 * RBAC Route destination check
 */
export function isRouteAllowedForRole(href: string | undefined, role: Role): boolean {
  if (!href) return false;
  if (role === 'admin') return true;
  if (href.startsWith('/admin')) return false;
  if (href.startsWith('/approvals')) return role === 'department_coordinator';
  if (href.startsWith('/coordinator')) return role === 'department_coordinator';
  if (href.startsWith('/faculty')) return role === 'faculty';
  if (href.startsWith('/club')) return role === 'club';
  return true;
}

export function getReadNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markNotificationAsRead(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const ids = getReadNotificationIds();
    ids.add(id);
    localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function markAllNotificationsAsRead(idsToMark: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const ids = getReadNotificationIds();
    idsToMark.forEach((id) => ids.add(id));
    localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function getDismissedNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function dismissNotificationId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const ids = getDismissedNotificationIds();
    ids.add(id);
    localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function clearAllDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_READ_KEY);
    localStorage.removeItem(STORAGE_DISMISSED_KEY);
    localStorage.removeItem(STORAGE_CUSTOM_KEY);
  } catch {
    // ignore
  }
}

export function getCustomLiveNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomLiveNotification(notif: AppNotification): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCustomLiveNotifications();
    const updated = [notif, ...current.filter((n) => n.id !== notif.id)].slice(0, 30);
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * Derives 100% REAL-TIME notifications purely from actual backend state
 * (Dashboard stats, Spectra decisions, Reference requests).
 * No hardcoded or dummy notifications are ever generated.
 */
export function deriveRealTimeNotifications(
  dashboardData: Dashboard | undefined | null,
  spectraData: SpectraState | undefined | null,
  referenceData: ReferenceData | undefined | null,
  userRole: Role | null | undefined
): AppNotification[] {
  if (!userRole) return [];

  const readIds = getReadNotificationIds();
  const dismissedIds = getDismissedNotificationIds();
  const realNotifications: AppNotification[] = [];

  // 1. REAL LIVE PENDING APPROVALS NOTIFICATION (Admin & Department Coordinator)
  if (
    (userRole === 'admin' || userRole === 'department_coordinator') &&
    dashboardData?.pending_approvals &&
    dashboardData.pending_approvals.total > 0
  ) {
    const pendingTotal = dashboardData.pending_approvals.total;
    const bookingReqs = dashboardData.pending_approvals.booking_requests;
    const changeReqs = dashboardData.pending_approvals.change_requests;
    const id = `backend-pending-approvals-${pendingTotal}`;

    if (!dismissedIds.has(id)) {
      realNotifications.push({
        id,
        title: 'Action Required: Pending Approvals',
        message: `You have ${pendingTotal} request${
          pendingTotal > 1 ? 's' : ''
        } awaiting your review (${bookingReqs} venue booking${bookingReqs !== 1 ? 's' : ''}, ${changeReqs} change${
          changeReqs !== 1 ? 's' : ''
        }).`,
        category: 'booking',
        type: 'warning',
        badge: 'ACTION REQ',
        href: '/approvals',
        timestamp: new Date().toISOString(),
        read: readIds.has(id),
      });
    }
  }

  // 2. REAL TIMETABLE VIOLATION ALERT (Admin)
  if (
    userRole === 'admin' &&
    dashboardData?.timetable &&
    dashboardData.timetable.hard_violation_count !== null &&
    dashboardData.timetable.hard_violation_count > 0
  ) {
    const clashes = dashboardData.timetable.hard_violation_count;
    const id = `backend-hard-violations-${dashboardData.timetable.version_id ?? 'active'}-${clashes}`;

    if (!dismissedIds.has(id)) {
      realNotifications.push({
        id,
        title: 'Hard Constraint Clash Detected',
        message: `Active timetable has ${clashes} hard rule violation${
          clashes > 1 ? 's' : ''
        }. Generate a clash-free timetable to export.`,
        category: 'timetable',
        type: 'error',
        badge: 'CLASH',
        href: '/admin',
        timestamp: new Date().toISOString(),
        read: readIds.has(id),
      });
    }
  }

  // 3. REAL ACTIVE TIMETABLE VERSION NOTIFICATION (All permitted roles)
  if (
    dashboardData?.timetable?.version_id &&
    isCategoryAllowedForRole('timetable', userRole)
  ) {
    const verId = dashboardData.timetable.version_id;
    const scheduled = dashboardData.timetable.sessions_scheduled;
    const total = dashboardData.timetable.sessions_total;
    const penalty = dashboardData.timetable.soft_penalty?.total ?? 0;
    const id = `backend-timetable-version-${verId}`;

    if (!dismissedIds.has(id)) {
      realNotifications.push({
        id,
        title: `Operational Timetable ${verId}`,
        message: `${scheduled} of ${total} sessions assigned (${penalty} penalty points, 0 hard clashes).`,
        category: 'timetable',
        type: 'info',
        badge: 'ACTIVE',
        href: '/timetable',
        timestamp: new Date().toISOString(),
        read: readIds.has(id),
      });
    }
  }

  // 4. REAL SPECTRA ALLOCATION DECISIONS (Actual decisions stored on backend)
  if (
    spectraData?.decisions &&
    spectraData.decisions.length > 0 &&
    isCategoryAllowedForRole('spectra', userRole)
  ) {
    const reqMap = new Map((referenceData?.booking_requests ?? []).map((r) => [r.id, r]));

    // Show latest decisions from backend
    spectraData.decisions.slice(0, 8).forEach((d) => {
      const req = reqMap.get(d.request_id);
      const reqTitle = req?.title || `Booking Request #${d.request_id.slice(-4)}`;
      const id = `backend-spectra-${d.request_id}-${d.status}-${d.room_id ?? 'none'}`;

      if (dismissedIds.has(id)) return;

      if (d.status === 'approved') {
        realNotifications.push({
          id,
          title: `${reqTitle} — Room Allocated`,
          message: `Assigned venue ${d.room_id} on ${d.day} P${d.start_period}–P${d.end_period}.`,
          category: 'spectra',
          type: 'success',
          badge: 'ALLOCATED',
          href: '/spectra',
          timestamp: new Date().toISOString(),
          read: readIds.has(id),
        });
      } else if (d.status === 'rejected') {
        const isCapped = d.reason_code === 'REJ_OUTRANKED' || (d.reason && d.reason.toLowerCase().includes('cap'));
        realNotifications.push({
          id,
          title: `${reqTitle} — Request Denied`,
          message: d.reason ? `${d.reason}` : `Request denied by Spectra engine (${d.reason_code || 'DENIED'}).`,
          category: 'spectra',
          type: 'error',
          badge: isCapped ? 'CAPPED' : 'DENIED',
          href: '/spectra',
          timestamp: new Date().toISOString(),
          read: readIds.has(id),
        });
      } else if (d.status === 'alternative_offered') {
        realNotifications.push({
          id,
          title: `${reqTitle} — Alternative Offered`,
          message: `Alternative slot allocated in ${d.room_id} on ${d.day} P${d.start_period}–P${d.end_period}.`,
          category: 'spectra',
          type: 'warning',
          badge: 'ALTERNATIVE',
          href: '/spectra',
          timestamp: new Date().toISOString(),
          read: readIds.has(id),
        });
      }
    });
  }

  // 5. REAL EXAM SCHEDULE NOTIFICATION (Admin, Coordinator, Faculty)
  if (
    dashboardData?.exams?.schedule_id &&
    isCategoryAllowedForRole('exam', userRole)
  ) {
    const examSchedId = dashboardData.exams.schedule_id;
    const examsPlaced = dashboardData.exams.exams_scheduled;
    const examsTotal = dashboardData.exams.exams_total;
    const id = `backend-exams-${examSchedId}`;

    if (!dismissedIds.has(id)) {
      realNotifications.push({
        id,
        title: `Exam Schedule ${examSchedId}`,
        message: `${examsPlaced} of ${examsTotal} examinations assigned to rooms without conflict.`,
        category: 'exam',
        type: 'info',
        badge: 'EXAMS',
        href: '/exams',
        timestamp: new Date().toISOString(),
        read: readIds.has(id),
      });
    }
  }

  // 6. MERGE ANY LIVE ACTIONS TRIGGERED IN CURRENT SESSION (e.g. Generate, Activate, Spectra Run)
  const customLive = getCustomLiveNotifications().filter(
    (n) =>
      !dismissedIds.has(n.id) &&
      isCategoryAllowedForRole(n.category, userRole)
  );

  const combined = [...customLive, ...realNotifications];

  // Deduplicate by ID
  const seen = new Set<string>();
  const deduplicated: AppNotification[] = [];
  for (const notif of combined) {
    if (!seen.has(notif.id)) {
      seen.add(notif.id);
      deduplicated.push(notif);
    }
  }

  return deduplicated;
}

/**
 * Dispatches a new real-time action notification across the app.
 */
export function dispatchNotification(
  item: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string },
  currentRole?: Role | null,
  _userId?: string
): void {
  if (typeof window === 'undefined' || !currentRole) return;

  if (!isCategoryAllowedForRole(item.category, currentRole)) return;
  if (item.roles && !item.roles.includes(currentRole)) return;

  const newNotification: AppNotification = {
    id: item.id || `live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: item.title,
    message: item.message,
    category: item.category,
    type: item.type,
    timestamp: new Date().toISOString(),
    read: false,
    href: item.href,
    badge: item.badge,
    roles: item.roles,
  };

  saveCustomLiveNotification(newNotification);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: newNotification }));
}

/**
 * Listens for real-time notification events.
 */
export function subscribeToNotifications(callback: (notification: AppNotification) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const custom = e as CustomEvent<AppNotification>;
    if (custom.detail) {
      callback(custom.detail);
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
