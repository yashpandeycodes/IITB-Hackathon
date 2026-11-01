'use client';

import React, { useState, useEffect, useRef, useSyncExternalStore, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Ticket,
  Calendar,
  Sparkles,
  GraduationCap,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  AppNotification,
  NotificationCategory,
  deriveRealTimeNotifications,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotificationId,
  clearAllDismissed,
  isCategoryAllowedForRole,
  isRouteAllowedForRole,
} from './notification-store';
import { useOptionalSessionUser } from '@/components/providers/session-provider';
import { useReferenceData } from '@/hooks/use-reference-data';
import { apiGet } from '@/lib/api-client';
import { DashboardSchema } from '@/lib/contracts/dashboard';
import { SpectraStateSchema } from '@/lib/contracts/booking';

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return 'Recently';
  }
}

function getCategoryIcon(cat: NotificationCategory) {
  switch (cat) {
    case 'booking':
      return <Ticket className="w-4 h-4 text-[#22D3EE]" />;
    case 'timetable':
      return <Calendar className="w-4 h-4 text-[#818CF8]" />;
    case 'change':
      return <RefreshCw className="w-4 h-4 text-[#C084FC]" />;
    case 'spectra':
      return <Sparkles className="w-4 h-4 text-[#FBBF24]" />;
    case 'exam':
      return <GraduationCap className="w-4 h-4 text-[#FB7185]" />;
    case 'alert':
    default:
      return <AlertTriangle className="w-4 h-4 text-[#F87171]" />;
  }
}

function getTypeBadgeStyle(type: string) {
  switch (type) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'error':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'info':
    default:
      return 'bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30';
  }
}

const emptySubscribe = () => () => {};

export const NotificationBell: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const sessionUser = useOptionalSessionUser();
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | NotificationCategory>('all');
  const [liveEventTick, setLiveEventTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Real Dashboard State
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet('/api/dashboard', DashboardSchema),
    enabled: isClient && !!sessionUser,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // 2. Fetch Real Spectra Decisions
  const { data: spectraData } = useQuery({
    queryKey: ['spectra'],
    queryFn: () => apiGet('/api/spectra', SpectraStateSchema),
    enabled: isClient && !!sessionUser,
    staleTime: 30_000,
  });

  // 3. Fetch Real Reference Data (for request details)
  const { data: referenceData } = useReferenceData();

  // Listen for live real-time action dispatches across the app
  useEffect(() => {
    if (!sessionUser) return;
    const unsubscribe = subscribeToNotifications(() => {
      setLiveEventTick((prev) => prev + 1);
    });
    return () => unsubscribe();
  }, [sessionUser]);

  // Click outside to close panel
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Derive 100% real-time notifications directly from actual backend state
  const notifications = useMemo(() => {
    if (!isClient || !sessionUser) return [];
    // liveEventTick is included so incoming custom live events immediately recalculate
    void liveEventTick;
    return deriveRealTimeNotifications(
      dashboardData,
      spectraData,
      referenceData,
      sessionUser.role
    );
  }, [isClient, sessionUser, dashboardData, spectraData, referenceData, liveEventTick]);

  // If SSR or user is not logged in, NEVER render the notification bell
  if (!isClient || !sessionUser) {
    return null;
  }

  // Filter notifications by role RBAC and active tab
  const roleAllowedNotifications = notifications.filter((n) =>
    isCategoryAllowedForRole(n.category, sessionUser.role)
  );

  const filteredNotifications =
    selectedFilter === 'all'
      ? roleAllowedNotifications
      : roleAllowedNotifications.filter((n) => n.category === selectedFilter);

  const unreadCount = roleAllowedNotifications.filter((n) => !n.read).length;

  const handleMarkAllAsRead = () => {
    const ids = roleAllowedNotifications.map((n) => n.id);
    markAllNotificationsAsRead(ids);
    setLiveEventTick((prev) => prev + 1);
  };

  const handleItemClick = (notif: AppNotification) => {
    markNotificationAsRead(notif.id);
    setLiveEventTick((prev) => prev + 1);
    setIsOpen(false);

    if (!notif.href) return;

    // Strict authentication & RBAC check before navigating
    if (!sessionUser) {
      router.push(`/login?redirect=${encodeURIComponent(notif.href)}`);
      return;
    }

    if (!isRouteAllowedForRole(notif.href, sessionUser.role)) {
      router.push('/unauthorized');
      return;
    }

    router.push(notif.href);
  };

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissNotificationId(id);
    setLiveEventTick((prev) => prev + 1);
  };

  const handleClearAll = () => {
    clearAllDismissed();
    setLiveEventTick((prev) => prev + 1);
  };

  // Define available filter tabs based on role permissions
  const availableTabs: { key: 'all' | NotificationCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(isCategoryAllowedForRole('booking', sessionUser.role)
      ? [{ key: 'booking' as const, label: 'Bookings' }]
      : []),
    ...(isCategoryAllowedForRole('spectra', sessionUser.role)
      ? [{ key: 'spectra' as const, label: 'Spectra' }]
      : []),
    ...(isCategoryAllowedForRole('timetable', sessionUser.role)
      ? [{ key: 'timetable' as const, label: 'Schedule' }]
      : []),
    ...(isCategoryAllowedForRole('exam', sessionUser.role)
      ? [{ key: 'exam' as const, label: 'Exams' }]
      : []),
  ];

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Trigger Bell Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl bg-[#101A2B] hover:bg-[#162238] border border-white/10 text-[#98A6BB] hover:text-white transition-all outline-none focus:ring-2 focus:ring-[#22D3EE]/50"
        title="Notifications"
        aria-label="Open notifications"
      >
        <Bell className="w-4 h-4 text-[#A7B3C9] hover:text-white transition-colors" />

        {/* Real Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-gradient-to-r from-[#6366F1] to-[#22D3EE] text-[9px] font-bold text-[#070A12] shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
            <span className="absolute inset-0 rounded-full bg-[#22D3EE] animate-ping opacity-30" />
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#0B1220]/95 backdrop-blur-xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-50 overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-[#0E172A]/70">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">Live Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/30">
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-[#94A3B8] hover:text-white hover:bg-white/5 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3 h-3 text-[#22D3EE]" />
                    <span>Read all</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter Categories Bar */}
            <div className="flex items-center gap-1 p-2 border-b border-white/5 overflow-x-auto scrollbar-none bg-[#090F1C]/40 text-[11px] font-mono">
              {availableTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-lg transition-all shrink-0 ${
                    selectedFilter === tab.key
                      ? 'bg-gradient-to-r from-[#6366F1]/20 to-[#22D3EE]/20 text-[#22D3EE] border border-[#22D3EE]/40 font-semibold'
                      : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[380px] divide-y divide-white/5">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <Bell className="w-5 h-5 text-[#64748B]" />
                  </div>
                  <p className="text-xs text-[#94A3B8] font-medium">All caught up!</p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">No active notifications from the campus system.</p>
                </div>
              ) : (
                filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`group p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                      n.read
                        ? 'bg-transparent hover:bg-white/[0.03]'
                        : 'bg-[#101A2B]/40 hover:bg-[#101A2B]/70'
                    }`}
                  >
                    {/* Category Icon Badge */}
                    <div className="p-2 rounded-xl bg-[#0F172A] border border-white/10 shrink-0 mt-0.5">
                      {getCategoryIcon(n.category)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-xs font-semibold truncate ${
                              n.read ? 'text-[#CBD5E1]' : 'text-white'
                            }`}
                          >
                            {n.title}
                          </span>
                          {!n.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#64748B] shrink-0">
                          {formatTimeAgo(n.timestamp)}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2">
                        {n.message}
                      </p>

                      {/* Footer tags */}
                      <div className="mt-2 flex items-center justify-between">
                        {n.badge ? (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${getTypeBadgeStyle(
                              n.type
                            )}`}
                          >
                            {n.badge}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono uppercase text-[#64748B]">
                            {n.category}
                          </span>
                        )}

                        {n.href && (
                          <span className="text-[10px] text-[#22D3EE] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-mono">
                            <span>Open</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dismiss Button */}
                    <button
                      onClick={(e) => handleDismiss(n.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#64748B] hover:text-[#F87171] transition-all rounded"
                      title="Dismiss"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {roleAllowedNotifications.length > 0 && (
              <div className="p-2.5 border-t border-white/10 bg-[#0E172A]/70 flex items-center justify-between text-xs">
                <button
                  onClick={handleClearAll}
                  className="text-[10px] font-mono text-[#64748B] hover:text-[#F87171] transition-colors"
                >
                  Clear all notifications
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/dashboard');
                  }}
                  className="text-[10px] font-mono text-[#22D3EE] hover:underline"
                >
                  Campus Command ▸
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
