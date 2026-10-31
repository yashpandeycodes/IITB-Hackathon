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
      accent: '#66E3F0',
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
      accent: '#8279FF',
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
      accent: '#10B981',
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
      accent: '#F59E0B',
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
      accent: '#38BDF8',
    },
  ];

  return (
    <section id="validation-principle" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08 bg-[#070A12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#10B981]/25 mb-4 text-xs font-mono text-[#10B981]">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>FOUNDATIONAL ARCHITECTURE PRINCIPLE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight leading-tight mb-4">
            Intelligence proposes.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#66E3F0] to-[#8279FF]">
              Constraints decide.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB] leading-relaxed">
            In university administration, hallucinated room bookings or automated self-approvals cause campus-wide chaos. CIT Nexus decouples intelligent drafting from deterministic policy enforcement.
          </p>
        </div>

        {/* 5-Step Pipeline Horizontal / Vertical Flow */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-12">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            const isHighlighted = activeStep === idx;
            return (
              <div
                key={st.step}
                onClick={() => setActiveStep(idx)}
                className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  isHighlighted
                    ? 'bg-[#101A2B] border-[#66E3F0] shadow-[0_0_20px_-3px_rgba(102,227,240,0.25)]'
                    : 'bg-[#0B1220]/70 border-[#F4F7FB]/08 hover:border-[#F4F7FB]/20 hover:bg-[#101A2B]/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-[#98A6BB]">
                      STEP {st.step}
                    </span>
                    <span
                      className="text-[9px] font-mono px-2 py-0.5 rounded font-semibold border"
                      style={{
                        color: st.accent,
                        backgroundColor: `${st.accent}15`,
                        borderColor: `${st.accent}30`,
                      }}
                    >
                      {st.badge}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#070A12] border border-white/05 inline-block mb-3">
                    <Icon className="w-5 h-5" style={{ color: st.accent }} />
                  </div>

                  <h3 className="text-sm font-bold text-[#F4F7FB] mb-1">
                    {st.title}
                  </h3>
                  <div className="text-[11px] font-mono text-[#66E3F0] mb-2">
                    {st.role}
                  </div>
                </div>

                <p className="text-xs text-[#98A6BB] leading-relaxed mt-2 pt-2 border-t border-[#F4F7FB]/06">
                  {st.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Strict Authority Boundary Callout Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-3xl bg-[#0B1220] border border-[#F4F7FB]/10 p-6 sm:p-8">
          <div className="p-5 rounded-2xl bg-[#070A12]/80 border border-[#8279FF]/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#8279FF] font-bold mb-2">
                <span className="w-2 h-2 rounded-full bg-[#8279FF]" />
                WHAT AI DOES
              </div>
              <h4 className="text-base font-bold text-[#F4F7FB] mb-2">
                Synthesize, Draft & Explain
              </h4>
              <p className="text-xs text-[#98A6BB] leading-relaxed">
                Interprets natural-language emails into structured request schemas, suggests suitable venues matching capacity, and provides human-readable explanations of schedule conflicts.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/06 text-[11px] font-mono text-[#8279FF]">
              &bull; Advisory & drafting only
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#070A12]/80 border border-[#EF4444]/25 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#EF4444] font-bold mb-2">
                <AlertOctagon className="w-3.5 h-3.5 text-[#EF4444]" />
                WHAT AI NEVER DOES
              </div>
              <h4 className="text-base font-bold text-[#F4F7FB] mb-2">
                No Final Grant & No Override
              </h4>
              <p className="text-xs text-[#98A6BB] leading-relaxed">
                The AI cannot approve bookings, cannot override campus hard constraints, cannot bypass department authority, and cannot alter scheduled examinations autonomously.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/06 text-[11px] font-mono text-[#EF4444]">
              &bull; Zero unverified authority
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#070A12]/80 border border-[#10B981]/25 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#10B981] font-bold mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[#10B981]" />
                DETERMINISTIC GUARANTEE
              </div>
              <h4 className="text-base font-bold text-[#F4F7FB] mb-2">
                Strict Rules & Human Authorization
              </h4>
              <p className="text-xs text-[#98A6BB] leading-relaxed">
                Every calendar commit requires mathematical zero-overlap proof from the hard rules solver plus explicit cryptographic signoff from the responsible human department administrator.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/06 text-[11px] font-mono text-[#10B981]">
              &bull; 100% human-in-the-loop audit trail
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
