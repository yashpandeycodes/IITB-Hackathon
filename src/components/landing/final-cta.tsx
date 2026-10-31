'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { MagneticButton } from '@/components/ui/magnetic-button';

export const FinalCTA: React.FC = () => {
  return (
    <section className="relative py-24 lg:py-36 overflow-hidden border-t border-white/[0.08]">
      {/* Subtle Indigo/Cyan Ambient Lighting Glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] rounded-full blur-[130px] pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, rgba(34, 211, 238, 0.18) 60%, transparent 80%)',
        }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Brand Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-white/[0.08] mb-6 text-xs font-mono font-semibold text-[#22D3EE] shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-[#22D3EE]" />
          <span>CHILIKA INSTITUTE OF TECHNOLOGY</span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#F8FAFC] tracking-tight leading-[1.1] mb-6">
          Make every room, hour, and{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
            decision count.
          </span>
        </h2>

        {/* Supporting Copy */}
        <p className="text-base sm:text-lg text-[#A7B3C9] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Bring campus scheduling and venue coordination into one clear, reliable workflow. Experience the next generation of academic operational intelligence.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <MagneticButton strength={0.3}>
            <Link href="/signup">
              <MovingBorderButton
                borderRadius="0.875rem"
                className="px-7 py-3.5 text-sm font-bold bg-[#0D1426] text-white hover:bg-[#111B30] transition-colors gap-2.5 shadow-xl shadow-[#6366F1]/20"
              >
                <span>Request Institutional Access</span>
                <ArrowRight className="w-4 h-4 text-[#22D3EE]" />
              </MovingBorderButton>
            </Link>
          </MagneticButton>

          <MagneticButton strength={0.25}>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-[#F8FAFC] bg-[#111B30] hover:bg-[#16233E] border border-white/[0.1] hover:border-[#6366F1]/50 transition-all duration-200 shadow-sm"
            >
              <span>Sign In to Console</span>
            </Link>
          </MagneticButton>
        </div>

        {/* Security / Verification Pill */}
        <div className="mt-10 flex items-center justify-center gap-2 text-xs font-mono text-[#A7B3C9]">
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          <span>Enterprise-grade RBAC & End-to-End Cryptographic Security</span>
        </div>
      </div>
    </section>
  );
};
