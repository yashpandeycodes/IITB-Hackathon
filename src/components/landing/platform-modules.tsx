'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  GraduationCap,
  Building,
  RotateCcw,
  Bot,
  CheckCircle2,
  Shield,
  Layers,
} from 'lucide-react';
import { CORE_MODULES } from '@/lib/mock-data';

export const PlatformModules: React.FC = () => {
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);

  const modules = [
    {
      ...CORE_MODULES[0],
      icon: CalendarDays,
      badgeText: 'MULTI-COHORT OPTIMIZER',
      visualType: 'timetabling-matrix',
      glow: 'rgba(56, 189, 248, 0.4)',
    },
    {
      ...CORE_MODULES[1],
      icon: GraduationCap,
      badgeText: 'INTEGRITY PROTOCOL',
      visualType: 'exam-seating',
      glow: 'rgba(192, 132, 252, 0.4)',
    },
    {
      ...CORE_MODULES[2],
      icon: Building,
      badgeText: 'MULTI-TIER GOVERNANCE',
      visualType: 'venue-workflow',
      glow: 'rgba(251, 191, 36, 0.4)',
    },
    {
      ...CORE_MODULES[3],
      icon: RotateCcw,
      badgeText: 'CASCADE MITIGATION',
      visualType: 'disruption-radar',
      glow: 'rgba(244, 63, 94, 0.4)',
    },
    {
      ...CORE_MODULES[4],
      icon: Bot,
      badgeText: 'AUGMENTED ASSISTANT',
      visualType: 'ai-copilot-draft',
      glow: 'rgba(52, 211, 153, 0.4)',
    },
  ];

  return (
    <section id="platform-modules" className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#c084fc]/50 mb-5 text-sm font-mono font-bold text-[#c084fc] shadow-[0_0_20px_rgba(168,85,247,0.3)]">
            <Layers className="w-4 h-4 text-[#c084fc]" />
            <span>CORE PLATFORM MODULES</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight mb-6">
            Five specialized modules.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] animate-shimmer-text">
              One shared operational core.
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            Engineered specifically to solve the distinct logistical layers of university life, from daily lectures to large-scale semester finals.
          </p>
        </div>

        {/* Dynamic Selector Tabs */}
        <div className="flex items-center justify-start lg:justify-center gap-3 overflow-x-auto pb-4 mb-12 no-scrollbar">
          {modules.map((mod, idx) => {
            const Icon = mod.icon;
            const isSelected = activeModuleIndex === idx;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveModuleIndex(idx)}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all duration-300 border-2 ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#21094f] to-[#3b0d73] text-white border-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.6)] scale-105'
                    : 'bg-[#12052b]/70 text-[#cbd5e1] border-[#a855f7]/30 hover:text-white hover:border-[#a855f7]/70'
                }`}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: isSelected ? '#fbbf24' : mod.accentColor }}
                />
                <span>{mod.title}</span>
              </button>
            );
          })}
        </div>

        {/* Detailed Spotlight Display for Active Module */}
        {(() => {
          const current = modules[activeModuleIndex];
          const Icon = current.icon;
          return (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-3xl bg-gradient-to-b from-[#13062e] via-[#0d0321] to-[#060114] border-2 border-[#a855f7]/40 p-8 sm:p-12 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-3xl"
            >
              {/* Background ambient light */}
              <div
                className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[140px] opacity-20 pointer-events-none"
                style={{ backgroundColor: current.accentColor }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                {/* Left Description & Features */}
                <div className="lg:col-span-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <span
                        className="text-xs font-mono font-black tracking-widest px-3 py-1.5 rounded-lg border-2 shadow-sm"
                        style={{
                          backgroundColor: `${current.accentColor}20`,
                          borderColor: `${current.accentColor}60`,
                          color: current.accentColor,
                        }}
                      >
                        {current.badgeText}
                      </span>
                      <span className="text-sm font-mono font-bold text-[#fbbf24]">MODULE 0{activeModuleIndex + 1}</span>
                    </div>

                    <h3 className="text-3xl sm:text-4xl font-black text-white mb-3 flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-white/10" style={{ color: current.accentColor }}>
                        <Icon className="w-8 h-8 shrink-0" />
                      </div>
                      <span>{current.title}</span>
                    </h3>
                    
                    <div
                      className="text-base sm:text-lg font-mono font-bold mb-5"
                      style={{ color: current.accentColor }}
                    >
                      {current.subtitle}
                    </div>

                    <p className="text-base sm:text-lg text-[#f1f5f9] leading-relaxed mb-8 font-medium">
                      {current.description}
                    </p>

                    {/* Feature Checklist */}
                    <div className="space-y-3.5 mb-10">
                      {current.features.map((feat, i) => (
                        <div key={i} className="flex items-start gap-3.5 text-base font-semibold text-white">
                          <CheckCircle2
                            className="w-5 h-5 mt-0.5 shrink-0"
                            style={{ color: current.accentColor }}
                          />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Technical rule note */}
                  <div className="p-4 rounded-2xl bg-[#080214] border border-[#a855f7]/30 text-sm font-mono font-bold text-[#cbd5e1] flex items-center gap-3 shadow-inner">
                    <Shield className="w-5 h-5 text-[#fbbf24] shrink-0" />
                    <span>{current.technicalDetail}</span>
                  </div>
                </div>

                {/* Right Interactive Visual Demonstration */}
                <div className="lg:col-span-6">
                  <div className="rounded-3xl bg-[#070114] border-2 border-white/15 p-6 sm:p-8 shadow-2xl">
                    {/* Visual 1: Timetabling */}
                    {current.visualType === 'timetabling-matrix' && (
                      <div className="space-y-4 font-mono text-sm">
                        <div className="flex items-center justify-between text-white pb-3 border-b border-white/15">
                          <span className="text-[#38bdf8] font-black text-base">CONSTRAINT MATRIX EVALUATION</span>
                          <span className="text-[#34d399] font-bold">STATUS: 0 CLASHES</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center text-xs">
                          <div className="p-3.5 rounded-xl bg-[#14082e] border border-white/10">
                            <div className="text-[#cbd5e1] text-[11px] font-bold">FACULTY LOAD</div>
                            <div className="text-white font-black text-sm mt-1">100% Balanced</div>
                          </div>
                          <div className="p-3.5 rounded-xl bg-[#14082e] border border-white/10">
                            <div className="text-[#cbd5e1] text-[11px] font-bold">ROOM SUITABILITY</div>
                            <div className="text-[#38bdf8] font-black text-sm mt-1">Tiered / Lab Synced</div>
                          </div>
                          <div className="p-3.5 rounded-xl bg-[#14082e] border border-white/10">
                            <div className="text-[#cbd5e1] text-[11px] font-bold">COHORT BUFFER</div>
                            <div className="text-[#34d399] font-black text-sm mt-1">15m Travel Window</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#14082e]/80 border-2 border-[#38bdf8]/40 space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-white font-bold">CS-301 (82 std) &rarr; LH 204</span>
                            <span className="text-[#34d399] font-black">VERIFIED PASS</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-white font-bold">EC-204 (68 std) &rarr; LH 102</span>
                            <span className="text-[#34d399] font-black">VERIFIED PASS</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-white font-bold">CS-342 (60 std) &rarr; Turing Lab</span>
                            <span className="text-[#34d399] font-black">VERIFIED PASS</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 2: Exam Planning */}
                    {current.visualType === 'exam-seating' && (
                      <div className="space-y-4 font-mono text-sm">
                        <div className="flex items-center justify-between text-white pb-3 border-b border-white/15">
                          <span className="text-[#c084fc] font-black text-base">EXAM SPATIAL COMPLIANCE</span>
                          <span className="text-[#fbbf24] font-bold">SARABHAI AUDITORIUM</span>
                        </div>
                        <div className="p-4 rounded-xl bg-[#14082e] border border-[#c084fc]/40 flex items-center justify-between">
                          <span className="text-white font-bold">Density: 1 Seat Spacing Ratio</span>
                          <span className="text-[#c084fc] font-black">PASS (1:1 Alternating)</span>
                        </div>
                        <div className="grid grid-cols-6 gap-2 py-2">
                          {Array.from({ length: 18 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-9 rounded-lg flex items-center justify-center text-xs font-black ${
                                i % 2 === 0
                                  ? 'bg-[#c084fc]/30 text-[#fbcfe8] border-2 border-[#c084fc]/60 shadow-[0_0_10px_rgba(192,132,252,0.4)]'
                                  : 'bg-white/[0.04] text-[#cbd5e1]/40 border border-white/10'
                              }`}
                            >
                              {i % 2 === 0 ? `R${i + 1}` : 'VAC'}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-[#cbd5e1] font-bold flex justify-between pt-2 border-t border-white/10">
                          <span>Invigilator Ratio: 1:30 (14 Assigned)</span>
                          <span className="text-[#34d399]">Roll Numbers Masked</span>
                        </div>
                      </div>
                    )}

                    {/* Visual 3: Venue & Event Management */}
                    {current.visualType === 'venue-workflow' && (
                      <div className="space-y-4 font-mono text-sm">
                        <div className="flex items-center justify-between text-white pb-3 border-b border-white/15">
                          <span className="text-[#fbbf24] font-black text-base">VENUE WORKFLOW LIFECYCLE</span>
                          <span className="text-white font-bold">REQ #892</span>
                        </div>
                        <div className="space-y-2.5">
                          <div className="p-3.5 rounded-xl bg-[#14082e] border-l-4 border-[#34d399] flex items-center justify-between">
                            <div>
                              <div className="text-white font-bold text-sm">1. Society Submission</div>
                              <div className="text-xs text-[#cbd5e1]">Robotics Club • Drone Swarm Workshop</div>
                            </div>
                            <span className="text-xs font-black text-[#34d399]">COMPLETED</span>
                          </div>
                          <div className="p-3.5 rounded-xl bg-[#14082e] border-l-4 border-[#34d399] flex items-center justify-between">
                            <div>
                              <div className="text-white font-bold text-sm">2. Hard Rules Engine</div>
                              <div className="text-xs text-[#cbd5e1]">Zero Class Overlaps • Quota Verified</div>
                            </div>
                            <span className="text-xs font-black text-[#34d399]">PASSED</span>
                          </div>
                          <div className="p-3.5 rounded-xl bg-[#14082e] border-l-4 border-[#fbbf24] flex items-center justify-between">
                            <div>
                              <div className="text-white font-bold text-sm">3. Department Signoff</div>
                              <div className="text-xs text-[#cbd5e1]">HOD Computer Science Review</div>
                            </div>
                            <span className="text-xs font-black text-[#fbbf24] animate-pulse">PENDING REVIEW</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 4: Disruption Radar */}
                    {current.visualType === 'disruption-radar' && (
                      <div className="space-y-4 font-mono text-sm">
                        <div className="flex items-center justify-between text-white pb-3 border-b border-white/15">
                          <span className="text-[#f43f5e] font-black text-base">DYNAMIC REPAIR CANDIDATE RANKING</span>
                          <span className="text-white font-bold">LH 204 OUTAGE</span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#f43f5e]/20 border border-[#f43f5e]/50 flex items-center justify-between text-xs font-bold">
                          <span className="text-[#fca5a5]">Trigger: Sudden Compressor Outage</span>
                          <span className="text-white">Displaced: 82 Students</span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="p-3 rounded-xl bg-[#14082e] border-2 border-[#34d399] flex justify-between items-center">
                            <span className="text-white font-bold">1. Seminar Hall 1 (Cap 120)</span>
                            <span className="text-[#34d399] font-black">MATCH 99.4% • 0 RIPPLES</span>
                          </div>
                          <div className="p-3 rounded-xl bg-[#14082e]/50 border border-white/10 flex justify-between items-center opacity-60">
                            <span className="text-[#cbd5e1]">2. Sarabhai Aud (Cap 450)</span>
                            <span className="text-[#f87171]">REJECTED • 14:00 Clash</span>
                          </div>
                          <div className="p-3 rounded-xl bg-[#14082e]/50 border border-white/10 flex justify-between items-center opacity-60">
                            <span className="text-[#cbd5e1]">3. LH 102 (Cap 75)</span>
                            <span className="text-[#f87171]">REJECTED • Cap Shortfall</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 5: AI Copilot */}
                    {current.visualType === 'ai-copilot-draft' && (
                      <div className="space-y-4 font-mono text-sm">
                        <div className="flex items-center justify-between text-white pb-3 border-b border-white/15">
                          <span className="text-[#34d399] font-black text-base">NATURAL LANGUAGE &rarr; DRAFT SCHEMA</span>
                          <span className="text-[#fbbf24] font-bold">HUMAN IN THE LOOP</span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#14082e] text-[#cbd5e1] text-xs italic border border-white/10">
                          &ldquo;Need a big tiered hall this Thursday after 2pm for alumni guest talk, around 350 people with stage mics.&rdquo;
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#080214] border border-[#34d399]/40 space-y-1.5 text-xs">
                          <div className="text-[#34d399] font-black">GENERATED DRAFT REQUISITION:</div>
                          <div className="text-white">Venue: Sarabhai Central Auditorium (Cap 450)</div>
                          <div className="text-white">Time: Thursday 14:00 – 16:00 (2 hrs)</div>
                          <div className="text-white">Equipment Flag: 2x Wireless Stage Mics + Audio Console</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#fbbf24]/15 border border-[#fbbf24]/30 text-xs font-bold text-[#fde047]">
                          Deterministic Rule: Booking not saved until authorized administrator clicks Approve.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </div>
    </section>
  );
};
