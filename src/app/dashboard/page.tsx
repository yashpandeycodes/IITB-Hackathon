import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import {
  ShieldCheck,
  Lock,
  Building,
  Calendar,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata = {
  title: 'Operational Command Console — CIT Nexus',
  description: 'Protected campus operations dashboard with Role-Based Access Control.',
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

  const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    Admin: { bg: 'bg-[#ef4444]/20', text: 'text-[#fca5a5]', border: 'border-[#ef4444]/50' },
    'Department Coordinator': { bg: 'bg-[#fbbf24]/20', text: 'text-[#fde047]', border: 'border-[#fbbf24]/50' },
    Faculty: { bg: 'bg-[#38bdf8]/20', text: 'text-[#7dd3fc]', border: 'border-[#38bdf8]/50' },
    'Club Representative': { bg: 'bg-[#c084fc]/20', text: 'text-[#fbcfe8]', border: 'border-[#c084fc]/50' },
  };

  const currentRoleStyle = roleColors[session.role] || {
    bg: 'bg-white/10',
    text: 'text-white',
    border: 'border-white/20',
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-8 px-4 sm:px-6">
      <CrazyBackground />

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/10 relative z-10">
        <Link href="/" className="flex items-center gap-2">
          <CITLogo size="md" />
        </Link>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#14062e] border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
            <span className="text-xs font-mono font-bold text-white">SECURE SESSION ACTIVE</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="max-w-7xl mx-auto w-full flex-1 relative z-10 my-8">
        {/* Welcome Banner */}
        <div className="p-8 sm:p-10 rounded-3xl bg-[#0f0426]/90 border-2 border-[#a855f7]/40 shadow-2xl backdrop-blur-3xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 mb-3 text-xs font-mono font-bold text-[#fbbf24]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AUTHENTICATED CAMPUS OPERATOR</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">
              Welcome, {session.name}
            </h1>
            <p className="text-sm sm:text-base text-[#cbd5e1] font-medium mt-1">
              Signed in with institutional identity: <strong className="text-white">{session.email}</strong>
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div
              className={`px-5 py-2.5 rounded-2xl border-2 font-mono text-sm font-black uppercase tracking-wider ${currentRoleStyle.bg} ${currentRoleStyle.text} ${currentRoleStyle.border} shadow-lg`}
            >
              CLEARANCE: {session.role}
            </div>
            <span className="text-xs font-mono text-[#34d399] flex items-center gap-1 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> OTP VERIFIED IDENTITY
            </span>
          </div>
        </div>

        {/* RBAC Sector Access Test Matrix */}
        <div className="p-8 rounded-3xl bg-[#0e0321]/80 border-2 border-[#fbbf24]/30 shadow-2xl backdrop-blur-2xl mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3">
                <Lock className="w-6 h-6 text-[#fbbf24]" />
                <span>Live RBAC Sector Clearance Verification</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#cbd5e1] font-medium mt-1">
                Test your role clearance against secured routes protected by Next.js Middleware. If unauthorized, the middleware will block access.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/40">
              MIDDLEWARE L3 ENFORCEMENT
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {/* Admin Sector */}
            <Link
              href="/admin"
              className="p-5 rounded-2xl bg-[#14062e] border-2 border-white/10 hover:border-[#ef4444] transition-all hover:scale-105 group"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-black text-white">/admin Sector</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/20 text-[#fca5a5] border border-[#ef4444]/40 font-bold">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] font-medium mb-4">
                Institute-wide policies, global room masters, and audit telemetry.
              </p>
              <span className="text-xs font-mono font-bold text-[#ef4444] flex items-center gap-1">
                <span>Test Access</span> &rarr;
              </span>
            </Link>

            {/* Coordinator Sector */}
            <Link
              href="/coordinator"
              className="p-5 rounded-2xl bg-[#14062e] border-2 border-white/10 hover:border-[#fbbf24] transition-all hover:scale-105 group"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-black text-white">/coordinator Sector</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/20 text-[#fde047] border border-[#fbbf24]/40 font-bold">
                  DEPT COORD
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] font-medium mb-4">
                Curriculum timetables, lab cohorts, and society venue signoff.
              </p>
              <span className="text-xs font-mono font-bold text-[#fbbf24] flex items-center gap-1">
                <span>Test Access</span> &rarr;
              </span>
            </Link>

            {/* Faculty Sector */}
            <Link
              href="/faculty"
              className="p-5 rounded-2xl bg-[#14062e] border-2 border-white/10 hover:border-[#38bdf8] transition-all hover:scale-105 group"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-black text-white">/faculty Sector</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#38bdf8]/20 text-[#7dd3fc] border border-[#38bdf8]/40 font-bold">
                  FACULTY
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] font-medium mb-4">
                Course schedules, lecture room reallocations, and student counts.
              </p>
              <span className="text-xs font-mono font-bold text-[#38bdf8] flex items-center gap-1">
                <span>Test Access</span> &rarr;
              </span>
            </Link>

            {/* Club Sector */}
            <Link
              href="/club"
              className="p-5 rounded-2xl bg-[#14062e] border-2 border-white/10 hover:border-[#c084fc] transition-all hover:scale-105 group"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-black text-white">/club Sector</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#c084fc]/20 text-[#fbcfe8] border border-[#c084fc]/40 font-bold">
                  CLUB REP
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] font-medium mb-4">
                Society requisitions, tech workshops, and auditorium booking pipeline.
              </p>
              <span className="text-xs font-mono font-bold text-[#c084fc] flex items-center gap-1">
                <span>Test Access</span> &rarr;
              </span>
            </Link>
          </div>
        </div>

        {/* Live Operational Metrics & Sector Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#14062e]/90 border-2 border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-4 text-[#fbbf24]">
              <Calendar className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">Assigned Schedule</h3>
            </div>
            <p className="text-sm text-[#cbd5e1] leading-relaxed mb-4">
              Real-time synchronization with the CIT Nexus master solver. 0 schedule clashes detected for your profile.
            </p>
            <div className="text-xs font-mono text-[#34d399] font-bold">
              STATUS: LATEST REVISION SYNCED
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-[#14062e]/90 border-2 border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-4 text-[#c084fc]">
              <Building className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">Venue Clearance</h3>
            </div>
            <p className="text-sm text-[#cbd5e1] leading-relaxed mb-4">
              Access permissions allocated for 68 institute spaces according to your {session.role} governance role.
            </p>
            <div className="text-xs font-mono text-[#c084fc] font-bold">
              SMART ACCESS TOKEN: ISSUED
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-[#14062e]/90 border-2 border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-4 text-[#38bdf8]">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">Security Telemetry</h3>
            </div>
            <p className="text-sm text-[#cbd5e1] leading-relaxed mb-4">
              JWT session encrypted via HS256 algorithm with HTTP-only cookie storage and 7-day automated rolling expiry.
            </p>
            <div className="text-xs font-mono text-[#38bdf8] font-bold">
              ENCRYPTION: HARDENED
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono font-bold text-[#cbd5e1] relative z-10">
        <div>CIT Nexus • Campus Operations Command • Chilika Institute of Technology</div>
        <div className="text-[#34d399]">RBAC ENFORCED • BREVO OTP VERIFIED</div>
      </footer>
    </div>
  );
}
