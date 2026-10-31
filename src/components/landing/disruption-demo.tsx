'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { MOCK_DISRUPTION } from '@/lib/mock-data';

export const DisruptionDemo: React.FC = () => {
  const [isDisrupted, setIsDisrupted] = useState(false);
  const [isRepaired, setIsRepaired] = useState(false);

  const handleToggle = () => {
    if (isDisrupted) {
      setIsDisrupted(false);
      setIsRepaired(false);
    } else {
      setIsDisrupted(true);
    }
  };

  const handleApplyRepair = () => {
    setIsRepaired(true);
  };

  return (
    <section id="disruption-demo" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[rgba(255, 255, 255, 0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] mb-4 text-xs font-mono font-semibold text-[#F59E0B] shadow-sm">
            <RotateCcw className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>INTERACTIVE DISRUPTION SIMULATOR</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F8FAFC] tracking-tight mb-4">
            Dynamic Disruption Repair{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#22D3EE]">
              in Real Time
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[#A7B3C9] font-normal leading-relaxed">
            Experience how CIT Nexus isolates an unexpected room outage and proposes an optimal alternative space with minimal student transit and zero cascade clashing.
          </p>
        </div>

        {/* Interactive Sandbox Card */}
        <div className="max-w-4xl mx-auto rounded-2xl bg-[#0D1426] border border-[rgba(255, 255, 255, 0.08)] p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
          {/* Top Bar with Controller Button & State Label */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[rgba(255, 255, 255, 0.08)] gap-4">
            <div className="flex items-center gap-3.5">
              <span
                className={`w-3.5 h-3.5 rounded-full transition-all ${
                  isRepaired
                    ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]'
                    : isDisrupted
                    ? 'bg-[#EF4444] animate-ping'
                    : 'bg-[#22D3EE] shadow-[0_0_8px_#22D3EE]'
                }`}
              />
              <div>
                <div className="text-xs font-mono font-bold text-[#F8FAFC] tracking-wide">
                  STATE:{' '}
                  {isRepaired
                    ? 'REPAIR COMMITTED (SCHEDULE RESTORED)'
                    : isDisrupted
                    ? 'UNPLANNED OUTAGE DETECTED'
                    : 'BASELINE SCHEDULE (OPTIMAL)'}
                </div>
                <div className="text-xs text-[#A7B3C9] mt-0.5">
                  Target: <strong className="text-[#F8FAFC]">{MOCK_DISRUPTION.triggerVenue}</strong> • Window: {MOCK_DISRUPTION.triggerTime}
                </div>
              </div>
            </div>

            {/* Toggle Action Button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggle}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 shadow-sm ${
                  isDisrupted
                    ? 'bg-[#111B30] text-[#F8FAFC] border border-[rgba(148,163,184,0.2)] hover:border-white'
                    : 'bg-[#EF4444] text-white hover:bg-[#DC2626]'
                }`}
              >
                {isDisrupted ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Simulation</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Trigger Outage</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Scenario Stage */}
          <div className="py-8">
            <AnimatePresence mode="wait">
              {!isDisrupted ? (
                /* 1. BASELINE OPTIMAL STATE */
                <motion.div
                  key="baseline"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="p-5 rounded-xl bg-[#111B30] border border-[rgba(255, 255, 255, 0.08)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono font-bold text-[#10B981] uppercase tracking-wider">
                          PRIMARY VENUE ACTIVE
                        </div>
                        <div className="text-lg font-bold text-[#F8FAFC] mt-0.5">
                          {MOCK_DISRUPTION.affectedClass.originalVenue}
                        </div>
                        <div className="text-xs text-[#A7B3C9] mt-0.5">
                          <strong className="text-[#22D3EE]">{MOCK_DISRUPTION.affectedClass.code}</strong> • {MOCK_DISRUPTION.affectedClass.name} ({MOCK_DISRUPTION.affectedClass.faculty})
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-[#A7B3C9]">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#22D3EE]" />
                        <span>{MOCK_DISRUPTION.affectedClass.students} Enrolled</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#6366F1]" />
                        <span>10:15 – 11:45</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-8 text-xs text-[#A7B3C9] border border-dashed border-[rgba(255, 255, 255, 0.08)] rounded-xl bg-white/[0.01]">
                    Click <strong className="text-[#EF4444]">&ldquo;Trigger Outage&rdquo;</strong> above to simulate an unexpected HVAC fault and observe automatic constraint reallocation.
                  </div>
                </motion.div>
              ) : (
                /* 2. DISRUPTED / REPAIR PROPOSAL STATE */
                <motion.div
                  key="disrupted"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Fault Alert Box */}
                  <div className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-[#EF4444] shrink-0" />
                      <div>
                        <div className="text-xs font-mono font-bold text-[#EF4444]">
                          OUTAGE REPORT: LH 204 HVAC FAILURE
                        </div>
                        <div className="text-xs text-[#A7B3C9] mt-0.5">
                          82 Students in CS-301 requiring immediate relocation.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#EF4444] uppercase font-bold shrink-0">
                      Evacuated
                    </span>
                  </div>

                  {/* Proposed Relocation Card */}
                  <div className="p-5 rounded-xl bg-[#111B30] border border-[rgba(255, 255, 255, 0.08)]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#22D3EE]">
                        <Cpu className="w-4 h-4 text-[#22D3EE]" />
                        <span>SOLVER PROPOSAL #1 (BEST REPAIR PLAN)</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#10B981] font-bold">
                        Calculated in 0.8s
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 border-y border-[rgba(148,163,184,0.1)]">
                      <div>
                        <span className="text-sm font-bold text-[#F8FAFC]">
                          Relocate to {MOCK_DISRUPTION.repairRecommendation.recommendedVenue}
                        </span>
                        <p className="text-xs text-[#A7B3C9] mt-0.5">
                          Capacity: 120 seats • Distance: 80 meters (Block B) • Zero schedule overlap
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isRepaired ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 text-xs font-mono text-[#10B981] font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Plan Committed</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleApplyRepair}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366F1] to-[#22D3EE] text-[#080D1B] text-xs font-bold shadow-md hover:opacity-95 transition-all"
                          >
                            <span>Apply Optimal Repair</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-[#A7B3C9]">
                      <span>Cascade Clashes: <strong className="text-[#10B981]">0</strong></span>
                      <span>Transit Buffer: <strong className="text-[#F8FAFC]">3.2 mins</strong></span>
                      <span>Faculty Approval: <strong className="text-[#22D3EE]">Auto-Eligible</strong></span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};
