'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface AuthSidePanelProps {
  mode?: 'signup' | 'login' | 'otp';
}

export const AuthSidePanel: React.FC<AuthSidePanelProps> = ({ mode = 'signup' }) => {
  const telemetryNodes = [
    {
      code: 'LH 204',
      name: 'Lecture Hall 204',
      status: 'In Session',
      detail: 'CS-301 Advanced Algorithms',
      capacity: '82/90 Enrolled',
      accent: '#38bdf8',
      bgAccent: 'rgba(56, 189, 248, 0.15)',
      borderAccent: 'rgba(56, 189, 248, 0.4)',
    },
    {
      code: 'TURING LAB',
      name: 'Turing Computing Lab',
      status: 'Exam Reserved',
      detail: 'AI & Distributed Systems Lab',
      capacity: '65 GPU Nodes Active',
      accent: '#c084fc',
      bgAccent: 'rgba(192, 132, 252, 0.15)',
      borderAccent: 'rgba(192, 132, 252, 0.4)',
    },
    {
      code: 'AUDITORIUM',
      name: 'Sarabhai Auditorium',
      status: 'Ready',
      detail: 'Spectra Week 7 Coordination',
      capacity: '600 Tiered Seats',
      accent: '#fbbf24',
      bgAccent: 'rgba(251, 191, 36, 0.15)',
      borderAccent: 'rgba(251, 191, 36, 0.4)',
    },
  ];

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
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] text-xs font-black tracking-widest uppercase">
            CHILIKA INSTITUTE OF TECHNOLOGY
          </span>
          <span className="text-white/30">|</span>
          <span className="text-white text-xs font-mono font-bold">SECURE GATEWAY</span>
        </motion.div>

        {/* Big Impact Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6"
        >
          {mode === 'signup' && (
            <>
              Campus operations,{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
                unified in real time.
              </span>
            </>
          )}
          {mode === 'login' && (
            <>
              Welcome back to{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
                CIT Nexus Command.
              </span>
            </>
          )}
          {mode === 'otp' && (
            <>
              Identity verification,{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
                cryptographically secured.
              </span>
            </>
          )}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base xl:text-lg text-[#cbd5e1] leading-relaxed mb-8 font-medium max-w-lg"
        >
          CIT Nexus coordinates timetables, room schedules, departmental sign-offs, and fest bookings with zero hard constraint violations.
        </motion.p>

        {/* Live Campus Telemetry Widget */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="rounded-3xl bg-[#0e0424]/90 border-2 border-[#a855f7]/30 p-6 shadow-[0_15px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl mb-8 relative overflow-hidden group"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#c084fc]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34d399] shadow-[0_0_8px_#34d399] animate-pulse" />
              <span className="text-xs font-mono font-black text-white tracking-wider uppercase">
                Live Campus Telemetry
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#c084fc] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
              SPRING 2027 • WEEK 7
            </span>
          </div>

          {/* Node Cards */}
          <div className="space-y-3">
            {telemetryNodes.map((node) => (
              <div
                key={node.code}
                className="p-3.5 rounded-2xl bg-[#14062e]/80 border border-white/10 hover:border-white/20 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black text-xs shrink-0"
                    style={{
                      backgroundColor: node.bgAccent,
                      color: node.accent,
                      border: `1px solid ${node.borderAccent}`,
                    }}
                  >
                    {node.code.split(' ')[0]}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{node.name}</span>
                    </div>
                    <div className="text-[11px] text-[#94a3b8] font-medium">{node.detail}</div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className="inline-block text-[10px] font-mono font-black px-2 py-0.5 rounded-full mb-0.5 uppercase tracking-wider"
                    style={{
                      backgroundColor: node.bgAccent,
                      color: node.accent,
                      border: `1px solid ${node.borderAccent}`,
                    }}
                  >
                    {node.status}
                  </span>
                  <div className="text-[10px] font-mono text-white/50">{node.capacity}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Security Feature Micro-Badges */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="p-3.5 rounded-2xl bg-[#12052e]/80 border border-[#a855f7]/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#c084fc]/10 border border-[#c084fc]/30 flex items-center justify-center text-[#c084fc] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Brevo 2FA Verified</div>
              <div className="text-[11px] text-[#94a3b8]">6-digit OTP delivery</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#12052e]/80 border border-[#a855f7]/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/30 flex items-center justify-center text-[#fbbf24] shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">RBAC Governance</div>
              <div className="text-[11px] text-[#94a3b8]">4 Institutional tiers</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quote at Bottom */}
      <div className="pt-8 border-t border-white/10 mt-8">
        <p className="text-xs font-mono text-[#94a3b8] italic">
          &ldquo;Intelligence proposes. Constraints decide.&rdquo;
        </p>
        <span className="text-[11px] font-mono font-bold text-[#c084fc] uppercase tracking-wider block mt-1">
          CIT Core Operational Protocol
        </span>
      </div>
    </div>
  );
};

