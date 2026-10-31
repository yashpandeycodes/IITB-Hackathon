import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { AppShell } from '@/components/layout/app-shell';
import { Calendar, CheckCircle2, Shuffle, Building, ArrowRight } from 'lucide-react';
import { MOCK_CHANGE_REQUESTS } from '@/lib/dataset/cit-data';

export const metadata = {
  title: 'Coordinator Operations — CIT Nexus',
  description: 'Departmental timetable planning and venue reviews.',
};

export default async function CoordinatorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Department Coordinator' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/coordinator');
  }

  return (
    <AppShell
      userRole={session.role}
      userName={session.name}
      userEmail={session.email}
      pageTitle="Department Coordinator Hub"
      breadcrumbs={[{ label: 'Coordinator' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-amber-500/30 shadow-lg">
          <h1 className="text-2xl font-bold text-white">CSE Department Timetable Governance</h1>
          <p className="text-xs font-mono text-[#98A6BB] mt-1">
            Coordinate cohorts (Y1-A, CSE-2, CSE-3), approve department lab requests, and submit instructor leaves.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <Link
              href="/timetable/group/Y1-A"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#66E3F0]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#66E3F0] mb-1">
                <Calendar className="w-4 h-4" />
                <span>Cohort Y1-A Timetable</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">65 Students · Autumn 2026 Core</div>
            </Link>

            <Link
              href="/approvals"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-[#8279FF]/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#8279FF] mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pending Approvals (3)</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Review F07 leave and CS-LAB-2 booking</div>
            </Link>

            <Link
              href="/changes/new"
              className="p-4 rounded-2xl bg-[#101A2B] border border-white/5 hover:border-emerald-500/40 transition-colors block"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 mb-1">
                <Shuffle className="w-4 h-4" />
                <span>Submit Faculty Leave</span>
              </div>
              <div className="text-[11px] text-[#98A6BB]">Automated minimal disruption repair</div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
