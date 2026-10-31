import React from 'react';
import Link from 'next/link';
import { CITLogo } from '@/components/brand/logo';
import { LoginForm } from '@/components/auth/login-form';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Log In — CIT Nexus',
  description: 'Log in to the CIT Nexus campus operations platform (Frontend Prototype).',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#070A12] text-[#F4F7FB] relative overflow-hidden py-8 px-4 sm:px-6">
      {/* Background Decor */}
      <div className="absolute inset-0 campus-grid-bg opacity-25 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#8279FF]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar with Back Link */}
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between mb-8 relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-[#98A6BB] hover:text-[#66E3F0] transition-colors p-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#66E3F0]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Landing Page</span>
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
      <footer className="text-center text-[11px] font-mono text-[#98A6BB]/70 relative z-10 pt-6">
        CIT Nexus • Frontend Prototype Demonstration • No credentials stored
      </footer>
    </div>
  );
}

