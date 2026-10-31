'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, CheckCircle2, Sparkles, Cpu } from 'lucide-react';
import { CampusNetworkVisual } from './campus-network-visual';

export const HeroSection: React.FC = () => {
  const headlineWords = ['Every', 'campus', 'resource.', 'One', 'intelligent', 'system.'];

  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
      {/* Subtle Ambient Radial Lighting */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(34, 211, 238, 0.12) 60%, transparent 80%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Institutional SaaS Typography & Messaging */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            {/* Top Eyebrow Badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(148,163,184,0.18)] mb-6 shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22D3EE]" />
              </span>
              <span className="text-[11px] font-mono font-bold tracking-wider text-[#22D3EE] uppercase">
                CAMPUS OPERATIONS PROTOCOL
              </span>
              <span className="text-white/20">|</span>
              <span className="text-[11px] text-[#A7B3C9] font-medium hidden sm:inline">
                Chilika Institute of Technology
              </span>
            </motion.div>

            {/* Word-by-Word Revealed Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-[#F8FAFC] leading-[1.08] mb-6">
              {headlineWords.map((word, index) => {
                const isHighlight = word === 'One' || word === 'intelligent' || word === 'system.';
                return (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      delay: 0.08 + index * 0.06,
                      ease: [0.21, 0.47, 0.32, 0.98],
                    }}
                    className={`inline-block mr-2.5 sm:mr-3 ${
                      isHighlight
                        ? 'text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]'
                        : ''
                    }`}
                  >
                    {word}
                  </motion.span>
                );
              })}
            </h1>

            {/* Supporting Explanation */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="text-base sm:text-lg text-[#A7B3C9] leading-relaxed max-w-xl mb-8 font-normal"
            >
              CIT Nexus unifies timetables, examinations, 27 physical venues, and student cohorts into one continuous constraint-checked workspace—preventing schedule conflicts before they happen.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="flex flex-wrap items-center gap-3.5 w-full sm:w-auto mb-10"
            >
              {/* Primary Moving Border / Accent Button */}
              <a
                href="#product-preview"
                className="w-full sm:w-auto relative inline-flex items-center justify-center p-[1px] overflow-hidden rounded-xl group focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50 shadow-[0_4px_20px_rgba(99,102,241,0.25)]"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-[#6366F1] via-[#22D3EE] to-[#6366F1] rounded-xl transition-all duration-300 opacity-90 group-hover:opacity-100" />
                <span className="relative flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-bold text-[#F8FAFC] bg-[#0D1426] rounded-[11px] transition-all duration-200 group-hover:bg-[#111B30]">
                  <span>Explore Live Console</span>
                  <ArrowRight className="w-4 h-4 text-[#22D3EE] transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </a>

              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-[#F8FAFC] bg-[#111B30] hover:bg-[#16233E] border border-[rgba(148,163,184,0.18)] hover:border-[#6366F1]/50 transition-all duration-200 shadow-sm"
              >
                <span>Request Account</span>
              </Link>
            </motion.div>

            {/* Institutional Trust Matrix Metrics Row */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.65 }}
              className="pt-6 border-t border-[rgba(148,163,184,0.12)] grid grid-cols-3 gap-4 w-full"
            >
              <div>
                <div className="text-xl sm:text-2xl font-black text-[#F8FAFC] font-mono">189</div>
                <div className="text-[11px] text-[#A7B3C9] mt-0.5">Academic Sessions</div>
              </div>

              <div>
                <div className="text-xl sm:text-2xl font-black text-[#22D3EE] font-mono">27</div>
                <div className="text-[11px] text-[#A7B3C9] mt-0.5">Monitored Venues</div>
              </div>

              <div>
                <div className="text-xl sm:text-2xl font-black text-[#10B981] font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  0
                </div>
                <div className="text-[11px] text-[#A7B3C9] mt-0.5">Week 7 Clashes</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: 3D Spatial Network Visual */}
          <div className="lg:col-span-6 flex justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="w-full"
            >
              <CampusNetworkVisual />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
