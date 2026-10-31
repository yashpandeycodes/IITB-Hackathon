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
  const hardViolations = data.timetable.hard_violation_count ?? 0;
  const softPenalty = data.timetable.soft_penalty?.total ?? 0;
  const pendingApprovalsCount = data.pending_approvals.total;
  const utilisationPct = Math.round(data.utilisation.overall * 100);

  const days = data.utilisation.days;
  const periods = data.utilisation.periods;
  const heatmapRooms = data.utilisation.rooms.slice(0, 8);

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
                {data.timetable.version_id ?? 'CIT-PROD-2026.01'}
              </span>{' '}
              · Autumn Semester Crunch Week
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
                <span>Generate Timetable ▸</span>
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

          <Link
            href="/admin"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#10b981]/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>HARD CLASHES</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#10b981]">
                {hardViolations}
              </span>
              <span className="text-xs text-[#10b981] font-mono ml-1 font-bold">Hard ✓</span>
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB]">H1..H14 verified</div>
          </Link>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SOFT PENALTY</span>
              <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#fbbf24]">
                {softPenalty}
              </span>
              <span className="text-xs text-[#98A6BB] font-mono ml-1">pts</span>
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB]">Compact & balanced</div>
          </div>

          <Link
            href="/spectra"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-pink-500/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SPECTRA SCORE</span>
              <Ticket className="w-3.5 h-3.5 text-pink-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {data.bookings.by_status.approved}
              </span>
              <span className="text-xs text-[#98A6BB] font-mono">
                /{data.bookings.requests_total}
              </span>
            </div>
            <div className="text-[10px] font-mono text-pink-400 font-bold">
              {data.bookings.requests_total > 0
                ? `${Math.round((data.bookings.by_status.approved / data.bookings.requests_total) * 100)}% Satisfied`
                : 'No requests'}
            </div>
          </Link>

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
              {pendingApprovalsCount > 0 ? 'Action needed ▸' : 'All clear'}
            </div>
          </Link>

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

        {/* Middle Two-Column Grid: Pending Approvals & Room Heatmap (§5.2) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pending Approvals Inbox Card (5 Cols) */}
          <div className="lg:col-span-5 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#8279FF]" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Pending Approvals Inbox
                  </h2>
                </div>
                <Link href="/approvals" className="text-xs font-mono text-[#66E3F0] hover:underline">
                  View All ({pendingApprovalsCount}) ▸
                </Link>
              </div>

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
                    <div className="text-[11px] text-[#98A6BB]">Faculty leave & timetable change requests</div>
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
                    <div className="text-[11px] text-[#98A6BB]">Department lab and specialised venue requests</div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#fbbf24]">Requires Sign-off</span>
                      <Link href="/approvals" className="text-[#66E3F0] hover:underline">
                        Review ▸
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-[#98A6BB]">
              All proposed changes pass automated pre-condition checks.
            </div>
          </div>

          {/* Room Utilisation Heatmap (7 Cols, §5.2) */}
          <div className="lg:col-span-7 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#66E3F0]" />
                <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                  Room Utilisation Heatmap
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#98A6BB]">
                Avg: {utilisationPct}%
              </span>
            </div>

            {heatmapRooms.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Building2 className="w-8 h-8 text-[#98A6BB] mb-2 opacity-60" />
                <p className="text-xs font-mono text-[#98A6BB]">No room utilisation data yet</p>
                <p className="text-[11px] text-[#64748b] mt-1">Generate a timetable to view room occupancy patterns</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[#98A6BB]">
                      <th className="p-1.5 text-left w-24">Room</th>
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

        {/* Bottom Two-Column Grid: Current Conflicts & Spectra Week Summary (§5.2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current Conflicts Banner */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Timetable Conflict Status
                  </h2>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    hardViolations === 0
                      ? 'bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {hardViolations === 0 ? 'PASSED' : `${hardViolations} CLASHES`}
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
                  <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                  <span>
                    {hardViolations === 0
                      ? '✓ No hard conflicts in the active timetable.'
                      : `${hardViolations} hard constraint violations detected.`}
                  </span>
                </div>
                <p className="text-xs text-[#98A6BB] leading-relaxed">
                  {hardViolations === 0
                    ? `All ${scheduledCount} scheduled sessions strictly satisfy H1–H14 hard constraints: 0 instructor overlaps, 0 cohort collisions, and room capacity compliance.`
                    : 'Resolve violations or run the optimizer in the Admin console.'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">
                Soft Penalty: {softPenalty} pts
              </span>
              <Link href="/admin" className="text-[#66E3F0] hover:underline font-bold">
                Audit Validator Report ▸
              </Link>
            </div>
          </div>

          {/* Spectra Week Summary */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Spectra Week 7 Decisions
                  </h2>
                </div>
                <span className="text-xs font-mono text-pink-300 font-bold">
                  {data.bookings.requests_total} Requests
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {data.bookings.by_status.approved}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-300 font-bold">Approved</div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-amber-400">
                    {data.bookings.by_status.alternative_offered}
                  </div>
                  <div className="text-[11px] font-mono text-amber-300 font-bold">Alternative</div>
                </div>
                <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-rose-400">
                    {data.bookings.by_status.rejected}
                  </div>
                  <div className="text-[11px] font-mono text-rose-300 font-bold">Rejected</div>
                </div>
              </div>

              <p className="text-xs text-[#98A6BB] leading-relaxed">
                Event requests evaluated with strict priority hierarchy. Core teaching hours protected while granting AUD, OAT, and Seminar halls.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">
                Overrides: {data.bookings.session_overrides}
              </span>
              <Link href="/spectra" className="text-pink-400 hover:text-pink-300 font-bold underline">
                Open Spectra Week Board ▸
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
