'use client';

import React, { useState } from 'react';
import {
  DayCode,
  SessionItem,
  TimetableAssignment,
  BookingItem,
  TimetableWeek,
} from '@/lib/contracts';
import { SessionCard } from './session-card';
import { PERIOD_MAP, DAYS_LIST } from '@/lib/format';
import { Utensils } from 'lucide-react';

interface AgendaListProps {
  assignments: TimetableAssignment[];
  sessions: SessionItem[];
  bookings?: BookingItem[];
  week?: TimetableWeek;
  onCellClick?: (session: SessionItem, assignment: TimetableAssignment) => void;
  onBookingClick?: (booking: BookingItem) => void;
}

export const AgendaList: React.FC<AgendaListProps> = ({
  assignments,
  sessions,
  bookings = [],
  week = 'regular',
  onCellClick,
  onBookingClick,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayCode>('MON');
  const getSession = (sessionId: string) => sessions.find((s) => s.id === sessionId);

  const periods = week === 'spectra'
    ? ['P1', 'P2', 'P3', 'P4', 'P5', 'LUNCH', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13']
    : ['P1', 'P2', 'P3', 'P4', 'P5', 'LUNCH', 'P6', 'P7', 'P8', 'P9'];

  return (
    <div className="w-full space-y-4">
      {/* Day Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B1220] border border-white/10 overflow-x-auto">
        {DAYS_LIST.map((d) => (
          <button
            key={d.code}
            onClick={() => setSelectedDay(d.code)}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
              selectedDay === d.code
                ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12] shadow-md'
                : 'text-[#98A6BB] hover:text-white hover:bg-white/5'
            }`}
          >
            {d.compact}
          </button>
        ))}
      </div>

      {/* Vertical Agenda Timeline */}
      <div className="space-y-3">
        {periods.map((item) => {
          if (item === 'LUNCH') {
            return (
              <div
                key="lunch"
                className="py-2.5 px-4 rounded-xl bg-[#14082c] border border-[#a855f7]/30 text-center text-xs font-mono font-bold text-[#fbbf24] flex items-center justify-center gap-2"
              >
                <Utensils className="w-4 h-4" />
                <span>Protected Lunch Hour • 13:00–14:00</span>
              </div>
            );
          }

          const period = item as any;
          const pMeta = PERIOD_MAP[period as keyof typeof PERIOD_MAP];
          const assignment = assignments.find((a) => a.day === selectedDay && a.period === period);
          const session = assignment ? getSession(assignment.sessionId) : undefined;
          const booking = bookings.find((b) => b.day === selectedDay && b.periodStart === period);

          return (
            <div
              key={period}
              className="flex items-stretch gap-3 p-3 rounded-2xl bg-[#0B1220] border border-white/10"
            >
              {/* Left Time Rail */}
              <div className="w-20 shrink-0 text-left border-r border-white/10 pr-2 flex flex-col justify-center">
                <span className="font-mono font-black text-sm text-white">{period}</span>
                <span className="font-mono text-[10px] text-[#98A6BB]">{pMeta?.timing}</span>
              </div>

              {/* Right Content */}
              <div className="flex-1 min-h-[70px]">
                {session && assignment ? (
                  <SessionCard
                    session={session}
                    assignment={assignment}
                    onClick={() => onCellClick?.(session, assignment)}
                  />
                ) : booking ? (
                  <SessionCard booking={booking} onClick={() => onBookingClick?.(booking)} />
                ) : (
                  <div className="h-full rounded-xl border border-dashed border-white/5 flex items-center justify-center text-xs font-mono text-white/20">
                    Free Slot
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

