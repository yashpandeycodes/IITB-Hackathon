'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Building2,
  Calendar,
  Sparkles,
  Layers,
  CheckCircle2,
  Activity,
} from 'lucide-react';

interface AuthSidePanelProps {
  mode?: 'signup' | 'login' | 'otp';
}

export const AuthSidePanel: React.FC<AuthSidePanelProps> = ({ mode = 'signup' }) => {
  return (
    <div className="hidden lg:flex flex-col justify-between h-full pr-8 relative">
      {/* Background Ambient Radial Glow */}
      <div className="absolute top-1/3 left-1/4 w-[450px] h-[450px] bg-gradient-to-br from-[#6366F1]/15 via-[#22D3EE]/15 to-transparent rounded-full blur-[110px] pointer-events-none" />

      <div className="relative z-10">
        {/* Top Eyebrow Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-white/[0.1] mb-6 shadow-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22D3EE]" />
          </span>
          <span className="text-[11px] font-mono font-semibold tracking-wider text-[#22D3EE] uppercase">
            {mode === 'login' ? 'Institutional Access Gateway' : 'Campus Operations Command'}
          </span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl xl:text-5xl font-extrabold text-[#F8FAFC] leading-[1.12] mb-4 tracking-tight"
        >
          <span>Institutional control. </span>
          <br />
          <span className="bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE] bg-clip-text text-transparent">
            Zero schedule conflicts.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-sm xl:text-base text-[#A7B3C9] leading-relaxed mb-8 font-normal"
        >
          CIT Nexus is the unified institutional platform for Chilika Institute of Technology.
          Automated multi-objective timetable scheduling, instant disruption repair, and clash-free Spectra fest coordination.
        </motion.p>

        {/* Dynamic Topology Radar Graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="p-5 rounded-3xl bg-[#0D1426]/90 border border-white/[0.08] shadow-xl backdrop-blur-xl mb-6 relative overflow-hidden"
        >
          {/* Subtle Grid Pattern */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06] relative z-10">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#22D3EE] animate-pulse" />
              <span className="text-xs font-mono font-semibold text-[#F8FAFC] tracking-wide">
                CAMPUS MESH TELEMETRY
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
              VALIDATED (0 CLASHES)
            </span>
          </div>

          {/* Three Stat Cards */}
          <div className="grid grid-cols-3 gap-3 relative z-10">
            <div className="p-3.5 rounded-2xl bg-[#111B30] border border-white/[0.08]">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A7B3C9] mb-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-[#6366F1]" />
                SESSIONS
              </div>
              <div className="text-2xl font-bold text-[#F8FAFC] font-mono">189</div>
              <div className="text-[10px] text-[#A7B3C9]/70">Scheduled 100%</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#111B30] border border-white/[0.08]">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A7B3C9] mb-1 font-medium">
                <Building2 className="w-3.5 h-3.5 text-[#22D3EE]" />
                ROOMS
              </div>
              <div className="text-2xl font-bold text-[#F8FAFC] font-mono">27</div>
              <div className="text-[10px] text-[#A7B3C9]/70">All mapped</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#111B30] border border-white/[0.08]">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A7B3C9] mb-1 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
                SPECTRA
              </div>
              <div className="text-2xl font-bold text-[#F8FAFC] font-mono">25</div>
              <div className="text-[10px] text-[#A7B3C9]/70">Decisions</div>
            </div>
          </div>
        </motion.div>

        {/* Live Constraint Engine Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="p-5 rounded-3xl bg-[#0D1426]/90 border border-white/[0.08] relative overflow-hidden shadow-xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_8px_#10B981]" />
              <span className="text-xs font-mono font-semibold text-[#F8FAFC] tracking-wide">
                ACTIVE SOLVER INTEGRITY
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
              14/14 PASSED
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-[#A7B3C9]">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                H1–H14 Hard Constraints
              </span>
              <span className="text-[#10B981] font-semibold">100% SATISFIED</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#6366F1]" />
                S1–S6 Soft Penalty Score
              </span>
              <span className="text-[#F8FAFC] font-semibold">Active Minimization</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#22D3EE]" />
                Spectra Booking Satisfaction
              </span>
              <span className="text-[#22D3EE] font-semibold">Priority Evaluated</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Institutional Footer Badge */}
      <div className="pt-6 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono text-[#A7B3C9]/70 relative z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#6366F1]" />
          <span>RBAC Authenticated Portal</span>
        </div>
        <span>v2.4.0 Nexus Core</span>
      </div>
    </div>
  );
};
