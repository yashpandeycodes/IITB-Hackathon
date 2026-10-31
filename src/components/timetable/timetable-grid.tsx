'use client';

import React from 'react';
import {
  DayCode,
  PeriodId,
  SessionItem,
  TimetableAssignment,
  BookingItem,
  TimetableWeek,
} from '@/lib/contracts';
import { SessionCard } from './session-card';
import { PERIOD_MAP, DAYS_LIST } from '@/lib/format';
import { Utensils } from 'lucide-react';

interface TimetableGridProps {
  assignments: TimetableAssignment[];
  sessions: SessionItem[];
  bookings?: BookingItem[];
  week?: TimetableWeek;
  mode?: 'view' | 'diff' | 'edit';
  ghostAssignments?: TimetableAssignment[];
  newAssignments?: TimetableAssignment[];
  onCellClick?: (session: SessionItem, assignment: TimetableAssignment) => void;
  onBookingClick?: (booking: BookingItem) => void;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
  assignments,
  sessions,
  bookings = [],
  week = 'regular',
  mode = 'view',
  ghostAssignments = [],
  newAssignments = [],
  onCellClick,
  onBookingClick,
}) => {
  const isSpectra = week === 'spectra';

  // Periods list: P1..P5, then Lunch, then P6..P9 (and P10..P13 if Spectra)
  const morningPeriods: PeriodId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const afternoonPeriods: PeriodId[] = ['P6', 'P7', 'P8', 'P9'];
  const eveningPeriods: PeriodId[] = isSpectra ? ['P10', 'P11', 'P12', 'P13'] : [];

  const getSession = (sessionId: string) => sessions.find((s) => s.id === sessionId);

  const periodIndex = (p: PeriodId): number => {
    const num = parseInt(p.replace('P', ''), 10);
    return isNaN(num) ? 0 : num;
  };

  // Check if a multi-period session or booking started at an earlier period and is currently spanning
  const isCovered = (day: DayCode, period: PeriodId): boolean => {
    const currentP = periodIndex(period);

    // 1. Check standard assignments
    for (const a of assignments) {
      if (a.day !== day) continue;
      const startP = periodIndex(a.period);
      const sess = getSession(a.sessionId);
      const dur = sess?.durationPeriods ?? 1;
      if (startP < currentP && startP + dur > currentP) {
        return true;
      }
    }

    // 2. Check bookings (Spectra)
    for (const b of bookings) {
      if (b.day !== day) continue;
      const startP = periodIndex(b.periodStart);
      const endP = periodIndex(b.periodEnd);
      if (startP < currentP && endP >= currentP) {
        return true;
      }
    }

    // 3. Check new assignments (diff)
    for (const a of newAssignments) {
      if (a.day !== day) continue;
      const startP = periodIndex(a.period);
      const sess = getSession(a.sessionId);
      const dur = sess?.durationPeriods ?? 1;
      if (startP < currentP && startP + dur > currentP) {
        return true;
      }
    }

    // 4. Check ghost assignments (diff)
    for (const a of ghostAssignments) {
      if (a.day !== day) continue;
      const startP = periodIndex(a.period);
      const sess = getSession(a.sessionId);
      const dur = sess?.durationPeriods ?? 1;
      if (startP < currentP && startP + dur > currentP) {
        return true;
      }
    }

    return false;
  };

  // Compute maximum duration starting at this slot to determine rowSpan
  const getSlotRowSpan = (day: DayCode, period: PeriodId): number => {
    let maxDur = 1;
    for (const a of assignments) {
      if (a.day === day && a.period === period) {
        const sess = getSession(a.sessionId);
        const dur = sess?.durationPeriods ?? 1;
        if (dur > maxDur) maxDur = dur;
      }
    }
    for (const b of bookings) {
      if (b.day === day && b.periodStart === period) {
        const dur = periodIndex(b.periodEnd) - periodIndex(b.periodStart) + 1;
        if (dur > maxDur) maxDur = dur;
      }
    }
    for (const a of newAssignments) {
      if (a.day === day && a.period === period) {
        const sess = getSession(a.sessionId);
        const dur = sess?.durationPeriods ?? 1;
        if (dur > maxDur) maxDur = dur;
      }
    }
    for (const a of ghostAssignments) {
      if (a.day === day && a.period === period) {
        const sess = getSession(a.sessionId);
        const dur = sess?.durationPeriods ?? 1;
        if (dur > maxDur) maxDur = dur;
      }
    }
    return maxDur;
  };

  const renderPeriodRow = (period: PeriodId) => {
    const pMeta = PERIOD_MAP[period];

    return (
      <tr key={period} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
        {/* Time Rail Header */}
        <td className="w-24 sm:w-28 p-2.5 bg-[#0B1220]/90 border-r border-white/10 text-left align-top sticky left-0 z-10">
          <div className="font-mono font-bold text-xs text-white">{period}</div>
          <div className="font-mono text-[10px] text-[#98A6BB]">{pMeta?.timing}</div>
        </td>

        {/* 5 Day Columns (Mon-Fri) */}
        {DAYS_LIST.map((day) => {
          // If already spanned by a session starting earlier, skip rendering td to preserve grid
          if (isCovered(day.code, period)) {
            return null;
          }

          // Check standard assignments (supporting parallel elective basket sessions)
          const cellAssignments = assignments.filter((a) => a.day === day.code && a.period === period);

          // Check ghost assignments (Approval diff)
          const cellGhostAssignments = ghostAssignments.filter((a) => a.day === day.code && a.period === period);

          // Check new assignments (Approval diff)
          const cellNewAssignments = newAssignments.filter((a) => a.day === day.code && a.period === period);

          // Check Spectra event bookings
          const cellBookings = bookings.filter((b) => b.day === day.code && b.periodStart === period);

          const slotSpan = getSlotRowSpan(day.code, period);
          const hasContent =
            cellAssignments.length > 0 ||
            cellGhostAssignments.length > 0 ||
            cellNewAssignments.length > 0 ||
            cellBookings.length > 0;

          return (
            <td
              key={day.code}
              rowSpan={slotSpan > 1 ? slotSpan : 1}
              className={`p-1.5 align-top border-r border-white/5 min-w-[140px] max-w-[220px] transition-colors ${
                slotSpan >= 3 ? 'h-[260px]' : slotSpan === 2 ? 'h-[170px]' : 'h-20 sm:h-24'
              }`}
            >
              {hasContent ? (
                <div className="flex flex-col gap-1.5 h-full justify-start">
                  {/* Standard Assignments (parallel stacked) */}
                  {cellAssignments.map((assignment) => {
                    const session = getSession(assignment.sessionId);
                    if (!session) return null;
                    return (
                      <SessionCard
                        key={assignment.sessionId}
                        session={session}
                        assignment={assignment}
                        onClick={() => onCellClick?.(session, assignment)}
                      />
                    );
                  })}

                  {/* Diff Ghost Assignments */}
                  {cellGhostAssignments.map((ghost) => {
                    const ghostSession = getSession(ghost.sessionId);
                    if (!ghostSession) return null;
                    return <SessionCard key={ghost.sessionId} session={ghostSession} assignment={ghost} isGhost />;
                  })}

                  {/* Diff New Placements */}
                  {cellNewAssignments.map((newAssign) => {
                    const newSession = getSession(newAssign.sessionId);
                    if (!newSession) return null;
                    return (
                      <SessionCard
                        key={newAssign.sessionId}
                        session={newSession}
                        assignment={newAssign}
                        isNewPlacement
                      />
                    );
                  })}

                  {/* Spectra Bookings */}
                  {cellBookings.map((booking) => (
                    <SessionCard
                      key={booking.id}
                      booking={booking}
                      onClick={() => onBookingClick?.(booking)}
                    />
                  ))}
                </div>
              ) : (
                <div className="w-full h-full min-h-[60px] rounded-lg border border-dashed border-white/5 hover:border-white/20 transition-colors flex items-center justify-center text-[10px] font-mono text-white/10 hover:text-white/30">
                  +
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="w-full overflow-x-auto rounded-2xl bg-[#070A12] border border-white/10 shadow-xl">
      <table className="w-full border-collapse text-left">
        {/* Table Day Headers */}
        <thead>
          <tr className="border-b border-white/10 bg-[#0B1220]">
            <th className="w-24 sm:w-28 p-3 text-[11px] font-mono font-bold text-[#98A6BB] uppercase sticky left-0 z-20 bg-[#0B1220]">
              PERIOD
            </th>
            {DAYS_LIST.map((d) => (
              <th
                key={d.code}
                className="p-3 text-xs sm:text-sm font-mono font-bold text-white border-r border-white/5"
              >
                <div className="flex items-center justify-between">
                  <span>{d.full}</span>
                  <span className="text-[10px] text-[#66E3F0] font-normal">{d.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Morning Periods P1 to P5 */}
          {morningPeriods.map((p) => renderPeriodRow(p))}

          {/* Protected Lunch Separator (§3.3 & §5.3) */}
          <tr className="bg-[#120826]/80 border-y border-[#c084fc]/20 text-[#c084fc]">
            <td
              colSpan={6}
              className="py-2.5 px-4 text-center text-xs font-mono font-bold tracking-widest uppercase"
            >
              <div className="flex items-center justify-center gap-2">
                <Utensils className="w-4 h-4 text-[#fbbf24]" />
                <span>Protected Lunch Hour • 13:00–14:00 (Zero Academic Classes)</span>
              </div>
            </td>
          </tr>

          {/* Afternoon Periods P6 to P9 */}
          {afternoonPeriods.map((p) => renderPeriodRow(p))}

          {/* Spectra Week Evening Band (§3.3 & §5.3) */}
          {isSpectra && (
            <>
              <tr className="bg-gradient-to-r from-pink-950/40 via-purple-950/40 to-pink-950/40 border-y border-pink-500/30 text-pink-300">
                <td
                  colSpan={6}
                  className="py-2.5 px-4 text-center text-xs font-mono font-bold tracking-widest uppercase"
                >
                  ⚡ Evening • Events Only (Spectra Week 7 Coordination • P10–P13)
                </td>
              </tr>
              {eveningPeriods.map((p) => renderPeriodRow(p))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
