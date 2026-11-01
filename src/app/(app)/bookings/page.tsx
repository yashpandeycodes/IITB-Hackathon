'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { apiGet } from '@/lib/api-client';
import { SpectraStateSchema, DayCode } from '@/lib/contracts';
import { useReferenceData } from '@/hooks/use-reference-data';
import { StatusBadge, CategoryChip } from '@/components/semantic/badges';
import { Ticket, ArrowRight, AlertTriangle } from 'lucide-react';
import { formatDay } from '@/lib/format';

export default function MyBookingsPage() {
  const { referenceData, roomName } = useReferenceData();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');

  // Query actual persisted Spectra decisions from backend
  const { data: spectraState } = useQuery({
    queryKey: ['spectra'],
    queryFn: () => apiGet('/api/spectra', SpectraStateSchema),
    staleTime: 15_000,
  });

  // Map decisions by request ID
  const decisionsMap = useMemo(() => {
    const map = new Map<string, {
      decision: string;
      reason: string;
      reasonCode?: string;
      assignedRoom?: string;
      day?: DayCode;
      period?: string;
    }>();

    if (spectraState?.decisions) {
      for (const d of spectraState.decisions) {
        map.set(d.request_id, {
          decision: d.status,
          reason: d.reason,
          reasonCode: d.reason_code,
          assignedRoom: d.room_id,
          day: d.day,
          period: d.start_period && d.end_period ? `${d.start_period}–${d.end_period}` : undefined,
        });
      }
    }
    return map;
  }, [spectraState]);

  // Combine reference requests with backend decisions
  const bookings = useMemo(() => {
    return referenceData.booking_requests.map((req) => {
      const decision = decisionsMap.get(req.id);
      const firstWindow = req.windows[0];
      const day = decision?.day ?? firstWindow?.day ?? 'MON';
      const periodRange = decision?.period ?? (firstWindow ? `P${firstWindow.from_period}–P${firstWindow.to_period}` : '');

      let status: 'approved' | 'alternative' | 'rejected' | 'pending' | 'cancelled' = 'pending';
      if (req.cancelled) {
        status = 'cancelled';
      } else if (decision?.decision === 'approved') {
        status = 'approved';
      } else if (decision?.decision === 'alternative_offered') {
        status = 'alternative';
      } else if (decision?.decision === 'rejected') {
        status = 'rejected';
      }

      return {
        id: req.id,
        title: req.title,
        requesterName: req.requester,
        requesterRole: req.role,
        requestedCategory: req.requested_category,
        effectiveCategory: req.effective_category,
        isCapped: req.category_capped,
        day,
        periodRange,
        requestedRoom: req.requested_room ? roomName(req.requested_room) : 'Any suitable',
        assignedRoom: decision?.assignedRoom ? roomName(decision.assignedRoom) : null,
        status,
        decisionReason: decision?.reason ?? 'Pending Spectra decision engine run.',
        decisionReasonCode: decision?.reasonCode,
      };
    });
  }, [referenceData.booking_requests, decisionsMap, roomName]);

  const filtered = bookings.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (dayFilter !== 'all' && b.day !== dayFilter) return false;
    return true;
  });

  return (
    <AppShell
      pageTitle="Institutional Bookings"
      breadcrumbs={[{ label: 'Bookings' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Preview Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Preview — not connected yet</div>
            <div className="text-[11px] text-amber-200/80 mt-0.5">
              Live booking submission, user request history, and cancellation endpoints will be integrated in Phase 4. Below are the institutional Spectra Week 7 booking requests from the active dataset.
            </div>
          </div>
        </div>

        {/* Header & Filter Controls (§5.6) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Event & Venue Reservations</h1>
            <p className="text-xs font-mono text-[#98A6BB] mt-0.5">
              Tracking {filtered.length} requests across academic & Spectra Week 7 slots.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="alternative">Alternative Offered</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending Run</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
            >
              <option value="all">All Days</option>
              <option value="MON">Monday</option>
              <option value="TUE">Tuesday</option>
              <option value="WED">Wednesday</option>
              <option value="THU">Thursday</option>
              <option value="FRI">Friday</option>
            </select>

            <Link
              href="/bookings/new"
              className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center gap-1.5"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Book Venue</span>
            </Link>
          </div>
        </div>

        {/* Empty State */}
        {filtered.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#0B1220] border border-white/10 text-center space-y-3">
            <Ticket className="w-10 h-10 text-white/20 mx-auto" />
            <h3 className="text-base font-bold text-white">No requests found</h3>
            <p className="text-xs font-mono text-[#98A6BB]">No booking records match the selected filters.</p>
            <Link
              href="/bookings/new"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-[#66E3F0] hover:underline font-bold"
            >
              <span>Book a venue now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          /* Bookings Table (§5.6) */
          <div className="overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B] text-[11px] font-mono text-[#98A6BB] uppercase">
                  <th className="p-3.5">ID / Event</th>
                  <th className="p-3.5">When & Where</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Reason & Details</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs font-mono">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* ID & Title */}
                    <td className="p-3.5 align-top">
                      <div className="font-bold text-white text-sm">{item.title}</div>
                      <div className="text-[10px] text-[#98A6BB] mt-0.5">
                        {item.id} · Req by {item.requesterName} ({item.requesterRole})
                      </div>
                    </td>

                    {/* When & Where */}
                    <td className="p-3.5 align-top whitespace-nowrap">
                      <div className="text-white font-bold">
                        {formatDay(item.day)} {item.periodRange}
                      </div>
                      <div className="text-[#66E3F0] text-[11px]">
                        {item.assignedRoom ? `Assigned: ${item.assignedRoom}` : `Req: ${item.requestedRoom}`}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3.5 align-top">
                      <CategoryChip
                        category={item.effectiveCategory}
                        isCapped={item.isCapped}
                        originalClaim={item.requestedCategory}
                      />
                    </td>

                    {/* Status */}
                    <td className="p-3.5 align-top">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Decision Reason */}
                    <td className="p-3.5 align-top max-w-xs text-[#cbd5e1] text-[11px] leading-relaxed">
                      <div>{item.decisionReason}</div>
                      {item.decisionReasonCode && (
                        <div className="mt-1 text-[10px] font-mono text-[#98A6BB]">
                          Code: <code>{item.decisionReasonCode}</code>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 align-top text-right whitespace-nowrap">
                      <span className="text-[10px] text-[#98A6BB]/60 font-mono italic">
                        Preview only
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
