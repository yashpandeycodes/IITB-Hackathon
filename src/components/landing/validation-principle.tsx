'use client';

import React, { useState } from 'react';
import {
  MessageSquareQuote,
  FileCode2,
  Cpu,
  UserCheck2,
  CalendarCheck2,
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
      accent: '#6366F1',
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
      accent: '#818CF8',
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
      accent: '#22D3EE',
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
      accent: '#10B981',
    },
  ];

  return (
    <section id="validation-principle" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(255, 255, 255, 0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] mb-4 text-xs font-mono font-semibold text-[#10B981] shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-[#10B981]" />
            <span>FOUNDATIONAL ARCHITECTURE PRINCIPLE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight leading-[1.12] mb-4">
            Intelligence proposes.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              Constraints decide.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            In university administration, hallucinated room bookings or automated self-approvals cause campus-wide chaos. CIT Nexus strictly decouples intelligent natural-language drafting from deterministic mathematical policy enforcement.
          </p>
        </div>

        {/* 5-Step Pipeline Flow */}
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
                    ? 'bg-[#111B30] border-[#22D3EE] shadow-[0_4px_24px_rgba(34,211,238,0.2)]'
                    : 'bg-[#0D1426] border-[rgba(255, 255, 255, 0.08)] hover:border-[#6366F1]/50 hover:bg-[#111B30]/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-[#A7B3C9]">
                      STEP {st.step}
                    </span>
                    <span
                      className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border"
                      style={{
                        color: st.accent,
                        backgroundColor: `${st.accent}15`,
                        borderColor: `${st.accent}30`,
                      }}
                    >
                      {st.badge}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="p-2 rounded-lg border shrink-0"
                      style={{
                        backgroundColor: `${st.accent}15`,
                        borderColor: `${st.accent}35`,
                        color: st.accent,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-[#F8FAFC]">
                      {st.role}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#F8FAFC] leading-snug mb-2">
                    {st.title}
                  </h3>

                  <p className="text-xs text-[#A7B3C9] leading-relaxed">
                    {st.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[rgba(148,163,184,0.1)] text-[10px] font-mono text-[#A7B3C9]">
                  {isHighlighted ? '● Active Inspector' : 'Click to inspect'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Step Detailed Diagnostic Box */}
        {(() => {
          const sel = steps[activeStep];
          return (
            <div className="p-6 rounded-2xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className="p-3 rounded-xl border shrink-0 mt-0.5"
                    style={{
                      backgroundColor: `${sel.accent}15`,
                      borderColor: `${sel.accent}35`,
                      color: sel.accent,
                    }}
                  >
                    {React.createElement(sel.icon, { className: 'w-6 h-6' })}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#A7B3C9]">
                        STAGE {sel.step} RECONCILIATION DETAIL:
                      </span>
                      <span
                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
                        style={{ color: sel.accent, backgroundColor: `${sel.accent}15` }}
                      >
                        {sel.role}
                      </span>
                    </div>

                    <h4 className="text-lg font-bold text-[#F8FAFC] mb-1">
                      {sel.title}
                    </h4>

                    <p className="text-xs sm:text-sm text-[#A7B3C9] max-w-3xl">
                      {sel.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-[#A7B3C9] uppercase">Verification Status</div>
                    <div className="text-xs font-bold text-[#10B981] flex items-center gap-1 mt-0.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Passed Integrity Checks
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
};
