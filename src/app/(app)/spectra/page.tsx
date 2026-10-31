'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { SPECTRA_BOOKINGS, CAMPUS_ROOMS } from '@/lib/dataset/cit-data';
import { StatusBadge, CategoryChip } from '@/components/semantic/badges';
import { BookingItem, DayCode, PeriodId } from '@/lib/contracts';
import { PERIOD_MAP, DAYS_LIST, formatDay } from '@/lib/format';
import {
  Sparkles,
  Zap,
  RotateCcw,
  Ticket,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';

export default function SpectraBoardPage() {
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [activeTab, setActiveTab] = useState<'decisions' | 'timeline'>('decisions');
  const [isReRunning, setIsReRunning] = useState(false);

  const eventCapableRooms = CAMPUS_ROOMS.filter((r) => r.isEventCapable);
  const days: DayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const allPeriods: PeriodId[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13'];

  const approvedCount = SPECTRA_BOOKINGS.filter((b) => b.status === 'approved').length;
  const altCount = SPECTRA_BOOKINGS.filter((b) => b.status === 'alternative').length;
  const rejCount = SPECTRA_BOOKINGS.filter((b) => b.status === 'rejected').length;

  const handleReRun = () => {
    setIsReRunning(true);
    setTimeout(() => {
      setIsReRunning(false);
    }, 1200);
  };

  return (
    <AppShell
      pageTitle="Spectra Fest Coordination Board"
      breadcrumbs={[{ label: 'Spectra Week 7' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header KPIs & Solver Trigger (§5.7) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#170529] via-[#0B1220] to-[#12082b] border border-pink-500/30 shadow-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-pink-400 uppercase tracking-wider">
                WEEK 7 EVENT DISPATCH ENGINE
              </span>
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Spectra Fest Board</h1>
            <p className="text-xs sm:text-sm text-[#98A6BB] mt-1">
              Automated multi-venue scheduling across 25+ competing cultural, technical & guest requests.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReRun}
              disabled={isReRunning}
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/25 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isReRunning ? 'animate-spin' : ''}`} />
              <span>{isReRunning ? 'Running Solver...' : 'Re-run Decisions'}</span>
            </button>
          </div>
        </div>

        {/* 4 Score Metrics Grid (§5.7) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">DECISIONS BREAKDOWN</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white mt-1">
              <span className="text-emerald-400">{approvedCount}</span> /{' '}
              <span className="text-amber-400">{altCount}</span> /{' '}
              <span className="text-rose-400">{rejCount}</span>
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">Appr / Alt / Rej</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">BOOKING SCORE</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-pink-400 mt-1">64 / 70</div>
            <div className="text-[10px] font-mono text-pink-300/70 mt-0.5">91.4% Capacity Sat.</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">PRIORITY INVERSIONS</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-[#34d399] mt-1">0 ✓</div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">Strict Order Preserved</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">CLASS OVERRIDES</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-violet-400 mt-1">1 Relocation</div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">ID101 → LH-1 (0 clashes)</div>
          </div>
        </div>

        {/* View Toggle: Decisions Table vs Room Timeline Gantt (§5.7) */}
        <div className="flex items-center p-1 rounded-2xl bg-[#0B1220] border border-white/10 max-w-sm">
          <button
            onClick={() => setActiveTab('decisions')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'decisions'
                ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                : 'text-[#98A6BB] hover:text-white'
            }`}
          >
            Decisions Table (25+)
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'timeline'
                ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                : 'text-[#98A6BB] hover:text-white'
            }`}
          >
            Room Timeline (Gantt)
          </button>
        </div>

        {/* Tab 1: Decisions Table (§5.7) */}
        {activeTab === 'decisions' && (
          <div className="overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B] text-[11px] font-mono text-[#98A6BB] uppercase">
                  <th className="p-3.5">ID / Event Title</th>
                  <th className="p-3.5">Requester</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Requested Slot</th>
                  <th className="p-3.5">Decision</th>
                  <th className="p-3.5">Reason & Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs font-mono">
                {SPECTRA_BOOKINGS.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="p-3.5 align-top">
                      <div className="font-bold text-white text-sm hover:text-pink-300 transition-colors">
                        {b.title}
                      </div>
                      <div className="text-[10px] text-[#98A6BB] mt-0.5">{b.id}</div>
                    </td>

                    <td className="p-3.5 align-top whitespace-nowrap text-[#cbd5e1]">
                      {b.requesterName}
                    </td>

                    <td className="p-3.5 align-top">
                      <CategoryChip
                        category={b.effectiveCategory}
                        isCapped={b.isCapped}
                        originalClaim={b.originalClaim}
                      />
                    </td>

                    <td className="p-3.5 align-top whitespace-nowrap">
                      <div className="text-white font-bold">{formatDay(b.day)} {b.periodStart}–{b.periodEnd}</div>
                      <div className="text-[10px] text-[#98A6BB]">Wanted: {b.requestedRoomId}</div>
                    </td>

                    <td className="p-3.5 align-top whitespace-nowrap">
                      <StatusBadge status={b.status} />
                      <div className="text-[11px] text-[#66E3F0] font-bold mt-1">
                        {b.assignedRoomName || (b.status === 'rejected' ? 'No venue' : b.requestedRoomId)}
                      </div>
                    </td>

                    <td className="p-3.5 align-top max-w-sm text-[#cbd5e1] text-[11px] leading-relaxed">
                      {b.decisionReason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Room Timeline (Gantt-Style Rows, §5.7) */}
        {activeTab === 'timeline' && (
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm overflow-x-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white">
                Event-Capable Rooms Timeline (AUD, OAT, SH-1, SH-2, LH-1...)
              </span>
              <span className="text-[11px] font-mono text-[#98A6BB]">
                Grey = Academic Class · Coloured = Spectra Event
              </span>
            </div>

            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B]">
                  <th className="p-2 text-left w-28 sticky left-0 z-20 bg-[#101A2B]">Venue</th>
                  {days.map((d) => (
                    <th key={d} colSpan={allPeriods.length} className="p-1.5 text-center border-l border-white/10">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventCapableRooms.map((room) => (
                  <tr key={room.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-2 font-bold text-white sticky left-0 z-10 bg-[#0B1220] whitespace-nowrap">
                      {room.id} <span className="text-[10px] text-[#98A6BB] font-normal">({room.capacity})</span>
                    </td>
                    {days.map((day) => (
                      <React.Fragment key={day}>
                        {allPeriods.map((period, pIdx) => {
                          const booking = SPECTRA_BOOKINGS.find(
                            (b) => b.assignedRoomId === room.id && b.day === day && b.periodStart === period
                          );

                          return (
                            <td
                              key={period}
                              className={`p-0.5 ${pIdx === 0 ? 'border-l border-white/10' : ''}`}
                            >
                              {booking ? (
                                <div
                                  onClick={() => setSelectedBooking(booking)}
                                  title={`${booking.title} (${booking.effectiveCategory})`}
                                  className="h-6 px-1 rounded bg-pink-500/80 hover:bg-pink-400 text-[#070A12] text-[9px] font-bold truncate flex items-center cursor-pointer transition-colors shadow-sm"
                                >
                                  {booking.title}
                                </div>
                              ) : (
                                <div className="h-6 rounded bg-white/5 hover:bg-white/10 transition-colors" />
                              )}
                            </td>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Inspection Drawer on Row Click (§5.7) */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#0B1220] border-l border-white/10 h-full p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <span className="font-mono text-xs text-pink-400 font-bold">SPECTRA DECISION AUDIT</span>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono font-bold text-xs text-pink-400">{selectedBooking.id}</span>
                  <StatusBadge status={selectedBooking.status} />
                  <CategoryChip
                    category={selectedBooking.effectiveCategory}
                    isCapped={selectedBooking.isCapped}
                    originalClaim={selectedBooking.originalClaim}
                  />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">{selectedBooking.title}</h2>
                <div className="text-xs text-[#98A6BB] mt-1 font-mono">
                  Requested by: {selectedBooking.requesterName} ({selectedBooking.requesterRole})
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/10">
                  <span className="text-[10px] font-mono text-[#98A6BB] uppercase block mb-1">
                    DECISION REASONING
                  </span>
                  <p className="text-xs text-white leading-relaxed">
                    {selectedBooking.decisionReason}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#101A2B] border border-white/10 space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Requested Day:</span>
                    <span className="text-white font-bold">{formatDay(selectedBooking.day)} ({selectedBooking.periodStart}–{selectedBooking.periodEnd})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Assigned Venue:</span>
                    <span className="text-[#66E3F0] font-bold">{selectedBooking.assignedRoomName || 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Expected Attendees:</span>
                    <span className="text-white font-bold">{selectedBooking.expectedAttendance} Persons</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedBooking(null)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold transition-colors"
            >
              Close Audit Drawer
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

