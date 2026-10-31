'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

export const FinalCTA: React.FC = () => {
  return (
    <section className="relative py-28 lg:py-44 overflow-hidden border-t border-[#a855f7]/30">
      {/* Background Lighting Flare */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[450px] bg-gradient-to-r from-[#9333ea]/35 via-[#ec4899]/30 to-[#fbbf24]/20 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Brand Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#180738] border-2 border-[#fbbf24]/50 mb-8 text-sm font-mono font-bold text-[#fde047] shadow-[0_0_20px_rgba(251,191,36,0.3)]">
          <Sparkles className="w-4 h-4 text-[#fbbf24]" />
          <span>CHILIKA INSTITUTE OF TECHNOLOGY</span>
        </div>

        {/* Headline */}
        <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.05] mb-8 drop-shadow-2xl">
          Make every room, hour, and{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] animate-shimmer-text">
            decision count.
          </span>
        </h2>

        {/* Supporting Copy */}
        <p className="text-lg sm:text-xl lg:text-2xl text-[#f1f5f9] max-w-3xl mx-auto mb-12 leading-relaxed font-medium">
          Bring campus scheduling and venue coordination into one clearer workflow. Experience the next generation of academic spatial intelligence.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link
            href="/signup"
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-base text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all duration-300 shadow-[0_0_40px_rgba(217,70,239,0.7)] hover:shadow-[0_0_60px_rgba(251,191,36,0.9)] hover:scale-105 transform-gpu group"
          >
            <span>Get started today</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5] transition-transform group-hover:translate-x-1.5" />
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2.5 px-10 py-5 rounded-2xl font-bold text-base text-white bg-[#150730]/90 hover:bg-[#230c4e] border-2 border-[#a855f7]/40 hover:border-[#fbbf24] transition-all duration-300 shadow-xl hover:scale-105 transform-gpu"
          >
            <span>Log in to portal</span>
          </Link>
        </div>

        {/* Micro note */}
        <div className="mt-12 flex items-center justify-center gap-2.5 text-sm font-mono font-bold text-[#cbd5e1]">
          <ShieldCheck className="w-4 h-4 text-[#34d399]" />
          <span>Frontend Demonstration Prototype • Client-Side Evaluation Only</span>
        </div>
      </div>
    </section>
  );
};
