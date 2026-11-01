import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, SESSION_EXPIRED_PATH } from '@/lib/auth/server-session';
import { AppShell } from '@/components/layout/app-shell';
import { Calendar, CheckCircle2, CalendarOff, Move, GitPullRequestArrow } from 'lucide-react';

export const metadata = {
  title: 'Coordinator Operations — CIT Nexus',
  description: 'Departmental timetable planning and venue reviews.',
};

export default async function CoordinatorPage() {
  const user = await getSessionUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);

  if (user.role !== 'department_coordinator' && user.role !== 'admin') {
    redirect('/unauthorized?role=' + user.role + '&attemptedSector=/coordinator');
  }

  const department = user.department ?? (user.role === 'admin' ? 'All departments' : 'Department');

  return (
    <AppShell
      userRole={user.role}
      userName={user.name}
      userEmail={user.email}
      pageTitle="Department Coordinator Hub"
      breadcrumbs={[{ label: 'Coordinator' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-amber-500/30 shadow-lg">
          <h1 className="text-2xl font-bold text-white">{department} Timetable Governance</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            Request changes to your department&apos;s sessions: faculty leave, manual placements, extra or removed
            sessions and lab closures. An admin approves each proposal before it goes live.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            <Link
              href="/timetable"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <Calendar className="w-4 h-4" />
                <span>Timetables</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Group, faculty and room weeks</div>
            </Link>

            <Link
              href="/approvals"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#8279FF]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#8279FF] mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pending Approvals</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Review change proposals and lab booking requests</div>
            </Link>

            <Link
              href="/changes/new?tab=unavailability"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-amber-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 mb-1">
                <CalendarOff className="w-4 h-4" />
                <span>Submit Faculty Leave</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Minimal-move repair, previewed before you file it</div>
            </Link>

            <Link
              href="/changes/new?tab=move"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-emerald-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 mb-1">
                <Move className="w-4 h-4" />
                <span>Manual Placement</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Pin a session to a slot; hard rules checked live</div>
            </Link>

            <Link
              href="/changes"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <GitPullRequestArrow className="w-4 h-4" />
                <span>Change Requests</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Everything touching your department, with its status</div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
