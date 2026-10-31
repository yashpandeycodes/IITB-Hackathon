'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { CampusNetworkVisual } from './campus-network-visual';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background Spatial Atmosphere */}
      <div className="absolute inset-0 campus-grid-bg opacity-30 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-[#66E3F0]/10 via-[#8279FF]/08 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Editorial Headline & Messaging */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            {/* Status Indicator */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#66E3F0]/25 mb-6 text-xs font-mono text-[#98A6BB]"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#66E3F0] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#66E3F0]" />
              </span>
              <span className="text-[#66E3F0] font-semibold tracking-wide">CAMPUS OPERATIONS, CONNECTED</span>
              <span className="text-white/20">|</span>
              <span className="text-[#F4F7FB]/70 text-[11px]">A unified view of campus operations</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#F4F7FB] leading-[1.08] mb-6"
            >
              Every campus resource.{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#66E3F0] via-[#8279FF] to-[#F4F7FB]">
                One intelligent system.
              </span>
            </motion.h1>

            {/* Supporting Copy */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-[#98A6BB] leading-relaxed max-w-xl mb-8"
            >
              CIT Nexus brings timetables, examinations, rooms and campus events into one coordinated workspace—so every hour and every space works smarter.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4 w-full sm:w-auto"
            >
              <a
                href="#product-preview"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm text-[#070A12] bg-[#66E3F0] hover:bg-[#7ff0fc] transition-all duration-200 shadow-[0_0_25px_-5px_rgba(102,227,240,0.5)] hover:shadow-[0_0_35px_0px_rgba(102,227,240,0.7)] group"
              >
                <span>Explore the platform</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </a>

              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-medium text-sm text-[#F4F7FB] bg-[#101A2B] hover:bg-[#152238] border border-[#F4F7FB]/12 hover:border-[#66E3F0]/40 transition-all duration-200"
              >
                Create your account
              </Link>
            </motion.div>

            {/* Understated Proof & Architecture Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.45 }}
              className="mt-10 pt-6 border-t border-[#F4F7FB]/08 grid grid-cols-3 gap-4 w-full"
            >
              <div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#F4F7FB]">68</div>
                <div className="text-xs text-[#98A6BB]">Campus Spaces Managed</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#66E3F0]">0</div>
                <div className="text-xs text-[#98A6BB]">Double-Booking Clashes</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#8279FF]">100%</div>
                <div className="text-xs text-[#98A6BB]">Human Review Authority</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Signature Spatial Campus Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-6 relative"
          >
            <CampusNetworkVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
