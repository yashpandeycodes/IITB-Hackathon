'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { CampusNetworkVisual } from './campus-network-visual';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-36 pb-24 md:pt-48 md:pb-36 overflow-hidden">
      {/* Dynamic Ambient Lighting in Section */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[550px] bg-gradient-to-r from-[#9333ea]/25 via-[#ec4899]/20 to-[#fbbf24]/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Bold Editorial Typography & Messaging */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            {/* High-Impact Animated Eyebrow Badge */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#c084fc]/50 mb-6 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fbbf24] opacity-80" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#fbbf24]" />
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] text-xs sm:text-sm font-black tracking-widest uppercase">
                CAMPUS OPERATIONS, CONNECTED
              </span>
              <span className="text-white/30">|</span>
              <span className="text-white text-xs font-bold hidden sm:inline">
                A Unified View of Campus Operations
              </span>
            </motion.div>

            {/* Giant Head-Turning Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight text-white leading-[1.02] mb-6 drop-shadow-2xl"
            >
              Every campus resource.{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] animate-shimmer-text">
                One intelligent system.
              </span>
            </motion.h1>

            {/* Clear, High-Contrast Large Copy */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl lg:text-2xl text-[#f1f5f9] leading-relaxed max-w-2xl mb-10 font-medium"
            >
              CIT Nexus brings timetables, examinations, rooms and campus events into one coordinated workspace—so every hour and every space works smarter.
            </motion.p>

            {/* Bold Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-5 w-full sm:w-auto"
            >
              <a
                href="#product-preview"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-base text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all duration-300 shadow-[0_0_35px_rgba(217,70,239,0.6)] hover:shadow-[0_0_50px_rgba(251,191,36,0.8)] hover:scale-105 transform-gpu group"
              >
                <span>Explore the platform</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5] transition-transform group-hover:translate-x-1.5" />
              </a>

              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl font-bold text-base text-white bg-[#150730]/90 hover:bg-[#230c4e] border-2 border-[#a855f7]/40 hover:border-[#fbbf24] transition-all duration-300 shadow-xl hover:scale-105 transform-gpu"
              >
                <span>Create your account</span>
              </Link>
            </motion.div>

            {/* Large-Format Proof Metrics */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.45 }}
              className="mt-12 pt-8 border-t border-white/15 grid grid-cols-3 gap-6 w-full"
            >
              <div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-[#fbbf24] drop-shadow">
                  68
                </div>
                <div className="text-sm font-bold text-[#e2e8f0] mt-1">Campus Spaces Synced</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-[#c084fc] drop-shadow">
                  0
                </div>
                <div className="text-sm font-bold text-[#e2e8f0] mt-1">Room Clash Tolerance</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-[#34d399] drop-shadow">
                  100%
                </div>
                <div className="text-sm font-bold text-[#e2e8f0] mt-1">Human Signoff Control</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: 3D Interactive Spatial Campus Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-6 relative"
          >
            <CampusNetworkVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
