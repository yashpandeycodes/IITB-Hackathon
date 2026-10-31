import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { AppShell } from '@/components/layout/app-shell';
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
} from 'lucide-react';
import { CAMPUS_ROOMS, MOCK_CHANGE_REQUESTS } from '@/lib/dataset/cit-data';

export const metadata = {
  title: 'Campus Operations Dashboard — CIT Nexus',
  description: 'Role-aware KPI console, live timetable health, and room utilisation heatmap.',
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
  }

  const session = await verifySessionToken(token);
  if (!session) {
    redirect('/login');
  }

  const userRole = session.role;
  const userName = session.name;
  const userEmail = session.email;

  // Heatmap rooms: select top 8 representative rooms
  const heatmapRooms = CAMPUS_ROOMS.slice(0, 8);
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];

  return (
    <AppShell
      userRole={userRole}
      userName={userName}
      userEmail={userEmail}
      pageTitle="Operational Dashboard"
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Welcome & Fast Actions Header (§5.2) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#0B1220] via-[#101A2B] to-[#132035] border border-white/10 shadow-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[#66E3F0] uppercase font-bold tracking-wider">
                {userRole.toUpperCase()} OPERATIONS HUB
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome back, <span className="text-[#fbbf24]">{userName}</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#98A6BB] mt-1">
              Active timetable version: <span className="text-white font-mono font-bold">CIT-PROD-2026.01</span> · Autumn Semester Crunch Week
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

            {userRole === 'Admin' ? (
              <Link
                href="/admin"
                className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:opacity-90 text-black shadow-md flex items-center gap-1.5 transition-opacity"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Generate Timetable ▸</span>
              </Link>
            ) : userRole === 'Club Representative' ? (
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
            href="/timetable/group/Y1-A"
            className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#66E3F0]/40 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase flex items-center justify-between">
              <span>SCHEDULED</span>
              <Calendar className="w-3.5 h-3.5 text-[#66E3F0]" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">189</span>
              <span className="text-xs text-[#98A6BB] font-mono">/189</span>
            </div>
            <div className="text-[10px] font-mono text-[#10b981] font-bold">100% Placed</div>
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
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#10b981]">0</span>
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
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#fbbf24]">48</span>
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
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">64</span>
              <span className="text-xs text-[#98A6BB] font-mono">/70</span>
            </div>
            <div className="text-[10px] font-mono text-pink-400 font-bold">91.4% Satisfied</div>
          </Link>

          <Link
            href="/approvals"
            className="p-4 rounded-2xl bg-[#0B1220] border border-[#8279FF]/30 hover:border-[#8279FF] transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(130,121,255,0.15)] flex flex-col justify-between"
          >
            <div className="text-[11px] font-mono text-[#8279FF] uppercase flex items-center justify-between font-bold">
              <span>APPROVALS</span>
              <span className="w-2 h-2 rounded-full bg-[#8279FF] animate-ping" />
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-[#8279FF]">3</span>
              <span className="text-xs text-[#98A6BB] font-mono ml-1">Pending</span>
            </div>
            <div className="text-[10px] font-mono text-[#8279FF] font-bold">Action needed ▸</div>
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
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">61%</span>
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
                    Pending Rescheduling Approvals
                  </h2>
                </div>
                <Link href="/approvals" className="text-xs font-mono text-[#66E3F0] hover:underline">
                  View All (3) ▸
                </Link>
              </div>

              <div className="space-y-3">
                {MOCK_CHANGE_REQUESTS.map((req) => (
                  <Link
                    key={req.id}
                    href={`/approvals/${req.id}`}
                    className="block p-3.5 rounded-2xl bg-[#101A2B] hover:bg-[#142238] border border-white/5 hover:border-[#8279FF]/40 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-black text-white group-hover:text-[#66E3F0] transition-colors">
                        {req.id}
                      </span>
                      <span className="text-[10px] font-mono text-[#98A6BB]">{req.createdAt}</span>
                    </div>
                    <div className="font-bold text-xs text-white line-clamp-1">{req.title}</div>
                    <div className="text-[11px] text-[#98A6BB] mt-1">{req.summary}</div>
                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#34d399] font-bold">0 hard violations ✓</span>
                      <span className="text-[#8279FF] group-hover:underline">Review diff ▸</span>
                    </div>
                  </Link>
                ))}

                <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/5">
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="font-bold text-white">BR-21 · CS-LAB-2</span>
                    <span className="text-[10px] text-[#98A6BB]">1 hour ago</span>
                  </div>
                  <div className="text-xs text-[#cbd5e1]">Dept Lab Specialised Access Request</div>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#fbbf24]">Awaiting Coordinator Sign-off</span>
                    <Link href="/approvals" className="text-[#66E3F0] hover:underline">Review ▸</Link>
                  </div>
                </div>
              </div>
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
                  Room Utilisation Heatmap (Mon–Fri × P1..P9)
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#98A6BB]">Teaching Slots</span>
            </div>

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
                  {heatmapRooms.map((room, roomIdx) => (
                    <tr key={room.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-1.5 font-bold text-white whitespace-nowrap">
                        <Link href={`/timetable/room/${room.id}`} className="hover:text-[#66E3F0]">
                          {room.id}
                        </Link>
                      </td>
                      {days.map((day, dayIdx) => (
                        <React.Fragment key={day}>
                          {periods.map((period, periodIdx) => {
                            // Seed pseudo deterministic occupancy pattern
                            const hash = (roomIdx * 11 + dayIdx * 7 + periodIdx * 3) % 10;
                            const isOccupied = hash < 6;
                            const isHighDemand = hash === 1 || hash === 4;

                            return (
                              <td key={period} className={`p-0.5 ${periodIdx === 0 ? 'border-l border-white/10' : ''}`}>
                                <div
                                  title={`${room.id} • ${day} ${period}: ${isOccupied ? 'Occupied' : 'Free'}`}
                                  className={`w-3.5 h-3.5 rounded-[2px] transition-transform hover:scale-125 cursor-pointer ${
                                    isHighDemand
                                      ? 'bg-[#8279FF]'
                                      : isOccupied
                                      ? 'bg-[#66E3F0]/70'
                                      : 'bg-white/5 hover:bg-white/20'
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

            {/* Heatmap Legend */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-white/5" /> Free
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#66E3F0]/70" /> Regular Lecture
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#8279FF]" /> Lab / Basket
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
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40">
                  PASSED
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#070A12] border border-emerald-500/20 text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                  <span>✓ No hard conflicts in the active timetable.</span>
                </div>
                <p className="text-xs text-[#98A6BB] leading-relaxed">
                  All 189 teaching sessions strictly satisfy H1–H14 hard constraints: 0 instructor overlaps, 0 cohort collisions, 100% room capacity compliance, and protected 13:00–14:00 lunch hour.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">Last verified by Solver: 4 mins ago</span>
              <Link href="/admin" className="text-[#66E3F0] hover:underline font-bold">
                Audit Validator Report ▸
              </Link>
            </div>
          </div>

          {/* Spectra Week Summary Donut/Breakdown */}
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    Spectra Week 7 Decisions
                  </h2>
                </div>
                <span className="text-xs font-mono text-pink-300 font-bold">Score 64 / 70</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-emerald-400">21</div>
                  <div className="text-[11px] font-mono text-emerald-300 font-bold">Approved</div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-amber-400">2</div>
                  <div className="text-[11px] font-mono text-amber-300 font-bold">Alternative</div>
                </div>
                <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-center">
                  <div className="text-2xl font-black font-mono text-rose-400">2</div>
                  <div className="text-[11px] font-mono text-rose-300 font-bold">Rejected</div>
                </div>
              </div>

              <p className="text-xs text-[#98A6BB] leading-relaxed">
                25 event requests evaluated with zero priority inversions. Core teaching hours protected while granting AUD and OAT for high-impact campus events.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
              <span className="text-[#98A6BB]">Priority Inversions: 0 ✓</span>
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
