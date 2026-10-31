import React from 'react';
import Link from 'next/link';
import { CITLogo } from '@/components/brand/logo';
import { SignupForm } from '@/components/auth/signup-form';
import { AuthSidePanel } from '@/components/auth/auth-side-panel';
import { ArrowLeft } from 'lucide-react';
import { CrazyBackground } from '@/components/landing/crazy-background';

export const metadata = {
  title: 'Sign Up — CIT Nexus Command',
  description: 'Request institutional access to the CIT Nexus campus operations platform.',
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      {/* Dynamic Animated Cosmic Background */}
      <CrazyBackground />

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between mb-8 sm:mb-12 relative z-10 pb-4 border-b border-white/10">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-mono font-bold text-[#cbd5e1] hover:text-[#fbbf24] transition-all py-2 px-3.5 rounded-xl bg-[#14062e]/80 border border-white/10 hover:border-[#fbbf24] shadow-md group"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2.5] transition-transform group-hover:-translate-x-1" />
          <span>Back to Command Center</span>
        </Link>

        <Link href="/">
          <CITLogo size="sm" showSubtitle={false} />
        </Link>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14062e]/80 border border-white/10 text-[11px] font-mono text-[#34d399] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#34d399] shadow-[0_0_8px_#34d399] animate-pulse" />
          <span>TLS 1.3 SECURE ENCLAVE</span>
        </div>
      </header>

      {/* Main Split Content Area */}
      <main className="max-w-7xl mx-auto w-full flex-1 flex items-center justify-center relative z-10 my-4">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Live Campus Telemetry & Platform Pitch */}
          <div className="lg:col-span-6">
            <AuthSidePanel mode="signup" />
          </div>

          {/* Right Column: High-Impact Glowing Auth Form */}
          <div className="lg:col-span-6">
            <SignupForm />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center text-xs font-mono font-bold text-[#cbd5e1]/60 relative z-10 pt-8 border-t border-white/10 mt-8">
        Chilika Institute of Technology • High-Precision Campus Operations Platform • End-to-End Cryptographic Security
      </footer>
    </div>
  );
}
