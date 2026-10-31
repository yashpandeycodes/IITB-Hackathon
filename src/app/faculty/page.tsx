import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { AppShell } from '@/components/layout/app-shell';
import { Calendar, Bot, Shuffle, Building2, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Faculty Portal — CIT Nexus',
  description: 'Faculty teaching assignments, unavailabilities, and AI timetable assistant.',
};

export default async function FacultyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Faculty' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/faculty');
  }

  return (
    <AppShell
      userRole={session.role}
      userName={session.name}
      userEmail={session.email}
      pageTitle="Faculty Operations Portal"
      breadcrumbs={[{ label: 'Faculty' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-sky-500/30 shadow-lg">
          <h1 className="text-2xl font-bold text-white">Academic Faculty Console</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            Personal teaching schedule, constraint-checked lecture relocations, and automated room discovery.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <Link
              href="/timetable/group/Y1-A"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <Calendar className="w-4 h-4" />
                <span>My Teaching Schedule</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">12 hours/week · 0 clash guarantee</div>
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

            <Link
              href="/changes/new"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-amber-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 mb-1">
                <Shuffle className="w-4 h-4" />
                <span>Request Lecture Change</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Submit leave or time preference changes</div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
