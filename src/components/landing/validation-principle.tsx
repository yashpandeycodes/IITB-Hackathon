'use client';

import React, { useState } from 'react';
import {
  MessageSquareQuote,
  FileCode2,
  Cpu,
  UserCheck2,
  CalendarCheck2,
  AlertOctagon,
  ShieldAlert,
  CheckCircle,
} from 'lucide-react';

export const ValidationPrinciple: React.FC = () => {
  const [activeStep, setActiveStep] = useState(2); // Default highlight step 3 (Deterministic checks)

  const steps = [
    {
      step: '01',
      title: 'Conversational Or Structured Intake',
      role: 'HUMAN USER',
      roleType: 'user',
      description:
        'A faculty member, department coordinator, or club representative inputs a request—either through an everyday natural-language prompt or standard requisition form.',
      icon: MessageSquareQuote,
      badge: 'INPUT LAYER',
      accent: '#38bdf8',
    },
    {
      step: '02',
      title: 'Syntactic Translation to Schema',
      role: 'AI COPILOT',
      roleType: 'ai',
      description:
        'The natural-language assistant extracts requirements: intended headcounts, pedagogical category, time windows, and technical audiovisual provisions into an editable draft.',
      icon: FileCode2,
      badge: 'NON-AUTHORITATIVE',
      accent: '#c084fc',
    },
    {
      step: '03',
      title: 'Deterministic Constraint Verification',
      role: 'CORE HARD SOLVER',
      roleType: 'solver',
      description:
        'The scheduling rules engine runs hard mathematical checks: zero double-booking overlaps, capacity thresholds, student cohort timetables, building access quotas, and fire codes.',
      icon: Cpu,
      badge: 'MATHEMATICAL TRUTH',
      accent: '#34d399',
    },
    {
      step: '04',
      title: 'Authorized Human Signoff',
      role: 'DEAN / COORDINATOR',
      roleType: 'authority',
      description:
        'A designated faculty dean or venue administrator reviews the verified requisition. Requesters are strictly prohibited from approving their own bookings.',
      icon: UserCheck2,
      badge: 'GOVERNANCE CHECK',
      accent: '#fbbf24',
    },
    {
      step: '05',
      title: 'Immutable Schedule Broadcast',
      role: 'NEXUS SYSTEM',
      roleType: 'system',
      description:
        'Once sanctioned by both deterministic constraints and human signoff, the booking is broadcasted to institute master timetables, electronic door locks, and student portals.',
      icon: CalendarCheck2,
      badge: 'COMMITTED STATE',
      accent: '#f43f5e',
    },
  ];

  return (
    <section id="validation-principle" className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-4xl mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#34d399]/60 mb-5 text-sm font-mono font-bold text-[#6ee7b7] shadow-[0_0_20px_rgba(52,211,153,0.3)]">
            <CheckCircle className="w-4 h-4 text-[#34d399]" />
            <span>FOUNDATIONAL ARCHITECTURE PRINCIPLE</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
            Intelligence proposes.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
              Constraints decide.
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            In university administration, hallucinated room bookings or automated self-approvals cause campus-wide chaos. CIT Nexus strictly decouples intelligent natural-language drafting from deterministic mathematical policy enforcement.
          </p>
        </div>

        {/* 5-Step Pipeline Flow */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-16">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            const isHighlighted = activeStep === idx;
            return (
              <div
                key={st.step}
                onClick={() => setActiveStep(idx)}
                className={`p-6 rounded-3xl border-2 cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                  isHighlighted
                    ? 'bg-[#180838] border-[#fbbf24] shadow-[0_0_30px_rgba(251,191,36,0.5)] scale-105'
                    : 'bg-[#0f0426]/80 border-[#a855f7]/30 hover:border-[#a855f7]/70 hover:bg-[#140633]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-sm font-black text-white">
                      STEP {st.step}
                    </span>
                    <span
                      className="text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border shadow-sm"
                      style={{
                        color: st.accent,
                        backgroundColor: `${st.accent}20`,
                        borderColor: `${st.accent}60`,
                      }}
                    >
                      {st.badge}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#080214] border border-white/10 inline-block mb-4">
                    <Icon className="w-6 h-6" style={{ color: st.accent }} />
                  </div>

                  <h3 className="text-base font-black text-white mb-1.5 leading-snug">
                    {st.title}
                  </h3>
                  <div className="text-xs font-mono font-black text-[#fbbf24] mb-3">
                    {st.role}
                  </div>
                </div>

                <p className="text-sm text-[#cbd5e1] font-medium leading-relaxed pt-3 border-t border-white/10">
                  {st.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Strict Authority Boundary Callout Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 rounded-3xl bg-[#0f0426]/90 border-2 border-[#a855f7]/40 p-8 sm:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#080214] border-2 border-[#c084fc]/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 text-xs font-mono font-black text-[#c084fc] mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc] shadow-[0_0_8px_#c084fc]" />
                WHAT AI DOES
              </div>
              <h4 className="text-xl font-black text-white mb-3">
                Synthesize, Draft & Explain
              </h4>
              <p className="text-sm text-[#cbd5e1] font-medium leading-relaxed">
                Interprets natural-language emails into structured request schemas, suggests suitable venues matching capacity, and provides human-readable explanations of schedule conflicts.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 text-xs font-mono font-bold text-[#c084fc]">
              &bull; Advisory & drafting only
            </div>
          </div>

          <div className="p-6 sm:p-8 rounded-2xl bg-[#080214] border-2 border-[#ef4444]/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 text-xs font-mono font-black text-[#f87171] mb-3">
                <AlertOctagon className="w-4 h-4 text-[#ef4444]" />
                WHAT AI NEVER DOES
              </div>
              <h4 className="text-xl font-black text-white mb-3">
                No Final Grant & No Override
              </h4>
              <p className="text-sm text-[#cbd5e1] font-medium leading-relaxed">
                The AI cannot approve bookings, cannot override campus hard constraints, cannot bypass department authority, and cannot alter scheduled examinations autonomously.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 text-xs font-mono font-bold text-[#f87171]">
              &bull; Zero unverified AI authority
            </div>
          </div>

          <div className="p-6 sm:p-8 rounded-2xl bg-[#080214] border-2 border-[#34d399]/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 text-xs font-mono font-black text-[#34d399] mb-3">
                <ShieldAlert className="w-4 h-4 text-[#34d399]" />
                DETERMINISTIC GUARANTEE
              </div>
              <h4 className="text-xl font-black text-white mb-3">
                Strict Rules & Human Authorization
              </h4>
              <p className="text-sm text-[#cbd5e1] font-medium leading-relaxed">
                Every calendar commit requires mathematical zero-overlap proof from the hard rules solver plus explicit cryptographic signoff from the responsible human department administrator.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 text-xs font-mono font-bold text-[#34d399]">
              &bull; 100% human-in-the-loop audit trail
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
