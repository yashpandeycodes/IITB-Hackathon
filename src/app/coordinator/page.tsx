import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { Network, ArrowLeft, Calendar, Users, ClipboardCheck } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata = {
  title: 'Department Coordinator Sector — CIT Nexus',
  description: 'Departmental timetable planning and venue reviews.',
};

export default async function CoordinatorSectorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Department Coordinator' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/coordinator');
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-8 px-4 sm:px-6">
      <CrazyBackground />

      <header className="max-w-7xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/10 relative z-10">
        <Link href="/" className="flex items-center gap-2">
          <CITLogo size="md" />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-[#14062e] border border-white/10 hover:border-[#fbbf24]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1 relative z-10 my-8">
        <div className="p-8 sm:p-10 rounded-3xl bg-[#1f1505]/90 border-2 border-[#fbbf24]/60 shadow-[0_0_50px_rgba(251,191,36,0.25)] backdrop-blur-3xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#fbbf24]/20 border border-[#fbbf24]/50 mb-3 text-xs font-mono font-bold text-[#fde047]">
            <Network className="w-4 h-4 text-[#fbbf24]" />
            <span>DEPARTMENT COORDINATOR CLEARANCE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            Academic Department Operations
          </h1>
          <p className="text-base text-[#cbd5e1] font-medium mt-1">
            Planner: <strong className="text-white">{session.name}</strong> • Role: {session.role}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Calendar className="w-8 h-8 text-[#fbbf24] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Curriculum Timetables</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Build zero-clash term timetables for engineering batches, tutorial cohorts, and specialized labs.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <ClipboardCheck className="w-8 h-8 text-[#34d399] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Club Venue Requisitions</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Review and sign off on student society hackathons and workshops requesting department premises.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Users className="w-8 h-8 text-[#38bdf8] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Faculty Workload Balance</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Balance teaching hours, credit assignments, and research consultation buffers across professors.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10">
        CIT Nexus • Department Coordinator Sector • RBAC Verified
      </footer>
    </div>
  );
}
