import React from 'react';
import Link from 'next/link';
import { CITLogo } from '@/components/brand/logo';
import { LoginForm } from '@/components/auth/login-form';
import { ArrowLeft } from 'lucide-react';
import { CrazyBackground } from '@/components/landing/crazy-background';

export const metadata = {
  title: 'Log In — CIT Nexus Command',
  description: 'Log in to the CIT Nexus campus operations platform (Frontend Prototype).',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#04010a] text-white relative overflow-hidden py-10 px-4 sm:px-6">
      {/* Background */}
      <CrazyBackground />

      {/* Top Bar with Back Link */}
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between mb-10 relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-sm font-mono font-bold text-[#cbd5e1] hover:text-[#fbbf24] transition-all p-2.5 rounded-xl bg-[#14062e]/80 border border-white/10 hover:border-[#fbbf24] shadow-md"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          <span>Back to Command Center</span>
        </Link>
        <Link href="/">
          <CITLogo size="sm" showSubtitle={false} />
        </Link>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center relative z-10 my-6">
        <LoginForm />
      </main>

      {/* Footer Disclaimer */}
      <footer className="text-center text-xs font-mono font-bold text-[#cbd5e1] relative z-10 pt-8">
        CIT Nexus • Frontend Prototype Demonstration • No credentials stored
      </footer>
    </div>
  );
}
