import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { Layers, ArrowLeft, PlusCircle, CheckCircle2, Building } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata = {
  title: 'Club Representative Sector — CIT Nexus',
  description: 'Student society event requisitions and booking pipeline.',
};

export default async function ClubSectorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || (session.role !== 'Club Representative' && session.role !== 'Admin')) {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/club');
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
        <div className="p-8 sm:p-10 rounded-3xl bg-[#1b0838]/90 border-2 border-[#c084fc]/60 shadow-[0_0_50px_rgba(192,132,252,0.25)] backdrop-blur-3xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c084fc]/20 border border-[#c084fc]/50 mb-3 text-xs font-mono font-bold text-[#fbcfe8]">
            <Layers className="w-4 h-4 text-[#c084fc]" />
            <span>CLUB REPRESENTATIVE CLEARANCE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            Student Society Requisitions
          </h1>
          <p className="text-base text-[#cbd5e1] font-medium mt-1">
            Society Lead: <strong className="text-white">{session.name}</strong> • Role: {session.role}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <PlusCircle className="w-8 h-8 text-[#c084fc] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Draft New Event Request</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Book auditoriums, workshop labs, or open amphitheaters for hackathons and symposiums.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <CheckCircle2 className="w-8 h-8 text-[#34d399] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Approval Pipeline</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Track department chair and faculty dean signoffs in real-time with constraint score diagnostics.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Building className="w-8 h-8 text-[#fbbf24] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Space Availability Map</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Query open time slots across central campus spaces without waiting for paper requisitions.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10">
        CIT Nexus • Club Sector • RBAC Verified
      </footer>
    </div>
  );
}
