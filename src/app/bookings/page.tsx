'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { SPECTRA_BOOKINGS } from '@/lib/dataset/cit-data';
import { StatusBadge, CategoryChip } from '@/components/semantic/badges';
import { Ticket, Filter, Ban, CheckCircle2, ArrowRight } from 'lucide-react';
import { BookingStatus, DayCode } from '@/lib/contracts';
import { formatDay } from '@/lib/format';

export default function MyBookingsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [bookingsList, setBookingsList] = useState(SPECTRA_BOOKINGS);

  const filtered = bookingsList.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (dayFilter !== 'all' && b.day !== dayFilter) return false;
    return true;
  });

  const handleCancelBooking = (id: string) => {
    setBookingsList((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' as BookingStatus } : b))
    );
  };

  const handleAcceptAlternative = (id: string) => {
    setBookingsList((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              status: 'approved' as BookingStatus,
              assignedRoomId: b.alternativeOffer?.roomId || b.assignedRoomId,
              assignedRoomName: b.alternativeOffer?.roomName || b.assignedRoomName,
            }
          : b
      )
    );
  };

  return (
    <AppShell
      pageTitle="Institutional Bookings"
      breadcrumbs={[{ label: 'Bookings' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
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
          /* Bookings Table (Desktop) / Cards (Mobile) (§5.6) */
          <div className="overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B] text-[11px] font-mono text-[#98A6BB] uppercase">
                  <th className="p-3.5">ID / Event</th>
                  <th className="p-3.5">When & Where</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Reason (Always Visible)</th>
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
                        {item.id} · Req by {item.requesterName}
                      </div>
                    </td>

                    {/* When & Where */}
                    <td className="p-3.5 align-top whitespace-nowrap">
                      <div className="text-white font-bold">
                        {formatDay(item.day)} {item.periodStart}–{item.periodEnd}
                      </div>
                      <div className="text-[#66E3F0] text-[11px]">
                        {item.assignedRoomName || item.requestedRoomId}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3.5 align-top">
                      <CategoryChip
                        category={item.effectiveCategory}
                        isCapped={item.isCapped}
                        originalClaim={item.originalClaim}
                      />
                    </td>

                    {/* Status */}
                    <td className="p-3.5 align-top">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Decision Reason (Always Visible per §5.6) */}
                    <td className="p-3.5 align-top max-w-xs text-[#cbd5e1] text-[11px] leading-relaxed">
                      {item.decisionReason}
                      {item.alternativeOffer && (
                        <div className="mt-1 text-amber-300 font-bold">
                          Alternative slot: {item.alternativeOffer.day} {item.alternativeOffer.roomId}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 align-top text-right whitespace-nowrap">
                      {item.status === 'alternative' && (
                        <button
                          onClick={() => handleAcceptAlternative(item.id)}
                          className="mr-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] border border-emerald-500/30 transition-colors"
                        >
                          Accept Alt
                        </button>
                      )}
                      {item.status !== 'cancelled' && item.status !== 'rejected' && (
                        <button
                          onClick={() => handleCancelBooking(item.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-300 text-[10px] border border-white/10 hover:border-rose-500/30 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
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

