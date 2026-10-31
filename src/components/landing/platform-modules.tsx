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
    },
    {
      ...CORE_MODULES[1],
      icon: GraduationCap,
      badgeText: 'INTEGRITY PROTOCOL',
      visualType: 'exam-seating',
    },
    {
      ...CORE_MODULES[2],
      icon: Building,
      badgeText: 'MULTI-TIER GOVERNANCE',
      visualType: 'venue-workflow',
    },
    {
      ...CORE_MODULES[3],
      icon: RotateCcw,
      badgeText: 'CASCADE MITIGATION',
      visualType: 'disruption-radar',
    },
    {
      ...CORE_MODULES[4],
      icon: Bot,
      badgeText: 'AUGMENTED ASSISTANT',
      visualType: 'ai-copilot-draft',
    },
  ];

  return (
    <section id="platform-modules" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#8279FF]/25 mb-4 text-xs font-mono text-[#8279FF]">
            <Layers className="w-3.5 h-3.5" />
            <span>CORE PLATFORM MODULES</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight mb-4">
            Five specialized modules. One shared operational core.
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB]">
            Engineered specifically to solve the distinct logistical layers of university life, from daily lectures to large-scale semester finals.
          </p>
        </div>

        {/* Dynamic Selector Tabs (Mobile & Desktop) */}
        <div className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto pb-4 mb-10 no-scrollbar">
          {modules.map((mod, idx) => {
            const Icon = mod.icon;
            const isSelected = activeModuleIndex === idx;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveModuleIndex(idx)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                  isSelected
                    ? 'bg-[#101A2B] text-[#F4F7FB] border-[#66E3F0] shadow-[0_0_15px_-3px_rgba(102,227,240,0.3)]'
                    : 'bg-[#0B1220]/60 text-[#98A6BB] border-transparent hover:text-[#F4F7FB] hover:bg-[#101A2B]/40'
                }`}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: isSelected ? mod.accentColor : '#98A6BB' }}
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
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-3xl bg-gradient-to-b from-[#101A2B] to-[#0B1220] border border-[#F4F7FB]/12 p-6 sm:p-10 shadow-2xl relative overflow-hidden"
            >
              {/* Background ambient light */}
              <div
                className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none"
                style={{ backgroundColor: current.accentColor }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                {/* Left Description & Features */}
                <div className="lg:col-span-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="text-[10px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-md border"
                        style={{
                          backgroundColor: `${current.accentColor}15`,
                          borderColor: `${current.accentColor}40`,
                          color: current.accentColor,
                        }}
                      >
                        {current.badgeText}
                      </span>
                      <span className="text-xs font-mono text-[#98A6BB]">MODULE 0{activeModuleIndex + 1}</span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-extrabold text-[#F4F7FB] mb-2 flex items-center gap-3">
                      <Icon className="w-7 h-7 shrink-0" style={{ color: current.accentColor }} />
                      <span>{current.title}</span>
                    </h3>
                    <div
                      className="text-sm font-mono font-medium mb-4"
                      style={{ color: current.accentColor }}
                    >
                      {current.subtitle}
                    </div>

                    <p className="text-sm sm:text-base text-[#98A6BB] leading-relaxed mb-6">
                      {current.description}
                    </p>

                    {/* Feature Checklist */}
                    <div className="space-y-2.5 mb-8">
                      {current.features.map((feat, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#F4F7FB]/90">
                          <CheckCircle2
                            className="w-4 h-4 mt-0.5 shrink-0"
                            style={{ color: current.accentColor }}
                          />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Technical rule note */}
                  <div className="p-3.5 rounded-xl bg-[#070A12]/80 border border-white/06 text-xs font-mono text-[#98A6BB] flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#66E3F0] shrink-0" />
                    <span>{current.technicalDetail}</span>
                  </div>
                </div>

                {/* Right Interactive Visual Demonstration */}
                <div className="lg:col-span-6">
                  <div className="rounded-2xl bg-[#070A12] border border-[#F4F7FB]/10 p-5 sm:p-6 shadow-inner">
                    {/* Visual 1: Timetabling */}
                    {current.visualType === 'timetabling-matrix' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between text-[#98A6BB] pb-2 border-b border-white/10">
                          <span className="text-[#66E3F0] font-bold">CONSTRAINT MATRIX EVALUATION</span>
                          <span>STATUS: 0 CLASHES</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="p-2.5 rounded bg-[#101A2B] border border-white/05">
                            <div className="text-[#98A6BB] text-[10px]">FACULTY LOAD</div>
                            <div className="text-[#F4F7FB] font-bold mt-1">100% Balanced</div>
                          </div>
                          <div className="p-2.5 rounded bg-[#101A2B] border border-white/05">
                            <div className="text-[#98A6BB] text-[10px]">ROOM SUITABILITY</div>
                            <div className="text-[#66E3F0] font-bold mt-1">Tiered / Lab Synced</div>
                          </div>
                          <div className="p-2.5 rounded bg-[#101A2B] border border-white/05">
                            <div className="text-[#98A6BB] text-[10px]">COHORT BUFFER</div>
                            <div className="text-[#10B981] font-bold mt-1">15m Travel Window</div>
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#101A2B]/60 border border-[#66E3F0]/20 space-y-2">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-[#F4F7FB]">CS-301 (82 std) &rarr; LH 204</span>
                            <span className="text-[#10B981] font-bold">VERIFIED</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-[#F4F7FB]">EC-204 (68 std) &rarr; LH 102</span>
                            <span className="text-[#10B981] font-bold">VERIFIED</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-[#F4F7FB]">CS-342 (60 std) &rarr; Turing Lab</span>
                            <span className="text-[#10B981] font-bold">VERIFIED</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 2: Exam Planning */}
                    {current.visualType === 'exam-seating' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between text-[#98A6BB] pb-2 border-b border-white/10">
                          <span className="text-[#8279FF] font-bold">EXAM SPATIAL SEATING COMPLIANCE</span>
                          <span>SARABHAI AUDITORIUM</span>
                        </div>
                        <div className="p-3 rounded bg-[#101A2B] border border-[#8279FF]/20 flex items-center justify-between">
                          <span>Seating Density: 1 Seat Spacing Ratio</span>
                          <span className="text-[#8279FF] font-bold">PASS (1:1 Alternating)</span>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5 py-2">
                          {Array.from({ length: 18 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-7 rounded flex items-center justify-center text-[10px] font-bold ${
                                i % 2 === 0
                                  ? 'bg-[#8279FF]/20 text-[#8279FF] border border-[#8279FF]/40'
                                  : 'bg-white/[0.03] text-[#98A6BB]/40 border border-white/05'
                              }`}
                            >
                              {i % 2 === 0 ? `R${i + 1}` : 'VAC'}
                            </div>
                          ))}
                        </div>
                        <div className="text-[11px] text-[#98A6BB] flex justify-between pt-1">
                          <span>Invigilator Ratio: 1:30 (14 Assigned)</span>
                          <span className="text-[#10B981]">Roll Number Decoupled</span>
                        </div>
                      </div>
                    )}

                    {/* Visual 3: Venue & Event Management */}
                    {current.visualType === 'venue-workflow' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between text-[#98A6BB] pb-2 border-b border-white/10">
                          <span className="text-[#38BDF8] font-bold">VENUE WORKFLOW LIFECYCLE</span>
                          <span>REQ #892</span>
                        </div>
                        <div className="space-y-2">
                          <div className="p-2.5 rounded bg-[#101A2B] border-l-2 border-[#10B981] flex items-center justify-between">
                            <div>
                              <div className="text-[#F4F7FB] font-bold text-[11px]">1. Society Submission</div>
                              <div className="text-[10px] text-[#98A6BB]">Robotics Club • Drone Workshop</div>
                            </div>
                            <span className="text-[10px] text-[#10B981]">COMPLETED</span>
                          </div>
                          <div className="p-2.5 rounded bg-[#101A2B] border-l-2 border-[#10B981] flex items-center justify-between">
                            <div>
                              <div className="text-[#F4F7FB] font-bold text-[11px]">2. Hard Rules Engine</div>
                              <div className="text-[10px] text-[#98A6BB]">No Class Overlaps • Quota Verified</div>
                            </div>
                            <span className="text-[10px] text-[#10B981]">PASSED</span>
                          </div>
                          <div className="p-2.5 rounded bg-[#101A2B] border-l-2 border-[#38BDF8] flex items-center justify-between">
                            <div>
                              <div className="text-[#F4F7FB] font-bold text-[11px]">3. Department Signoff</div>
                              <div className="text-[10px] text-[#98A6BB]">HOD Computer Science Review</div>
                            </div>
                            <span className="text-[10px] text-[#38BDF8] animate-pulse">PENDING REVIEW</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 4: Disruption Radar */}
                    {current.visualType === 'disruption-radar' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between text-[#98A6BB] pb-2 border-b border-white/10">
                          <span className="text-[#F59E0B] font-bold">DYNAMIC REPAIR CANDIDATE RANKING</span>
                          <span>LH 204 OUTAGE</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-between text-[11px]">
                          <span className="text-[#F59E0B]">Trigger: Air Quality Alarm</span>
                          <span className="text-[#F4F7FB]">Displaced: 82 Students</span>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          <div className="p-2 rounded bg-[#101A2B] border border-[#10B981]/40 flex justify-between items-center">
                            <span className="text-[#F4F7FB]">1. Seminar Hall 1 (Cap 120)</span>
                            <span className="text-[#10B981] font-bold">MATCH 99.4% • 0 RIPPLES</span>
                          </div>
                          <div className="p-2 rounded bg-[#101A2B]/50 border border-white/05 flex justify-between items-center opacity-60">
                            <span className="text-[#98A6BB]">2. Sarabhai Aud (Cap 450)</span>
                            <span className="text-[#EF4444]">REJECTED • 14:00 Clash</span>
                          </div>
                          <div className="p-2 rounded bg-[#101A2B]/50 border border-white/05 flex justify-between items-center opacity-60">
                            <span className="text-[#98A6BB]">3. LH 102 (Cap 75)</span>
                            <span className="text-[#EF4444]">REJECTED • Cap Shortfall</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 5: AI Copilot */}
                    {current.visualType === 'ai-copilot-draft' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between text-[#98A6BB] pb-2 border-b border-white/10">
                          <span className="text-[#10B981] font-bold">NATURAL LANGUAGE &rarr; DRAFT SCHEMA</span>
                          <span>HUMAN IN THE LOOP</span>
                        </div>
                        <div className="p-2.5 rounded bg-[#101A2B] text-[#98A6BB] text-[11px] italic border border-white/05">
                          &ldquo;Need a big tiered hall this Thursday after 2pm for alumni guest talk, around 350 people with stage mics.&rdquo;
                        </div>
                        <div className="p-2.5 rounded bg-[#070A12] border border-[#10B981]/30 space-y-1 text-[11px]">
                          <div className="text-[#10B981] font-bold">GENERATED DRAFT REQUISITION:</div>
                          <div className="text-[#F4F7FB]">Venue: Sarabhai Central Auditorium (Cap 450)</div>
                          <div className="text-[#F4F7FB]">Time: Thursday 14:00 – 16:00 (2 hrs)</div>
                          <div className="text-[#F4F7FB]">Equipment Flag: 2x Wireless Stage Mics + Audio Console</div>
                        </div>
                        <div className="p-2 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[10px] text-[#F59E0B]">
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
