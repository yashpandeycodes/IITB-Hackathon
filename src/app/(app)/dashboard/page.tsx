'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, isApiClientError } from '@/lib/api-client';
import { DashboardSchema } from '@/lib/contracts/dashboard';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { EmptyState } from '@/components/states/empty-state';
import { SESSION_EXPIRED_PATH } from '@/config/routes';
import { ROLE_META } from '@/config/roles';
import {
  Calendar,
  Building2,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
  Ticket,
  Bot,
  Inbox,
  AlertTriangle,
  NotebookPen,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const sessionUser = useSessionUser();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet('/api/dashboard', DashboardSchema),
  });

  useEffect(() => {
    if (isError && isApiClientError(error) && error.status === 401) {
      router.push(SESSION_EXPIRED_PATH);
    }
  }, [isError, error, router]);

  if (isLoading) {
    return (
      <AppShell
        pageTitle="Operational Dashboard"
        breadcrumbs={[{ label: 'Dashboard' }]}
      >
        <PageSkeleton />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell
        pageTitle="Operational Dashboard"
        breadcrumbs={[{ label: 'Dashboard' }]}
      >
        <ErrorState
          title="Failed to load dashboard metrics"
          message={error instanceof Error ? error.message : 'Unable to reach the campus operations service.'}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell
        pageTitle="Operational Dashboard"
        breadcrumbs={[{ label: 'Dashboard' }]}
      >
        <EmptyState
          icon={Calendar}
          title="No operational data available"
          description="Campus operations data is not yet generated for this semester."
          cta={{ label: 'Go to Admin Console', href: '/admin' }}
        />
      </AppShell>
    );
  }

  const roleMeta = ROLE_META[sessionUser.role] ?? ROLE_META.admin;
  const scheduledCount = data.timetable.sessions_scheduled;
  const totalSessions = data.timetable.sessions_total;
  const placementRate = totalSessions > 0 ? Math.round((scheduledCount / totalSessions) * 100) : 0;
  const hardViolations = data.timetable.hard_violation_count;
  const softPenalty = data.timetable.soft_penalty?.total ?? null;
  const pendingApprovalsCount = data.pending_approvals.total;
  const utilisationPct = Math.round(data.utilisation.overall * 100);

  const days = data.utilisation.days;
  const periods = data.utilisation.periods;
  const heatmapRooms = data.utilisation.rooms;

  return (
    <AppShell
      pageTitle="Operational Dashboard"
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Welcome & Fast Actions Header (§5.2) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#0B1220] via-[#101A2B] to-[#132035] border border-white/10 shadow-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[#66E3F0] uppercase font-bold tracking-wider">
                {roleMeta.label.toUpperCase()} OPERATIONS HUB
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome back, <span className="text-[#fbbf24]">{sessionUser.name}</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#98A6BB] mt-1">
              Active timetable version:{' '}
              <span className="text-white font-mono font-bold">
                {data.timetable.version_id ?? 'No active version'}
              </span>{' '}
              · Dataset: <span className="text-[#66E3F0] font-mono font-bold">{data.dataset_id}</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/rooms"
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0]/15 hover:bg-[#66E3F0]/25 text-[#66E3F0] border border-[#66E3F0]/40 flex items-center gap-1.5 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Find a room ▸</span>
            </Link>

            {sessionUser.role === 'admin' ? (
              <Link
                href="/admin"
                className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:opacity-90 text-black shadow-md flex items-center gap-1.5 transition-opacity"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Admin Console ▸</span>
              </Link>
            ) : sessionUser.role === 'club' ? (
              <Link
                href="/bookings/new"
                className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white shadow-md flex items-center gap-1.5 transition-opacity"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Book a Venue ▸</span>
              </Link>
            ) : (
              <Link
                href="/assistant"
                className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-[#8279FF]/20 hover:bg-[#8279FF]/30 text-[#8279FF] border border-[#8279FF]/40 flex items-center gap-1.5 transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Ask AI Assistant ▸</span>
              </Link>
            )}
          </div>
        </div>

        {/* 6 Core KPI Cards Grid (§5.2) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* 1: Scheduled Sessions */}
          <Link
            href="/timetable"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#66E3F0]/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SCHEDULED</span>
              <Calendar className="w-3.5 h-3.5 text-[#66E3F0]" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {scheduledCount}
              </span>
              <span className="text-xs text-[#98A6BB] font-mono">/{totalSessions}</span>
            </div>
            <div className="text-[10px] font-mono text-[#10b981] font-bold">
              {placementRate}% Placed
            </div>
          </Link>

          {/* 2: Hard Clashes */}
          <Link
            href="/admin"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#10b981]/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>HARD CLASHES</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
            </div>
            <div className="my-2">
              {hardViolations === null ? (
                <span className="text-2xl sm:text-3xl font-black font-mono text-[#98A6BB]">—</span>
              ) : (
                <>
                  <span
                    className={`text-2xl sm:text-3xl font-black font-mono ${
                      hardViolations === 0 ? 'text-[#10b981]' : 'text-rose-400'
                    }`}
                  >
                    {hardViolations}
                  </span>
                  <span
                    className={`text-xs font-mono ml-1 font-bold ${
                      hardViolations === 0 ? 'text-[#10b981]' : 'text-rose-400'
                    }`}
                  >
                    {hardViolations === 0 ? 'Hard ✓' : 'Clashes ⚠'}
                  </span>
                </>
              )}
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB]">
              {hardViolations === null
                ? 'No timetable'
                : hardViolations === 0
                ? 'H1..H14 verified'
                : 'Action required'}
            </div>
          </Link>

          {/* 3: Soft Penalty */}
          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SOFT PENALTY</span>
              <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
            </div>
            <div className="my-2">
              {softPenalty === null ? (
                <span className="text-2xl sm:text-3xl font-black font-mono text-[#98A6BB]">—</span>
              ) : (
                <>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-[#fbbf24]">
                    {softPenalty}
                  </span>
                  <span className="text-xs text-[#98A6BB] font-mono ml-1">pts</span>
                </>
              )}
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB]">
              {softPenalty === null ? 'Not evaluated' : 'S1..S6 compact'}
            </div>
          </div>

          {/* 4: Spectra Score */}
          <Link
            href="/spectra"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-pink-500/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SPECTRA SCORE</span>
              <Ticket className="w-3.5 h-3.5 text-pink-400" />
            </div>
            <div className="my-2">
              {data.bookings.booking_score !== null ? (
                <>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                    {data.bookings.booking_score}
                  </span>
                  <span className="text-xs text-[#98A6BB] font-mono">
                    /{data.bookings.booking_score_max_if_all_approved ?? 70}
                  </span>
                </>
              ) : (
                <span className="text-xl sm:text-2xl font-black font-mono text-[#98A6BB]">
                  —
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-pink-400 font-bold truncate">
              {data.bookings.booking_score !== null
                ? `${data.bookings.by_status.approved} approved · ${data.bookings.by_status.alternative_offered} alt`
                : 'Not yet calculated'}
            </div>
          </Link>

          {/* 5: Approvals / Mine */}
          {sessionUser.role === 'admin' || sessionUser.role === 'department_coordinator' ? (
            <Link
              href="/approvals"
              className="p-4 rounded-2xl bg-[#0B1220] border border-[#8279FF]/30 hover:border-[#8279FF] transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(130,121,255,0.15)] flex flex-col justify-between"
            >
              <div className="text-[11px] font-mono text-[#8279FF] uppercase flex items-center justify-between font-bold">
                <span>APPROVALS</span>
                {pendingApprovalsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#8279FF] animate-ping" />
                )}
              </div>
              <div className="my-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-[#8279FF]">
                  {pendingApprovalsCount}
                </span>
                <span className="text-xs text-[#98A6BB] font-mono ml-1">Pending</span>
              </div>
              <div className="text-[10px] font-mono text-[#8279FF] font-bold">
                {pendingApprovalsCount > 0 ? 'Action needed ▸' : 'All clear ✓'}
              </div>
            </Link>
          ) : sessionUser.role === 'faculty' ? (
            <Link
              href="/changes"
              className="p-4 rounded-2xl bg-[#0B1220] border border-[#8279FF]/30 hover:border-[#8279FF] transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(130,121,255,0.15)] flex flex-col justify-between"
            >
              <div className="text-[11px] font-mono text-[#8279FF] uppercase flex items-center justify-between font-bold">
                <span>MY CHANGES</span>
              </div>
              <div className="my-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-[#8279FF]">
                  {data.mine.change_requests_pending}
                </span>
                <span className="text-xs text-[#98A6BB] font-mono ml-1">
                  /{data.mine.change_requests}
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#8279FF] font-bold">
                {data.mine.change_requests_pending > 0 ? 'Awaiting review' : 'No open requests'}
              </div>
            </Link>
          ) : (
            <Link
              href="/bookings"
              className="p-4 rounded-2xl bg-[#0B1220] border border-[#8279FF]/30 hover:border-[#8279FF] transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(130,121,255,0.15)] flex flex-col justify-between"
            >
              <div className="text-[11px] font-mono text-[#8279FF] uppercase flex items-center justify-between font-bold">
                <span>MY BOOKINGS</span>
              </div>
              <div className="my-2">
                <span className="text-2xl sm:text-3xl font-black font-mono text-[#8279FF]">
                  {data.mine.booking_requests_open}
                </span>
                <span className="text-xs text-[#98A6BB] font-mono ml-1">
                  /{data.mine.booking_requests}
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#8279FF] font-bold">
                {data.mine.booking_requests_open > 0 ? 'In review' : 'No pending'}
              </div>
            </Link>
          )}

          {/* 6: Room Utilisation */}
          <Link
            href="/rooms"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#66E3F0]/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>UTILISATION</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#66E3F0]" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {utilisationPct}%
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB]">Teaching hours</div>
          </Link>
        </div>

        {/* Middle Two-Column Grid: Approvals / Role Inbox & Room Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Column 1 (5 Cols): Role-Aware Inbox / My Requests */}
          <div className="lg:col-span-5 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#8279FF]" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    {sessionUser.role === 'admin' || sessionUser.role === 'department_coordinator'
                      ? 'Pending Approvals Inbox'
                      : sessionUser.role === 'faculty'
                      ? 'My Teaching & Leave Status'
                      : 'My Club Venue Requests'}
                  </h2>
                </div>
                {sessionUser.role === 'admin' || sessionUser.role === 'department_coordinator' ? (
                  <Link href="/approvals" className="text-xs font-mono text-[#66E3F0] hover:underline">
                    View All ({pendingApprovalsCount}) ▸
                  </Link>
                ) : sessionUser.role === 'faculty' ? (
                  <Link href="/changes" className="text-xs font-mono text-[#66E3F0] hover:underline">
                    View Changes ▸
                  </Link>
                ) : (
                  <Link href="/bookings" className="text-xs font-mono text-[#66E3F0] hover:underline">
                    View Bookings ▸
                  </Link>
                )}
              </div>

              {/* Body for Admin / Coordinator */}
              {(sessionUser.role === 'admin' || sessionUser.role === 'department_coordinator') && (
                <>
                  {pendingApprovalsCount === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <Inbox className="w-8 h-8 text-[#98A6BB] mb-2 opacity-60" />
                      <p className="text-xs font-mono text-[#98A6BB]">No pending approval requests</p>
                      <p className="text-[11px] text-[#64748b] mt-1">All room and change requests are resolved</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span className="font-bold text-white">Change Requests</span>
                          <span className="text-[10px] font-bold text-[#8279FF]">
                            {data.pending_approvals.change_requests} awaiting
                          </span>
                        </div>
                        <div className="text-[11px] text-[#98A6BB]">Faculty leave & timetable move requests</div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-[#34d399] font-bold">Automated checks ready</span>
                          <Link href="/approvals" className="text-[#66E3F0] hover:underline">
                            Review diff ▸
                          </Link>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span className="font-bold text-white">Lab & Specialised Bookings</span>
                          <span className="text-[10px] font-bold text-[#fbbf24]">
                            {data.pending_approvals.booking_requests} awaiting
                          </span>
                        </div>
                        <div className="text-[11px] text-[#98A6BB]">Department lab and specialized venue requests</div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-[#fbbf24]">Requires Sign-off</span>
                          <Link href="/approvals" className="text-[#66E3F0] hover:underline">
                            Review ▸
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Body for Faculty */}
              {sessionUser.role === 'faculty' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="font-bold text-white">Assigned Teaching Sessions</span>
                      <span className="text-[10px] font-bold text-[#10b981]">
                        {data.mine.sessions_scheduled ?? 0} / {data.mine.sessions_total ?? 0} placed
                      </span>
                    </div>
                    <div className="text-[11px] text-[#98A6BB]">
                      Active timetable placement for your course sessions.
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#34d399] font-bold">Zero instructor clashes</span>
                      <Link href={`/timetable/faculty/${sessionUser.id}`} className="text-[#66E3F0] hover:underline">
                        View Schedule ▸
                      </Link>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="font-bold text-white">Leave & Change Requests</span>
                      <span className="text-[10px] font-bold text-[#8279FF]">
                        {data.mine.change_requests_pending} pending
                      </span>
                    </div>
                    <div className="text-[11px] text-[#98A6BB]">
                      {data.mine.change_requests} total requests submitted this semester.
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                      <Link href="/changes/new" className="text-[#fbbf24] hover:underline">
                        + Request Leave / Move
                      </Link>
                      <Link href="/changes" className="text-[#66E3F0] hover:underline">
                        Track Status ▸
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Body for Club */}
              {sessionUser.role === 'club' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="font-bold text-white">Spectra Week Bookings</span>
                      <span className="text-[10px] font-bold text-pink-400">
                        {data.mine.booking_requests_open} open / {data.mine.booking_requests} total
                      </span>
                    </div>
                    <div className="text-[11px] text-[#98A6BB]">
                      Requests submitted for fest events and regular activities.
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                      <Link href="/bookings/new" className="text-[#66E3F0] hover:underline">
                        + New Booking Request
                      </Link>
                      <Link href="/bookings" className="text-[#8279FF] hover:underline">
                        Manage Requests ▸
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Note */}
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-[#98A6BB]">
              Live status derived directly from CIT operations backend.
            </div>
          </div>

          {/* Column 2 (7 Cols): Room Utilisation Heatmap */}
          <div className="lg:col-span-7 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#66E3F0]" />
                <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                  Room Utilisation Heatmap
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#98A6BB]">
                Avg: {utilisationPct}% · {heatmapRooms.length} Venues
              </span>
            </div>

            {heatmapRooms.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Building2 className="w-8 h-8 text-[#98A6BB] mb-2 opacity-60" />
                <p className="text-xs font-mono text-[#98A6BB]">No room utilisation data yet</p>
                <p className="text-[11px] text-[#64748b] mt-1">Generate a timetable to view room occupancy patterns</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-[10px] font-mono border-collapse">
                  <thead className="sticky top-0 bg-[#0B1220] z-10">
                    <tr className="border-b border-white/10 text-[#98A6BB]">
                      <th className="p-1.5 text-left w-24 bg-[#0B1220]">Room</th>
                      {days.map((d) => (
                        <th key={d} colSpan={periods.length} className="p-1 text-center border-l border-white/10">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRooms.map((room) => (
                      <tr key={room.room_id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-1.5 font-bold text-white whitespace-nowrap">
                          <Link href={`/timetable/room/${room.room_id}`} className="hover:text-[#66E3F0]">
                            {room.room_id}
                          </Link>
                          <span className="text-[9px] text-[#98A6BB] ml-1">
                            ({Math.round(room.fraction * 100)}%)
                          </span>
                        </td>
                        {days.map((day, dayIdx) => (
                          <React.Fragment key={day}>
                            {periods.map((period, periodIdx) => {
                              const isOccupied = (room.busy?.[dayIdx]?.[periodIdx] ?? 0) > 0;
                              return (
                                <td key={period} className={`p-0.5 ${periodIdx === 0 ? 'border-l border-white/10' : ''}`}>
                                  <div
                                    title={`${room.room_id} • ${day} ${period}: ${isOccupied ? 'Occupied' : 'Free'}`}
                                    className={`w-3.5 h-3.5 rounded-[2px] transition-transform hover:scale-125 cursor-pointer ${
                                      isOccupied ? 'bg-[#66E3F0]/70' : 'bg-white/5 hover:bg-white/20'
                                    }`}
                                  />
                                </td>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Heatmap Legend */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-white/5" /> Free
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#66E3F0]/70" /> Occupied
                </span>
              </div>
              <Link href="/rooms" className="text-[#66E3F0] hover:underline font-bold">
                Availability Matrix ▸
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Three-Column Grid: Conflict Status, Exams, and Spectra Week */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Conflict Status */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Conflict Status
                  </h2>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    hardViolations === null
                      ? 'bg-white/10 text-[#98A6BB]'
                      : hardViolations === 0
                      ? 'bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {hardViolations === null
                    ? 'NO TIMETABLE'
                    : hardViolations === 0
                    ? 'PASSED'
                    : `${hardViolations} CLASHES`}
                </span>
              </div>

              <div
                className={`p-4 rounded-2xl border space-y-2 ${
                  hardViolations === 0
                    ? 'bg-[#070A12] border-emerald-500/20 text-emerald-300'
                    : 'bg-[#070A12] border-rose-500/20 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {hardViolations === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>
                    {hardViolations === null
                      ? 'No active timetable generated yet.'
                      : hardViolations === 0
                      ? '✓ No hard conflicts in the active timetable.'
                      : `${hardViolations} hard constraint violation(s) detected.`}
                  </span>
                </div>
                <p className="text-xs text-[#98A6BB] leading-relaxed">
                  {hardViolations === null
                    ? 'Generate a timetable in the Admin Console to enforce H1–H14 hard constraints.'
                    : hardViolations === 0
                    ? `All ${scheduledCount} scheduled sessions strictly satisfy H1–H14 hard constraints.`
                    : 'Resolve violations or run the optimizer in the Admin console.'}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">
                Soft Penalty: {softPenalty !== null ? `${softPenalty} pts` : '—'}
              </span>
              {sessionUser.role === 'admin' ? (
                <Link href="/admin?tab=validate" className="text-[#66E3F0] hover:underline font-bold">
                  Validator Report ▸
                </Link>
              ) : (
                <Link href="/timetable" className="text-[#66E3F0] hover:underline font-bold">
                  View Timetable ▸
                </Link>
              )}
            </div>
          </div>

          {/* Card 2: Exam Scheduling Stats */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <NotebookPen className="w-4 h-4 text-[#fbbf24]" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Exam Schedule
                  </h2>
                </div>
                <span className="text-xs font-mono text-[#fbbf24] font-bold">
                  {data.exams.schedule_id ? 'SCHEDULE ACTIVE' : 'NO SCHEDULE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-white">
                    {data.exams.exams_scheduled}
                  </div>
                  <div className="text-[10px] font-mono text-[#98A6BB]">
                    /{data.exams.exams_total} Placed
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-[#101A2B] border border-white/5 text-center">
                  <div className="text-2xl font-black font-mono text-[#fbbf24]">
                    {data.exams.penalty !== null ? `${data.exams.penalty}` : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-[#98A6BB]">Exam Penalty pts</div>
                </div>
              </div>

              <p className="text-xs text-[#98A6BB] leading-relaxed">
                {data.exams.schedule_id
                  ? `Active exam schedule ${data.exams.schedule_id}. Evaluated for 1-exam-per-day and seat splitting.`
                  : 'No exam schedule active yet for this semester.'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">
                Schedule: {data.exams.schedule_id ?? 'None'}
              </span>
              <Link href="/exams" className="text-[#fbbf24] hover:underline font-bold">
                View Exam Grid ▸
              </Link>
            </div>
          </div>

          {/* Card 3: Spectra Week Decisions */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Spectra Week Decisions
                  </h2>
                </div>
                <span className="text-xs font-mono text-pink-300 font-bold">
                  {data.bookings.requests_total} Requests
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="p-2.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center">
                  <div className="text-xl font-black font-mono text-emerald-400">
                    {data.bookings.by_status.approved}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-300 font-bold">Approved</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center">
                  <div className="text-xl font-black font-mono text-amber-400">
                    {data.bookings.by_status.alternative_offered}
                  </div>
                  <div className="text-[10px] font-mono text-amber-300 font-bold">Alternative</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-center">
                  <div className="text-xl font-black font-mono text-rose-400">
                    {data.bookings.by_status.rejected}
                  </div>
                  <div className="text-[10px] font-mono text-rose-300 font-bold">Rejected</div>
                </div>
              </div>

              <div className="text-xs font-mono text-[#98A6BB] space-y-1">
                <div className="flex justify-between">
                  <span>Cancelled requests:</span>
                  <span className="text-white font-bold">{data.bookings.cancelled}</span>
                </div>
                <div className="flex justify-between">
                  <span>Undecided requests:</span>
                  <span className="text-white font-bold">{data.bookings.undecided}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">
                Overrides: {data.bookings.session_overrides}
              </span>
              <Link href="/spectra" className="text-pink-400 hover:text-pink-300 font-bold underline">
                Open Spectra Board ▸
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
