import React from 'react';
import Link from 'next/link';
import { CITLogo } from '@/components/brand/logo';
import { CrazyBackground } from '@/components/landing/crazy-background';
import { Compass, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-8 px-4 sm:px-6">
      <CrazyBackground />

      <header className="max-w-7xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/10 relative z-10">
        <Link href="/">
          <CITLogo size="md" />
        </Link>
      </header>

      <main className="max-w-md mx-auto w-full text-center relative z-10 my-16 space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#8279FF]/20 border border-[#8279FF]/40 text-[#66E3F0] flex items-center justify-center mx-auto mb-2">
          <Compass className="w-8 h-8 animate-spin" />
        </div>
        <h1 className="text-4xl font-black font-mono text-white">404</h1>
        <h2 className="text-xl font-bold text-white">Sector Coordinates Not Found</h2>
        <p className="text-xs font-mono text-[#98A6BB] leading-relaxed">
          The requested campus operations endpoint does not exist or has been relocated by the constraint solver.
        </p>

        <div className="pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#66E3F0] text-[#070A12] font-mono text-xs font-bold shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full text-center text-xs font-mono text-white/40 relative z-10 pt-6 border-t border-white/10">
        CIT Nexus • Campus Command Architecture
      </footer>
    </div>
  );
}

