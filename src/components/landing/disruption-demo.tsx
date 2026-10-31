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
    <section id="disruption-demo" className="relative py-24 lg:py-36 scroll-mt-20 border-t border-[#a855f7]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#f59e0b]/60 mb-5 text-sm font-mono font-bold text-[#fde047] shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <RotateCcw className="w-4 h-4 text-[#f59e0b]" />
            <span>INTERACTIVE DISRUPTION SIMULATION</span>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight mb-6">
            Dynamic Disruption Repair{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24]">
              in Action
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-[#f1f5f9] font-medium leading-relaxed">
            Experience how CIT Nexus isolates an unexpected room outage and proposes an optimal alternative space with minimal student transit and zero cascade clashing.
          </p>
        </div>

        {/* Interactive Sandbox Card */}
        <div className="max-w-5xl mx-auto rounded-3xl bg-[#0e0424] border-2 border-[#a855f7]/40 p-8 sm:p-12 shadow-[0_20px_70px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
          {/* Top Bar with Controller Button & State Label */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-white/10 gap-6">
            <div className="flex items-center gap-4">
              <span
                className={`w-4 h-4 rounded-full ${
                  isRepaired
                    ? 'bg-[#10b981] shadow-[0_0_12px_#10b981]'
                    : isDisrupted
                    ? 'bg-[#ef4444] animate-ping shadow-[0_0_12px_#ef4444]'
                    : 'bg-[#fbbf24] shadow-[0_0_12px_#fbbf24]'
                }`}
              />
              <div>
                <div className="text-base font-mono font-black text-white tracking-wider">
                  SIMULATION STATE:{' '}
                  {isRepaired
                    ? 'REPAIR COMMITTED (SCHEDULE RESTORED)'
                    : isDisrupted
                    ? 'UNPLANNED OUTAGE DETECTED'
                    : 'BASELINE SCHEDULE (OPTIMAL)'}
                </div>
                <div className="text-sm font-medium text-[#cbd5e1] mt-0.5">
                  Target: <strong className="text-white">{MOCK_DISRUPTION.triggerVenue}</strong> • Window: {MOCK_DISRUPTION.triggerTime}
                </div>
              </div>
            </div>

            {/* Toggle Action Button */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleToggle}
                className={`px-6 py-3.5 rounded-2xl text-sm font-mono font-black transition-all duration-300 flex items-center gap-2.5 shadow-xl hover:scale-105 ${
                  isDisrupted
                    ? 'bg-[#1c0838] text-white border-2 border-white/30 hover:border-white'
                    : 'bg-gradient-to-r from-[#ef4444] to-[#f43f5e] text-white shadow-red-500/30'
                }`}
              >
                {isDisrupted ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset Simulation</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>Simulate Disruption</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Scenario Stage */}
          <div className="py-10">
            <AnimatePresence mode="wait">
              {!isDisrupted ? (
                /* 1. BASELINE OPTIMAL STATE */
                <motion.div
                  key="baseline"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-6"
                >
                  <div className="p-6 sm:p-8 rounded-3xl bg-[#150733] border-2 border-[#10b981]/50 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div className="p-4 rounded-2xl bg-[#10b981]/20 text-[#34d399] border-2 border-[#10b981]/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="text-xs font-mono font-black text-[#34d399] uppercase tracking-wider">
                          PRIMARY VENUE ACTIVE
                        </div>
                        <div className="text-2xl font-black text-white mt-0.5">
                          {MOCK_DISRUPTION.affectedClass.originalVenue}
                        </div>
                        <div className="text-sm font-medium text-[#cbd5e1] mt-1">
                          <strong className="text-[#fbbf24]">{MOCK_DISRUPTION.affectedClass.code}</strong> • {MOCK_DISRUPTION.affectedClass.name} ({MOCK_DISRUPTION.affectedClass.faculty})
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm font-mono font-bold text-white">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#38bdf8]" />
                        <span>{MOCK_DISRUPTION.affectedClass.students} Enrolled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#c084fc]" />
                        <span>10:15 – 11:45</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-10 text-base text-[#cbd5e1] font-medium border-2 border-dashed border-[#a855f7]/30 rounded-3xl bg-white/[0.02]">
                    Click <strong className="text-[#f43f5e] font-bold">&ldquo;Simulate Disruption&rdquo;</strong> above to trigger an unexpected room outage and view the automatic constraint rerouting process.
                  </div>
                </motion.div>
              ) : (
                /* 2. DISRUPTED / REPAIR PROPOSAL STATE */
                <motion.div
                  key="disrupted"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-8"
                >
                  {/* Incident Alert Banner */}
                  <div className="p-6 rounded-3xl bg-[#ef4444]/20 border-2 border-[#ef4444]/60 shadow-[0_0_30px_rgba(239,68,68,0.3)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <AlertTriangle className="w-8 h-8 text-[#ef4444] shrink-0" />
                      <div>
                        <span className="text-sm font-mono font-black text-[#fca5a5] uppercase tracking-wider block">
                          CRITICAL OUTAGE: {MOCK_DISRUPTION.triggerReason}
                        </span>
                        <p className="text-sm font-medium text-white mt-1">
                          {MOCK_DISRUPTION.triggerVenue} marked unavailable. 82 students in {MOCK_DISRUPTION.affectedClass.code} require emergency reassignment.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-black px-3.5 py-1.5 rounded-lg bg-[#ef4444]/30 text-[#fca5a5] border border-[#ef4444]/60 whitespace-nowrap self-start sm:self-center">
                      ROOM ISOLATED
                    </span>
                  </div>

                  {/* Proposed Repair Card */}
                  <div className="p-8 sm:p-10 rounded-3xl bg-[#14062e] border-2 border-[#34d399]/60 shadow-2xl">
                    <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/10 flex-wrap gap-3">
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-5 h-5 text-[#34d399]" />
                        <span className="text-sm font-mono font-black text-[#34d399] tracking-wider">
                          NEXUS SOLVER PROPOSED REPAIR CANDIDATE
                        </span>
                      </div>
                      <span className="text-xs font-mono font-black text-[#04010a] px-3.5 py-1 rounded-full bg-gradient-to-r from-[#34d399] to-[#fbbf24] shadow-md">
                        CONFIDENCE: {MOCK_DISRUPTION.repairRecommendation.confidenceScore}%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                      <div>
                        <div className="text-xs text-[#fbbf24] mb-1 font-mono font-bold tracking-wider">RECOMMENDED REASSIGNMENT</div>
                        <h4 className="text-2xl font-black text-white mb-4">
                          {MOCK_DISRUPTION.repairRecommendation.recommendedVenue}
                        </h4>

                        <div className="space-y-3 text-sm font-medium text-[#cbd5e1]">
                          <div className="flex items-center gap-3">
                            <Users className="w-4 h-4 text-[#38bdf8]" />
                            <span>{MOCK_DISRUPTION.repairRecommendation.capacityDelta}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Navigation className="w-4 h-4 text-[#c084fc]" />
                            <span>Transit Distance: {MOCK_DISRUPTION.repairRecommendation.distance}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-[#34d399]" />
                            <span>AV Specs: {MOCK_DISRUPTION.repairRecommendation.avCompatibility}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <RotateCcw className="w-4 h-4 text-[#fbbf24]" />
                            <span>Downstream Conflicts: {MOCK_DISRUPTION.repairRecommendation.cascadeConflictsCount} (Isolated)</span>
                          </div>
                        </div>
                      </div>

                      {/* Rejected Alternatives Diagnostic */}
                      <div className="p-6 rounded-2xl bg-[#080214] border-2 border-white/10 space-y-3">
                        <div className="text-xs font-mono text-[#fbbf24] font-black uppercase tracking-wider">
                          REJECTED CANDIDATES EVALUATED:
                        </div>
                        {MOCK_DISRUPTION.rejectedCandidates.map((rej, i) => (
                          <div key={i} className="text-xs font-medium text-[#cbd5e1] flex items-start gap-2.5">
                            <XCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-white font-bold">{rej.venue}</strong>: {rej.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Commit Repair Action */}
                    <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <span className="text-sm text-[#cbd5e1] font-mono">
                        Authorizing will automatically notify Prof. Ray and 82 enrolled students via push notifications.
                      </span>

                      {!isRepaired ? (
                        <button
                          type="button"
                          onClick={handleApplyRepair}
                          className="px-8 py-3.5 rounded-2xl text-sm font-black text-[#04010a] bg-gradient-to-r from-[#34d399] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 self-start sm:self-center whitespace-nowrap shadow-[0_0_25px_rgba(52,211,153,0.5)] hover:scale-105"
                        >
                          <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                          <span>Approve & Dispatch Reroute</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-[#10b981]/25 text-[#34d399] text-sm font-mono font-black border-2 border-[#10b981] shadow-lg">
                          <CheckCircle2 className="w-5 h-5 stroke-[3]" />
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
          <div className="pt-6 border-t border-white/10 flex items-center justify-between text-xs font-mono font-bold text-[#cbd5e1]">
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-[#fbbf24]" />
              <span>Deterministic frontend demonstration model. Production uses mathematical constraint solvers.</span>
            </div>
            <span className="hidden sm:inline text-white/40">CIT NEXUS REPAIR SIM v1.0</span>
          </div>
        </div>
      </div>
    </section>
  );
};
