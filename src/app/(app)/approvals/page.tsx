'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { MOCK_CHANGE_REQUESTS } from '../changes/preview-data';
import { Shuffle, Ticket, ArrowRight, AlertTriangle } from 'lucide-react';

export default function ApprovalsInboxPage() {
  const [activeTab, setActiveTab] = useState<'changes' | 'bookings'>('changes');

  return (
    <AppShell
      pageTitle="Approvals & Governance Inbox"
      breadcrumbs={[{ label: 'Approvals' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Preview Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Preview — not connected yet</div>
            <div className="text-[11px] text-amber-200/80 mt-0.5">
              Change approvals and department booking sign-offs will be connected to real governance endpoints in Phase 5. No actual decisions are committed from this preview.
            </div>
          </div>
        </div>

        {/* Header & Tabs (§5.8) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-[#8279FF]/30 shadow-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-[#8279FF] uppercase tracking-wider">
                ADMIN & COORDINATOR CLEARANCE
              </span>
              <span className="w-2 h-2 rounded-full bg-[#8279FF] animate-ping" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Pending Approvals</h1>
            <p className="text-xs sm:text-sm text-[#98A6BB] mt-1">
              Review diffs, constraint satisfaction checks, and approve disruption reschedule proposals.
            </p>
          </div>

          <div className="flex items-center p-1 rounded-2xl bg-[#101A2B] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('changes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'changes'
                  ? 'bg-[#8279FF] text-white shadow-md'
                  : 'text-[#98A6BB] hover:text-white'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Rescheduling Changes ({MOCK_CHANGE_REQUESTS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bookings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'bookings'
                  ? 'bg-[#8279FF] text-white shadow-md'
                  : 'text-[#98A6BB] hover:text-white'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Dept Bookings (Preview)</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Rescheduling Changes (§5.8) */}
        {activeTab === 'changes' && (
          <div className="grid grid-cols-1 gap-4">
            {MOCK_CHANGE_REQUESTS.map((item) => (
              <div
                key={item.id}
                className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 hover:border-[#8279FF]/40 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-base text-[#66E3F0]">{item.id}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {item.type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono text-[#98A6BB]">· {item.createdAt}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white">{item.title}</h3>
                  <p className="text-xs text-[#cbd5e1] leading-relaxed">{item.reason}</p>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/30">
                      0 hard violations ✓
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-[#fbbf24] bg-amber-500/10 border border-amber-500/30">
                      Soft delta: +{item.softPenaltyDelta}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-[#98A6BB] bg-white/5 border border-white/10">
                      {item.moves.length} sessions moved
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/approvals/${item.id}`}
                    className="px-5 py-2.5 rounded-2xl text-xs font-mono font-bold bg-[#8279FF] hover:bg-[#7267f5] text-white shadow-lg shadow-[#8279FF]/20 flex items-center gap-2 transition-all"
                  >
                    <span>Review Diff & Inspect</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Bookings Needing Approval (§5.8) */}
        {activeTab === 'bookings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-400">BR-21 · CSE Department</span>
                <span className="text-[10px] font-mono text-[#98A6BB]">Illustrative Preview</span>
              </div>
              <h3 className="text-base font-bold text-white">CS-LAB-2 Specialised Hardware Bench Reservation</h3>
              <p className="text-xs text-[#98A6BB]">
                Requested by M.Tech Systems batch for high-performance computing evaluation on Friday P7-P9.
              </p>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400">0 academic conflicts</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 text-rose-300/60 cursor-not-allowed"
                    title="Approval actions will be connected in Phase 5"
                  >
                    Reject (Preview)
                  </button>
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0]/60 text-[#070A12] cursor-not-allowed"
                    title="Approval actions will be connected in Phase 5"
                  >
                    Approve (Preview)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
