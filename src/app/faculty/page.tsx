import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { GraduationCap, ArrowLeft, BookOpen, Clock, AlertCircle } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata = {
  title: 'Faculty Portal — CIT Nexus',
  description: 'Faculty schedule inspection and room requisitions.',
};

export default async function FacultySectorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Faculty' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/faculty');
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
        <div className="p-8 sm:p-10 rounded-3xl bg-[#081829]/90 border-2 border-[#38bdf8]/60 shadow-[0_0_50px_rgba(56,189,248,0.25)] backdrop-blur-3xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#38bdf8]/20 border border-[#38bdf8]/50 mb-3 text-xs font-mono font-bold text-[#7dd3fc]">
            <GraduationCap className="w-4 h-4 text-[#38bdf8]" />
            <span>FACULTY EDUCATOR CLEARANCE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            Teaching & Course Command
          </h1>
          <p className="text-base text-[#cbd5e1] font-medium mt-1">
            Instructor: <strong className="text-white">{session.name}</strong> • Role: {session.role}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <BookOpen className="w-8 h-8 text-[#38bdf8] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">My Teaching Schedule</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Real-time weekly timetable view with automated room direction and enrolled student counts.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Clock className="w-8 h-8 text-[#fbbf24] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Rescheduling Requisition</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Submit class time swaps or makeup lectures evaluated against student cohort zero-clash rules.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <AlertCircle className="w-8 h-8 text-[#f43f5e] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Flag Room Maintenance</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Report AC faults or projector errors to automatically trigger the Nexus Disruption Repair engine.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10">
        CIT Nexus • Faculty Sector • RBAC Verified
      </footer>
    </div>
  );
}
