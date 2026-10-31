import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';

interface UnauthorizedPageProps {
  searchParams: Promise<{
    role?: string;
    attemptedSector?: string;
  }>;
}

export const metadata = {
  title: 'Access Restricted — CIT Nexus RBAC',
  description: 'Role-Based Access Control security boundary warning.',
};

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const params = await searchParams;
  const role = params.role || 'Restricted';
  const attemptedSector = params.attemptedSector || 'Protected Zone';

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-12 px-4 sm:px-6">
      <CrazyBackground />

      {/* Top Header */}
      <div className="max-w-6xl mx-auto w-full flex items-center justify-between relative z-10 mb-8">
        <Link href="/" className="flex items-center gap-2">
          <CITLogo size="sm" />
        </Link>
        <div className="text-xs font-mono font-bold text-[#f43f5e] bg-[#f43f5e]/15 border border-[#f43f5e]/40 px-3 py-1 rounded-full flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          <span>RBAC ENFORCEMENT ACTIVE</span>
        </div>
      </div>

      {/* Main Warning Box */}
      <main className="flex-1 flex items-center justify-center relative z-10 my-8">
        <div className="w-full max-w-xl mx-auto rounded-3xl bg-[#0f0426]/95 border-2 border-[#ef4444]/60 p-8 sm:p-12 shadow-[0_0_60px_rgba(239,68,68,0.35)] backdrop-blur-3xl text-center">
          <div className="inline-flex p-4 rounded-2xl bg-[#ef4444]/20 border border-[#ef4444]/50 text-[#f87171] mb-6 shadow-lg shadow-red-500/20">
            <ShieldAlert className="w-12 h-12" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
            Clearance Insufficient
          </h1>
          <p className="text-base text-[#cbd5e1] font-medium leading-relaxed mb-6">
            Your authenticated session role does not have authorization to inspect or execute operations in this sector.
          </p>

          {/* Diagnostic Info Box */}
          <div className="p-4 rounded-2xl bg-[#070114] border border-white/10 text-left font-mono text-xs space-y-2 mb-8">
            <div className="flex justify-between items-center text-white">
              <span className="text-[#cbd5e1]">YOUR ACTIVE ROLE:</span>
              <span className="text-[#fbbf24] font-bold px-2 py-0.5 rounded bg-white/10">{role}</span>
            </div>
            <div className="flex justify-between items-center text-white">
              <span className="text-[#cbd5e1]">RESTRICTED SECTOR:</span>
              <span className="text-[#f87171] font-bold">{attemptedSector}</span>
            </div>
            <div className="flex justify-between items-center text-[#34d399] pt-2 border-t border-white/10">
              <span>SECURITY PROTOCOL:</span>
              <span>DETERMINISTIC RBAC L3</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] to-[#fbbf24] shadow-lg hover:scale-105 transition-all"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
              <span>Return to My Dashboard</span>
            </Link>

            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-[#190938] hover:bg-[#280e59] border border-white/15"
            >
              <span>CIT Home</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10 pt-6">
        CIT Nexus • Role-Based Access Control • Chilika Institute of Technology
      </footer>
    </div>
  );
}
