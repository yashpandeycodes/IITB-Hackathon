'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

export const FinalCTA: React.FC = () => {
  return (
    <section className="relative py-20 lg:py-32 overflow-hidden border-t border-[#F4F7FB]/08 bg-gradient-to-b from-[#070A12] via-[#0B1220] to-[#070A12]">
      {/* Background Spatial Lighting */}
      <div className="absolute inset-0 campus-grid-bg opacity-20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-r from-[#66E3F0]/15 via-[#8279FF]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Subtle Brand Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#66E3F0]/20 mb-6 text-xs font-mono text-[#66E3F0]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>CHILIKA INSTITUTE OF TECHNOLOGY</span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#F4F7FB] tracking-tight leading-tight mb-6">
          Make every room, hour, and{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#66E3F0] via-[#8279FF] to-[#F4F7FB]">
            decision count.
          </span>
        </h2>

        {/* Supporting Copy */}
        <p className="text-base sm:text-lg text-[#98A6BB] max-w-2xl mx-auto mb-10 leading-relaxed">
          Bring campus scheduling and venue coordination into one clearer workflow. Explore the next generation of academic spatial intelligence.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-bold text-sm text-[#070A12] bg-[#66E3F0] hover:bg-[#7ff0fc] transition-all duration-200 shadow-[0_0_30px_-5px_rgba(102,227,240,0.5)] hover:shadow-[0_0_40px_0px_rgba(102,227,240,0.7)] group"
          >
            <span>Get started</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-[#F4F7FB] bg-[#101A2B] hover:bg-[#152238] border border-[#F4F7FB]/12 hover:border-[#66E3F0]/40 transition-all duration-200"
          >
            <span>Log in to portal</span>
          </Link>
        </div>

        {/* Micro note */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs font-mono text-[#98A6BB]">
          <ShieldCheck className="w-4 h-4 text-[#66E3F0]" />
          <span>Frontend Demonstration Prototype • Client-Side Evaluation Only</span>
        </div>
      </div>
    </section>
  );
};
