'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Building,
  Calendar,
  Ticket,
} from 'lucide-react';

interface AuthSidePanelProps {
  mode?: 'signup' | 'login' | 'otp';
}

export const AuthSidePanel: React.FC<AuthSidePanelProps> = ({ mode = 'signup' }) => {
  return (
    <div className="hidden lg:flex flex-col justify-between h-full pr-8">
      <div>
        {/* Top Eyebrow Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#c084fc]/50 mb-6 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fbbf24] opacity-80" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#fbbf24]" />
          </span>
          <span className="text-xs font-mono font-bold tracking-wider text-[#fbbf24] uppercase">
            CAMPUS OPERATIONS COMMAND
          </span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-4 tracking-tight"
        >
          <span className="text-[#fbbf24]">Crunch Week</span>: <br />
          <span className="bg-gradient-to-r from-white via-[#e879f9] to-[#38bdf8] bg-clip-text text-transparent">
            Zero clashes in Week 7.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-sm xl:text-base text-[#cbd5e1] leading-relaxed mb-6 font-medium"
        >
          CIT Nexus is the institutional command centre for Chilika Institute of Technology.
          Automated multi-objective constraint timetable scheduling, instant disruption repair, and clash-free Spectra fest coordination.
        </motion.p>

        {/* Three Stat Pills From Dataset (§5.1) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-3 gap-3 mb-8"
        >
          <div className="p-3.5 rounded-2xl bg-[#0f0524]/90 border border-[#a855f7]/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#a855f7] mb-1 font-bold">
              <Calendar className="w-3.5 h-3.5 text-[#fbbf24]" />
              SESSIONS
            </div>
            <div className="text-2xl font-black text-white font-mono">189</div>
            <div className="text-[10px] text-[#cbd5e1]/70">Scheduled 100%</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0f0524]/90 border border-[#38bdf8]/30 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#38bdf8] mb-1 font-bold">
              <Building className="w-3.5 h-3.5 text-[#38bdf8]" />
              ROOMS
            </div>
            <div className="text-2xl font-black text-white font-mono">27</div>
            <div className="text-[10px] text-[#cbd5e1]/70">All mapped</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0f0524]/90 border border-[#e879f9]/30 shadow-[0_0_15px_rgba(232,121,249,0.2)]">
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#e879f9] mb-1 font-bold">
              <Ticket className="w-3.5 h-3.5 text-[#fbbf24]" />
              SPECTRA
            </div>
            <div className="text-2xl font-black text-white font-mono">25</div>
            <div className="text-[10px] text-[#cbd5e1]/70">Event decisions</div>
          </div>
        </motion.div>

        {/* Live Constraint Engine Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="p-4 rounded-2xl bg-gradient-to-br from-[#12052b] to-[#1c0840] border border-white/10 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse shadow-[0_0_8px_#10b981]" />
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                ACTIVE SOLVER HEALTH
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40">
              0 HARD VIOLATIONS ✓
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono text-[#cbd5e1]">
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span>H1..H14 Hard Constraints</span>
              <span className="text-[#34d399] font-bold">PASSED (14/14)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span>S1..S6 Soft Penalty Score</span>
              <span className="text-[#fbbf24] font-bold">48 pts (Optimal)</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Spectra Booking Score</span>
              <span className="text-[#38bdf8] font-bold">64 / 70 Sat.</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Institutional Footer Badge */}
      <div className="pt-6 border-t border-white/10 flex items-center justify-between text-xs font-mono text-[#cbd5e1]/60">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#fbbf24]" />
          <span>RBAC Authenticated Portal</span>
        </div>
        <span>v2.4.0 Nexus Core</span>
      </div>
    </div>
  );
};
