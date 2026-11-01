import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, SESSION_EXPIRED_PATH } from '@/lib/auth/server-session';
import { AppShell } from '@/components/layout/app-shell';
import { Calendar, Bot, CalendarOff, Shuffle, GitPullRequestArrow } from 'lucide-react';

export const metadata = {
  title: 'Faculty Portal — CIT Nexus',
  description: 'Faculty teaching assignments, unavailabilities, and AI timetable assistant.',
};

export default async function FacultyPage() {
  const user = await getSessionUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);

  if (user.role !== 'faculty' && user.role !== 'admin') {
    redirect('/unauthorized?role=' + user.role + '&attemptedSector=/faculty');
  }

  const scheduleHref = user.faculty_id
    ? `/timetable/faculty/${encodeURIComponent(user.faculty_id)}`
    : '/timetable';

  return (
    <AppShell
      userRole={user.role}
      userName={user.name}
      userEmail={user.email}
      pageTitle="Faculty Operations Portal"
      breadcrumbs={[{ label: 'Faculty' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-sky-500/30 shadow-lg">
          <h1 className="text-2xl font-bold text-white">Academic Faculty Console</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            Your teaching week, leave and change requests. Every change is checked against the hard rules and
            approved by an admin before it goes live.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            <Link
              href={scheduleHref}
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <Calendar className="w-4 h-4" />
                <span>My Teaching Schedule</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Your week in the active timetable</div>
            </Link>

            <Link
              href="/changes/new?tab=unavailability"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-amber-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 mb-1">
                <CalendarOff className="w-4 h-4" />
                <span>Mark Unavailability</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Leave or days you can&apos;t teach; classes move with the fewest moves</div>
            </Link>

            <Link
              href="/changes/new?tab=move"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-emerald-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 mb-1">
                <Shuffle className="w-4 h-4" />
                <span>Move or Add a Session</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Request a moved or extra session, checked live against hard rules</div>
            </Link>

            <Link
              href="/changes"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <GitPullRequestArrow className="w-4 h-4" />
                <span>My Change Requests</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Status of what you filed; withdraw a pending one</div>
            </Link>

            <Link
              href="/assistant"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#8279FF]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#8279FF] mb-1">
                <Bot className="w-4 h-4" />
                <span>AI Scheduling Assistant</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Natural language rescheduling with verified options</div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
