'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { CampusNetworkVisual } from './campus-network-visual';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { MagneticButton } from '@/components/ui/magnetic-button';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
      {/* Subtle Ambient Radial Lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-r from-[#6366F1]/15 to-[#22D3EE]/15 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Typography, Value Proposition & CTAs */}
          <div className="lg:col-span-7 flex flex-col justify-center text-left">
            {/* System Status Eyebrow Badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-white/[0.1] text-xs font-mono font-medium text-[#22D3EE] mb-6 w-fit shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22D3EE]" />
              </span>
              <span>Chilika Institute of Technology • Operations Topology v2.4</span>
            </motion.div>

            {/* Word-by-Word Revealed Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#F8FAFC] leading-[1.1] mb-6">
              <TextGenerateEffect
                words="Every campus resource. One intelligent system."
                highlightWord="system."
                highlightClassName="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]"
                duration={0.6}
              />
            </h1>

            {/* Supporting Copy */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
              className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed max-w-2xl mb-8"
            >
              Centralize timetabling matrices, examination seatings, venue requisitions, and live disruption repair into one coordinated digital command center.
              Intelligence proposes. Deterministic constraints decide.
            </motion.p>

            {/* CTA Group with Moving Border and Magnetic Effects */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
              className="flex flex-wrap items-center gap-4 mb-10"
            >
              <MagneticButton strength={0.3}>
                <Link href="/login">
                  <MovingBorderButton
                    borderRadius="0.875rem"
                    className="px-6 py-3 text-sm font-bold bg-[#0D1426] text-white hover:bg-[#111B30] transition-colors gap-2.5 shadow-lg shadow-[#6366F1]/15"
                  >
                    <span>Launch Command Console</span>
                    <ArrowRight className="w-4 h-4 text-[#22D3EE]" />
                  </MovingBorderButton>
                </Link>
              </MagneticButton>

              <MagneticButton strength={0.2}>
                <a
                  href="#platform-modules"
                  className="px-6 py-3 rounded-xl border border-white/[0.12] bg-[#0D1426]/60 hover:bg-[#0D1426] text-sm font-semibold text-[#A7B3C9] hover:text-[#F8FAFC] transition-all"
                >
                  Explore Architecture &rarr;
                </a>
              </MagneticButton>
            </motion.div>

            {/* Institutional Trust Metrics Bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.65 }}
              className="pt-6 border-t border-white/[0.08] flex flex-wrap items-center gap-6 text-xs font-mono text-[#A7B3C9]"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span className="text-[#F8FAFC] font-semibold">189 Sessions</span>
                <span className="text-[#A7B3C9]/70">Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#22D3EE]" />
                <span className="text-[#F8FAFC] font-semibold">27 Venues</span>
                <span className="text-[#A7B3C9]/70">Mapped</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#6366F1]" />
                <span className="text-[#F8FAFC] font-semibold">0 Clashes</span>
                <span className="text-[#A7B3C9]/70">Week 7 Verified</span>
              </div>
            </motion.div>
          </div>

          {/* Right Column: 3D Campus Topology Radar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
            className="lg:col-span-5 relative"
          >
            <CampusNetworkVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
