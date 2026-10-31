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

  // Check if a 3-hour lab started at an earlier period and is currently spanning
  const isCoveredByLabSpan = (day: DayCode, period: PeriodId) => {
    if (period === 'P3') {
      const p2 = assignments.find((a) => a.day === day && a.period === 'P2');
      const sess = p2 ? getSession(p2.sessionId) : null;
      if (sess?.kind === 'lab') return true;
    }
    if (period === 'P4') {
      const p2 = assignments.find((a) => a.day === day && a.period === 'P2');
      const sess = p2 ? getSession(p2.sessionId) : null;
      if (sess?.kind === 'lab') return true;
    }
    if (period === 'P7') {
      const p6 = assignments.find((a) => a.day === day && a.period === 'P6');
      const sess = p6 ? getSession(p6.sessionId) : null;
      if (sess?.kind === 'lab') return true;
    }
    if (period === 'P8') {
      const p6 = assignments.find((a) => a.day === day && a.period === 'P6');
      const sess = p6 ? getSession(p6.sessionId) : null;
      if (sess?.kind === 'lab') return true;
    }
    return false;
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
          // If already spanned by a 3-hour lab that started at P2 or P6, skip rendering td to preserve grid
          if (isCoveredByLabSpan(day.code, period)) {
            return null;
          }

          // Check standard assignment
          const assignment = assignments.find((a) => a.day === day.code && a.period === period);
          const session = assignment ? getSession(assignment.sessionId) : undefined;

          // Check ghost assignment (Approval diff)
          const ghost = ghostAssignments.find((a) => a.day === day.code && a.period === period);
          const ghostSession = ghost ? getSession(ghost.sessionId) : undefined;

          // Check new assignment (Approval diff)
          const newAssign = newAssignments.find((a) => a.day === day.code && a.period === period);
          const newSession = newAssign ? getSession(newAssign.sessionId) : undefined;

          // Check Spectra event booking
          const booking = bookings.find((b) => b.day === day.code && b.periodStart === period);

          const isLabStart = session?.kind === 'lab' && (period === 'P2' || period === 'P6');

          return (
            <td
              key={day.code}
              rowSpan={isLabStart ? 3 : 1}
              className={`p-1.5 align-top border-r border-white/5 min-w-[140px] max-w-[200px] h-20 sm:h-24 transition-colors ${
                isLabStart ? 'h-[280px]' : ''
              }`}
            >
              {session && assignment ? (
                <SessionCard
                  session={session}
                  assignment={assignment}
                  onClick={() => onCellClick?.(session, assignment)}
                />
              ) : ghost && ghostSession ? (
                <SessionCard session={ghostSession} assignment={ghost} isGhost />
              ) : newAssign && newSession ? (
                <SessionCard session={newSession} assignment={newAssign} isNewPlacement />
              ) : booking ? (
                <SessionCard booking={booking} onClick={() => onBookingClick?.(booking)} />
              ) : (
                <div className="w-full h-full rounded-lg border border-dashed border-white/5 hover:border-white/20 transition-colors flex items-center justify-center text-[10px] font-mono text-white/10 hover:text-white/30">
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

