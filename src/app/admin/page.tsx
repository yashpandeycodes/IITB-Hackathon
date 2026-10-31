import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { ShieldCheck, ArrowLeft, Sliders, Database, Server } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata = {
  title: 'Administrator Command Sector — CIT Nexus',
  description: 'Institute-wide global master administration.',
};

export default async function AdminSectorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session || session.role !== 'Admin') {
    redirect('/unauthorized?role=' + (session?.role || 'Guest') + '&attemptedSector=/admin');
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-8 px-4 sm:px-6">
      <CrazyBackground />

      {/* Top Header */}
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

      {/* Admin Sector Content */}
      <main className="max-w-7xl mx-auto w-full flex-1 relative z-10 my-8">
        <div className="p-8 sm:p-10 rounded-3xl bg-[#180518]/90 border-2 border-[#ef4444]/60 shadow-[0_0_50px_rgba(239,68,68,0.25)] backdrop-blur-3xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/50 mb-3 text-xs font-mono font-bold text-[#fca5a5]">
            <ShieldCheck className="w-4 h-4 text-[#ef4444]" />
            <span>ROOT ADMINISTRATOR LEVEL CLEARANCE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            Institute Administration Sector
          </h1>
          <p className="text-base text-[#cbd5e1] font-medium mt-1">
            Operator: <strong className="text-white">{session.name}</strong> ({session.email}) • Full Policy Authority
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Sliders className="w-8 h-8 text-[#ef4444] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Global Rule Configuration</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Define academic term dates, maximum teaching hours per faculty, and emergency override quotas.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Database className="w-8 h-8 text-[#fbbf24] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Venue Master Registry</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Provision 68 physical rooms, capacity caps, audio-visual specs, and maintenance schedules.
            </p>
          </div>
          <div className="p-6 rounded-3xl bg-[#12042b]/90 border-2 border-white/10 shadow-xl">
            <Server className="w-8 h-8 text-[#34d399] mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Audit Telemetry & Access Logs</h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Cryptographic audit logs tracking all schedule modifications, solver runs, and venue approvals.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10">
        CIT Nexus • Admin Sector • Role-Based Access Control Confirmed
      </footer>
    </div>
  );
}
