import React from 'react';
import Link from 'next/link';
import { CITLogo } from '@/components/brand/logo';
import { SignupForm } from '@/components/auth/signup-form';
import { AuthSidePanel } from '@/components/auth/auth-side-panel';
import { ArrowLeft, Shield } from 'lucide-react';
import { CrazyBackground } from '@/components/landing/crazy-background';

export const metadata = {
  title: 'Sign Up — CIT Nexus Command',
  description: 'Request institutional access to the CIT Nexus campus operations platform.',
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#080D1B] text-[#F8FAFC] relative overflow-hidden py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      {/* Dynamic Animated Cosmic Aurora & Grid Background */}
      <CrazyBackground />

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between mb-8 sm:mb-10 relative z-10 pb-4 border-b border-white/[0.08]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-mono font-medium text-[#A7B3C9] hover:text-[#F8FAFC] transition-all py-2 px-3.5 rounded-xl bg-[#0D1426]/90 border border-white/[0.08] hover:border-[#6366F1]/50 shadow-sm group backdrop-blur-md"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2] transition-transform group-hover:-translate-x-1" />
          <span>Back to Landing</span>
        </Link>

        <Link href="/">
          <CITLogo size="sm" showSubtitle={false} />
        </Link>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0D1426]/90 border border-white/[0.08] text-[11px] font-mono text-[#10B981] font-medium backdrop-blur-md">
          <Shield className="w-3.5 h-3.5 text-[#10B981]" />
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
      <footer className="max-w-7xl mx-auto w-full text-center text-xs font-mono text-[#A7B3C9]/70 relative z-10 pt-6 border-t border-white/[0.08] mt-8">
        Chilika Institute of Technology • High-Precision Campus Operations Platform • End-to-End Cryptographic Security
      </footer>
    </div>
  );
}
