'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
  Clock,
  Users,
  Navigation,
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
    <section id="disruption-demo" className="relative py-20 lg:py-32 scroll-mt-20 border-t border-[#F4F7FB]/08">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101A2B] border border-[#F59E0B]/25 mb-4 text-xs font-mono text-[#F59E0B]">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>INTERACTIVE DISRUPTION SIMULATION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F4F7FB] tracking-tight mb-4">
            Dynamic Disruption Repair in Action
          </h2>
          <p className="text-base sm:text-lg text-[#98A6BB]">
            Experience how CIT Nexus isolates an unexpected room outage and proposes an optimal alternative space with minimal student transit and zero cascade clashing.
          </p>
        </div>

        {/* Interactive Sandbox Card */}
        <div className="max-w-4xl mx-auto rounded-3xl bg-[#0B1220] border border-[#F4F7FB]/12 p-6 sm:p-8 shadow-2xl shadow-black/70">
          {/* Top Bar with Controller Button & State Label */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#F4F7FB]/10 gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  isRepaired
                    ? 'bg-[#10B981]'
                    : isDisrupted
                    ? 'bg-[#EF4444] animate-ping'
                    : 'bg-[#66E3F0]'
                }`}
              />
              <div>
                <div className="text-xs font-mono font-bold text-[#F4F7FB]">
                  SIMULATION STATE:{' '}
                  {isRepaired
                    ? 'REPAIR APPLIED (SCHEDULE RESTORED)'
                    : isDisrupted
                    ? 'UNPLANNED OUTAGE DETECTED'
                    : 'BASELINE SCHEDULE (OPTIMAL)'}
                </div>
                <div className="text-[11px] text-[#98A6BB]">
                  Target: {MOCK_DISRUPTION.triggerVenue} • Time: {MOCK_DISRUPTION.triggerTime}
                </div>
              </div>
            </div>

            {/* Toggle Action Button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggle}
                className={`px-5 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all duration-200 flex items-center gap-2 ${
                  isDisrupted
                    ? 'bg-[#101A2B] text-[#F4F7FB] border border-[#F4F7FB]/20 hover:bg-[#152238]'
                    : 'bg-[#EF4444] hover:bg-[#dc2626] text-white shadow-lg shadow-red-500/20'
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
                    <span>Simulate Disruption</span>
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
                  className="space-y-6"
                >
                  <div className="p-5 rounded-2xl bg-[#101A2B]/60 border border-[#10B981]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-mono text-[#10B981] font-semibold">
                          PRIMARY VENUE ACTIVE
                        </div>
                        <div className="text-base font-bold text-[#F4F7FB]">
                          {MOCK_DISRUPTION.affectedClass.originalVenue}
                        </div>
                        <div className="text-xs text-[#98A6BB]">
                          {MOCK_DISRUPTION.affectedClass.code} • {MOCK_DISRUPTION.affectedClass.name} ({MOCK_DISRUPTION.affectedClass.faculty})
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-[#98A6BB]">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#66E3F0]" />
                        <span>{MOCK_DISRUPTION.affectedClass.students} Enrolled</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#8279FF]" />
                        <span>10:15 – 11:45</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-6 text-xs text-[#98A6BB] border border-dashed border-[#F4F7FB]/10 rounded-2xl">
                    Click &ldquo;Simulate Disruption&rdquo; above to trigger an unexpected room outage and view the automatic constraint rerouting process.
                  </div>
                </motion.div>
              ) : (
                /* 2. DISRUPTED / REPAIR PROPOSAL STATE */
                <motion.div
                  key="disrupted"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Incident Alert Banner */}
                  <div className="p-4 rounded-2xl bg-[#EF4444]/15 border border-[#EF4444]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0" />
                      <div>
                        <span className="text-xs font-mono font-bold text-[#EF4444]">
                          CRITICAL FAULT: {MOCK_DISRUPTION.triggerReason}
                        </span>
                        <p className="text-xs text-[#F4F7FB]/80">
                          {MOCK_DISRUPTION.triggerVenue} marked unavailable. 82 students in {MOCK_DISRUPTION.affectedClass.code} require emergency reassignment.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40 whitespace-nowrap self-start sm:self-center">
                      ROOM ISOLATED
                    </span>
                  </div>

                  {/* Proposed Repair Card */}
                  <div className="p-6 rounded-2xl bg-[#101A2B] border border-[#10B981]/40 shadow-xl">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/08">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#10B981]" />
                        <span className="text-xs font-mono font-bold text-[#10B981]">
                          NEXUS SOLVER PROPOSED REPAIR CANDIDATE
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#10B981] px-2.5 py-0.5 rounded-full bg-[#10B981]/15 border border-[#10B981]/30">
                        CONFIDENCE: {MOCK_DISRUPTION.repairRecommendation.confidenceScore}%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      <div>
                        <div className="text-xs text-[#98A6BB] mb-1 font-mono">RECOMMENDED REASSIGNMENT</div>
                        <h4 className="text-xl font-bold text-[#F4F7FB] mb-3">
                          {MOCK_DISRUPTION.repairRecommendation.recommendedVenue}
                        </h4>

                        <div className="space-y-2 text-xs text-[#98A6BB]">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-[#66E3F0]" />
                            <span>{MOCK_DISRUPTION.repairRecommendation.capacityDelta}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Navigation className="w-3.5 h-3.5 text-[#8279FF]" />
                            <span>Transit Distance: {MOCK_DISRUPTION.repairRecommendation.distance}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>AV Specs: {MOCK_DISRUPTION.repairRecommendation.avCompatibility}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <RotateCcw className="w-3.5 h-3.5 text-[#38BDF8]" />
                            <span>Downstream Conflicts: {MOCK_DISRUPTION.repairRecommendation.cascadeConflictsCount} (Isolated)</span>
                          </div>
                        </div>
                      </div>

                      {/* Rejected Alternatives Diagnostic */}
                      <div className="p-4 rounded-xl bg-[#070A12] border border-white/06 space-y-2">
                        <div className="text-[11px] font-mono text-[#98A6BB] font-bold">
                          REJECTED CANDIDATES EVALUATED:
                        </div>
                        {MOCK_DISRUPTION.rejectedCandidates.map((rej, i) => (
                          <div key={i} className="text-[11px] text-[#98A6BB] flex items-start gap-2">
                            <XCircle className="w-3.5 h-3.5 text-[#EF4444] shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-[#F4F7FB]">{rej.venue}</strong>: {rej.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Commit Repair Action */}
                    <div className="mt-6 pt-4 border-t border-white/08 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs text-[#98A6BB] font-mono">
                        Authorizing will automatically notify Prof. Ray and 82 enrolled students via push notifications.
                      </span>

                      {!isRepaired ? (
                        <button
                          type="button"
                          onClick={handleApplyRepair}
                          className="px-5 py-2 rounded-xl text-xs font-semibold text-[#070A12] bg-[#10B981] hover:bg-[#34d399] transition-all flex items-center justify-center gap-2 self-start sm:self-center whitespace-nowrap shadow-lg shadow-emerald-500/20"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve & Dispatch Reroute</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#10B981]/20 text-[#10B981] text-xs font-mono font-bold border border-[#10B981]/40">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>REROUTE COMMITTED • NOTIFICATIONS SENT</span>
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Transparent Simulation Disclaimer Note */}
          <div className="pt-4 border-t border-[#F4F7FB]/08 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-[#66E3F0]" />
              <span>Deterministic frontend demonstration model. Production uses mathematical constraint solvers.</span>
            </div>
            <span className="hidden sm:inline text-white/30">CIT NEXUS REPAIR SIM v1.0</span>
          </div>
        </div>
      </div>
    </section>
  );
};
