'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { CAMPUS_ROOMS, REGULAR_ASSIGNMENTS, TIMETABLE_SESSIONS } from '@/lib/dataset/cit-data';
import { DayCode, PeriodId } from '@/lib/contracts';
import { PERIOD_MAP, DAYS_LIST } from '@/lib/format';
import {
  Building2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Accessibility,
  Tv,
  Mic,
  Monitor,
  Wind,
  Zap,
  ArrowRight,
  Calendar,
  Grid3X3,
  List,
} from 'lucide-react';

export default function RoomsExplorerPage() {
  const router = useRouter();

  const [selectedDay, setSelectedDay] = useState<DayCode>('MON');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodId>('P3');
  const [minCapacity, setMinCapacity] = useState<number>(0);
  const [roomType, setRoomType] = useState<string>('All');
  const [onlyAccessible, setOnlyAccessible] = useState<boolean>(false);
  const [selectedFeature, setSelectedFeature] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards');

  const allPeriods: PeriodId[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13'];

  // Check if a room is occupied at a given day and period
  const getRoomOccupant = (roomId: string, day: DayCode, period: PeriodId) => {
    const assignment = REGULAR_ASSIGNMENTS.find(
      (a) => a.roomId === roomId && a.day === day && a.period === period
    );
    if (!assignment) return null;
    return TIMETABLE_SESSIONS.find((s) => s.id === assignment.sessionId) || null;
  };

  // Filtered rooms
  const filteredRooms = CAMPUS_ROOMS.filter((room) => {
    if (minCapacity > 0 && room.capacity < minCapacity) return false;
    if (roomType !== 'All' && room.type !== roomType) return false;
    if (onlyAccessible && !room.isAccessible) return false;
    if (selectedFeature !== 'All' && !room.features.includes(selectedFeature)) return false;
    return true;
  });

  return (
    <AppShell
      pageTitle="Find a Free Venue"
      breadcrumbs={[{ label: 'Find a room' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Filters Panel (§5.4) */}
        <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#66E3F0]" />
              <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Availability & Feature Search
              </h2>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-[#101A2B] border border-white/10">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/40'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Room Cards</span>
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                  viewMode === 'matrix'
                    ? 'bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/40'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Matrix Grid</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Day Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">TARGET DAY</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value as DayCode)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                {DAYS_LIST.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.full} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Period Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">TARGET PERIOD</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value as PeriodId)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                {allPeriods.map((p) => (
                  <option key={p} value={p}>
                    {p} ({PERIOD_MAP[p]?.timing})
                  </option>
                ))}
              </select>
            </div>

            {/* Room Type */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">ROOM TYPE</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value="All">All Venue Types</option>
                <option value="Lecture Hall">Lecture Hall</option>
                <option value="Seminar Hall">Seminar Hall</option>
                <option value="Auditorium">Auditorium</option>
                <option value="Computing Lab">Computing Lab</option>
                <option value="Department Lab">Department Lab</option>
                <option value="Open Air Theatre">Open Air Theatre</option>
              </select>
            </div>

            {/* Min Capacity */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">MIN CAPACITY</label>
              <select
                value={minCapacity}
                onChange={(e) => setMinCapacity(Number(e.target.value))}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value={0}>Any Size</option>
                <option value={50}>50+ Seats</option>
                <option value={100}>100+ Seats</option>
                <option value={150}>150+ Seats</option>
                <option value={500}>500+ Seats (Grand)</option>
              </select>
            </div>

            {/* Specific Equipment */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">EQUIPMENT</label>
              <select
                value={selectedFeature}
                onChange={(e) => setSelectedFeature(e.target.value)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value="All">Any Features</option>
                <option value="Projector">Projector Required</option>
                <option value="PA System">PA System / Mic</option>
                <option value="Computers">Workstation Computers</option>
                <option value="Stage">Raised Stage</option>
                <option value="Power Benches">Power Benches</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={onlyAccessible}
                onChange={(e) => setOnlyAccessible(e.target.checked)}
                className="rounded bg-[#101A2B] border-white/20 text-[#66E3F0]"
              />
              <Accessibility className="w-3.5 h-3.5 text-[#66E3F0]" />
              <span>Wheelchair Accessible Only</span>
            </label>

            <span className="text-xs font-mono text-[#98A6BB]">
              Showing {filteredRooms.length} of {CAMPUS_ROOMS.length} campus venues
            </span>
          </div>
        </div>

        {/* View 1: Room Cards (§5.4) */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => {
              const occupant = getRoomOccupant(room.id, selectedDay, selectedPeriod);
              const isFree = !occupant;

              return (
                <div
                  key={room.id}
                  className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                    isFree
                      ? 'bg-[#0B1220] border-white/10 hover:border-emerald-500/50 shadow-sm'
                      : 'bg-[#070A12]/80 border-white/5 opacity-80'
                  }`}
                >
                  <div>
                    {/* Header: Room ID, Type & Free Status */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-base text-white">{room.id}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[#cbd5e1]">
                          {room.type}
                        </span>
                      </div>

                      {isFree ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Free ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          <XCircle className="w-3.5 h-3.5" />
                          Busy ✕
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-semibold text-white/90 mb-2">{room.name}</div>
                    <div className="text-[11px] font-mono text-[#98A6BB] mb-3">
                      {room.building} · Floor {room.floor} · {room.capacity} Seats
                    </div>

                    {/* Features Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {room.isAccessible && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                          <Accessibility className="w-2.5 h-2.5" />
                          Accessible
                        </span>
                      )}
                      {room.features.map((f) => (
                        <span key={f} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[#98A6BB]">
                          {f}
                        </span>
                      ))}
                    </div>

                    {/* Current Period Diagnosis */}
                    <div className="p-2.5 rounded-xl bg-[#070A12] border border-white/5 text-xs font-mono">
                      {isFree ? (
                        <span className="text-emerald-400">
                          ✓ Available for reservation on {selectedDay} {selectedPeriod} ({PERIOD_MAP[selectedPeriod]?.timing})
                        </span>
                      ) : (
                        <span className="text-rose-300">
                          ✕ Occupied by <strong>{occupant?.courseCode}</strong> ({occupant?.courseName})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Booking CTA Button */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <Link
                      href={`/timetable/room/${room.id}`}
                      className="text-xs font-mono text-[#66E3F0] hover:underline"
                    >
                      View Full Week ▸
                    </Link>

                    {isFree ? (
                      <Link
                        href={`/bookings/new?room=${room.id}&day=${selectedDay}&period=${selectedPeriod}`}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-black shadow-sm flex items-center gap-1.5 transition-opacity"
                      >
                        <span>Book This</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 text-white/30 cursor-not-allowed"
                      >
                        Unavailable
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View 2: Room Availability Matrix (§5.4) */}
        {viewMode === 'matrix' && (
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm overflow-x-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white">
                Matrix View: All Rooms on {selectedDay} (Tap a free cell to book)
              </span>
              <span className="text-[11px] font-mono text-[#98A6BB]">Green = Free · Dark = Occupied</span>
            </div>

            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B]">
                  <th className="p-2 text-left w-32 sticky left-0 z-10 bg-[#101A2B]">Room</th>
                  {allPeriods.map((p) => (
                    <th key={p} className="p-2 text-center border-l border-white/5">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => (
                  <tr key={room.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2 font-bold text-white sticky left-0 z-10 bg-[#0B1220] whitespace-nowrap">
                      {room.id} <span className="text-[10px] text-[#98A6BB] font-normal">({room.capacity})</span>
                    </td>
                    {allPeriods.map((period) => {
                      const occupant = getRoomOccupant(room.id, selectedDay, period);
                      const isFree = !occupant;

                      return (
                        <td key={period} className="p-1 border-l border-white/5 text-center">
                          {isFree ? (
                            <Link
                              href={`/bookings/new?room=${room.id}&day=${selectedDay}&period=${period}`}
                              title={`${room.id} is Free on ${selectedDay} ${period}. Click to book.`}
                              className="block py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-bold text-[10px] transition-colors"
                            >
                              ✓
                            </Link>
                          ) : (
                            <span
                              title={`Occupied by ${occupant?.courseCode}`}
                              className="block py-1.5 rounded bg-white/5 text-white/30 text-[10px]"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
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

