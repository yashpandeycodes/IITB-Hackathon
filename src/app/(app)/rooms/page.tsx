'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useQueries } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import {
  RoomAvailabilitySchema,
  type Day,
  type RoomType,
  type Feature,
} from '@/lib/contracts';
import { useReferenceData } from '@/hooks/use-reference-data';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/states/error-state';
import { EmptyState } from '@/components/states/empty-state';
import { PERIOD_MAP, DAYS_LIST } from '@/lib/format';
import { z } from 'zod';
import {
  Building2,
  Filter,
  CheckCircle2,
  XCircle,
  Accessibility,
  Grid3X3,
  List,
  ArrowRight,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

const ROOM_TYPES: Array<{ value: RoomType; label: string }> = [
  { value: 'lecture_hall', label: 'Lecture Hall' },
  { value: 'auditorium', label: 'Auditorium' },
  { value: 'seminar_hall', label: 'Seminar Hall' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'outdoor', label: 'Open Air Theatre / Outdoor' },
  { value: 'lab_cs', label: 'Computing Lab (CS)' },
  { value: 'lab_elec', label: 'Electronics Lab' },
  { value: 'lab_phy', label: 'Physics Lab' },
  { value: 'workshop', label: 'Mechanical Workshop' },
  { value: 'lab_civil', label: 'Civil Lab' },
];

const FEATURES_LIST: Array<{ value: Feature; label: string }> = [
  { value: 'projector', label: 'Projector' },
  { value: 'ac', label: 'Air Conditioned (AC)' },
  { value: 'pa_system', label: 'PA System / Microphone' },
  { value: 'stage', label: 'Raised Stage' },
  { value: 'computers', label: 'Workstation Computers' },
  { value: 'power_benches', label: 'Power Benches' },
];

export default function RoomsExplorerPage() {
  const { referenceData, isLoading: isRefLoading } = useReferenceData();

  // Filter States
  const [selectedDay, setSelectedDay] = useState<Day>('MON');
  const [fromPeriod, setFromPeriod] = useState<number>(3);
  const [toPeriod, setToPeriod] = useState<number>(3);
  const [minCapacity, setMinCapacity] = useState<number>(0);
  const [roomType, setRoomType] = useState<string>('all');
  const [selectedFeature, setSelectedFeature] = useState<string>('all');
  const [onlyAccessible, setOnlyAccessible] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards');

  // Ensure toPeriod >= fromPeriod
  const effectiveToPeriod = Math.max(fromPeriod, toPeriod);

  // Period list for 1..13
  const allPeriodNumbers = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 1), []);

  // Fast room metadata lookup
  const roomMetaMap = useMemo(() => {
    return new Map(referenceData.rooms.map((r) => [r.id, r]));
  }, [referenceData.rooms]);

  // Construct query parameters for Cards View
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('day', selectedDay);
    params.set('from_period', String(fromPeriod));
    params.set('to_period', String(effectiveToPeriod));
    if (minCapacity > 0) {
      params.set('min_capacity', String(minCapacity));
    }
    if (roomType !== 'all') {
      params.set('types', roomType);
    }
    if (selectedFeature !== 'all') {
      params.set('needs', selectedFeature);
    }
    if (onlyAccessible) {
      params.set('accessible', 'true');
    }
    return params.toString();
  }, [selectedDay, fromPeriod, effectiveToPeriod, minCapacity, roomType, selectedFeature, onlyAccessible]);

  // 1. Cards View Query
  const {
    data: availabilityData,
    isLoading: isAvailLoading,
    isError: isAvailError,
    error: availError,
    refetch: refetchAvailability,
  } = useQuery({
    queryKey: ['rooms', 'available', selectedDay, fromPeriod, effectiveToPeriod, minCapacity, roomType, selectedFeature, onlyAccessible],
    queryFn: () => apiGet(`/api/rooms/available?${queryParams}`, z.array(RoomAvailabilitySchema)),
    staleTime: 15_000,
  });

  // 2. Matrix View Queries (periods 1..13 on selectedDay)
  const matrixQueries = useQueries({
    queries: allPeriodNumbers.map((periodNum) => {
      const pParams = new URLSearchParams();
      pParams.set('day', selectedDay);
      pParams.set('from_period', String(periodNum));
      pParams.set('to_period', String(periodNum));
      if (minCapacity > 0) pParams.set('min_capacity', String(minCapacity));
      if (roomType !== 'all') pParams.set('types', roomType);
      if (selectedFeature !== 'all') pParams.set('needs', selectedFeature);
      if (onlyAccessible) pParams.set('accessible', 'true');

      return {
        queryKey: ['rooms', 'available', 'matrix', selectedDay, periodNum, minCapacity, roomType, selectedFeature, onlyAccessible],
        queryFn: () => apiGet(`/api/rooms/available?${pParams.toString()}`, z.array(RoomAvailabilitySchema)),
        enabled: viewMode === 'matrix',
        staleTime: 30_000,
      };
    }),
  });

  const isMatrixLoading = viewMode === 'matrix' && matrixQueries.some((q) => q.isLoading);

  const resetFilters = () => {
    setSelectedDay('MON');
    setFromPeriod(3);
    setToPeriod(3);
    setMinCapacity(0);
    setRoomType('all');
    setSelectedFeature('all');
    setOnlyAccessible(false);
  };

  const totalCampusRooms = referenceData.rooms.length;
  const filteredRoomsCount = availabilityData?.length ?? 0;
  const freeRoomsCount = availabilityData?.filter((r) => r.free).length ?? 0;

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

            {/* View Mode Switcher & Reset */}
            <div className="flex items-center gap-2">
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono text-[#98A6BB] hover:text-white hover:bg-white/5 transition-colors"
                title="Reset all search filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
            {/* Day Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">TARGET DAY</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value as Day)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
              >
                {DAYS_LIST.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.full} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* From Period Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">FROM PERIOD</label>
              <select
                value={fromPeriod}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setFromPeriod(val);
                  if (val > toPeriod) setToPeriod(val);
                }}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
              >
                {allPeriodNumbers.map((p) => {
                  const code = `P${p}` as keyof typeof PERIOD_MAP;
                  return (
                    <option key={p} value={p}>
                      P{p} ({PERIOD_MAP[code]?.timing ?? ''})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* To Period Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">TO PERIOD</label>
              <select
                value={effectiveToPeriod}
                onChange={(e) => setToPeriod(Number(e.target.value))}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
              >
                {allPeriodNumbers
                  .filter((p) => p >= fromPeriod)
                  .map((p) => {
                    const code = `P${p}` as keyof typeof PERIOD_MAP;
                    return (
                      <option key={p} value={p}>
                        P{p} ({PERIOD_MAP[code]?.timing ?? ''})
                      </option>
                    );
                  })}
              </select>
            </div>

            {/* Room Type */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">ROOM TYPE</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
              >
                <option value="all">All Venue Types</option>
                {ROOM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Min Capacity */}
            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">MIN CAPACITY</label>
              <select
                value={minCapacity}
                onChange={(e) => setMinCapacity(Number(e.target.value))}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
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
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
              >
                <option value="all">Any Features</option>
                {FEATURES_LIST.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={onlyAccessible}
                onChange={(e) => setOnlyAccessible(e.target.checked)}
                className="rounded bg-[#101A2B] border-white/20 text-[#66E3F0]"
              >
              </input>
              <Accessibility className="w-3.5 h-3.5 text-[#66E3F0]" />
              <span>Wheelchair Accessible Only</span>
            </label>

            <span className="text-xs font-mono text-[#98A6BB]">
              Showing <strong className="text-white">{filteredRoomsCount}</strong> venues ({' '}
              <strong className="text-emerald-400">{freeRoomsCount} free</strong> ) of {totalCampusRooms} campus venues
            </span>
          </div>
        </div>

        {/* View 1: Room Cards (§5.4) */}
        {viewMode === 'cards' && (
          <>
            {isAvailLoading || isRefLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-8 h-8 text-[#66E3F0] animate-spin mx-auto mb-3" />
                <p className="text-xs font-mono text-[#98A6BB]">Checking real-time venue availability...</p>
              </div>
            ) : isAvailError ? (
              <ErrorState
                title="Failed to query room availability"
                message={availError instanceof Error ? availError.message : 'Unable to query availability from server.'}
                onRetry={() => refetchAvailability()}
              />
            ) : !availabilityData || availabilityData.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No matching rooms found"
                description="No campus venues meet the selected capacity, feature or type criteria for this time window."
                cta={{ label: 'Reset Search Filters', href: '/rooms' }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availabilityData.map((roomAvail) => {
                  const meta = roomMetaMap.get(roomAvail.room_id);
                  const isFree = roomAvail.free;
                  const busyEntries = roomAvail.busy_with;

                  return (
                    <div
                      key={roomAvail.room_id}
                      className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                        isFree
                          ? 'bg-[#0B1220] border-white/10 hover:border-emerald-500/50 shadow-sm'
                          : 'bg-[#070A12]/80 border-white/5 opacity-85'
                      }`}
                    >
                      <div>
                        {/* Header: Room ID, Type & Free Status */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-base text-white">{roomAvail.room_id}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[#cbd5e1]">
                              {meta?.type ?? 'Venue'}
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

                        <div className="text-xs font-semibold text-white/90 mb-1">
                          {meta?.name ?? roomAvail.room_id}
                        </div>
                        <div className="text-[11px] font-mono text-[#98A6BB] mb-3">
                          {meta?.building ?? 'Campus'} · {meta?.capacity ?? 0} Seats
                        </div>

                        {/* Features Badges */}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {meta?.accessible && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              <Accessibility className="w-2.5 h-2.5" />
                              Accessible
                            </span>
                          )}
                          {meta?.features.map((f) => (
                            <span key={f} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[#98A6BB]">
                              {f}
                            </span>
                          ))}
                        </div>

                        {/* Current Period Diagnosis */}
                        <div className="p-3 rounded-xl bg-[#070A12] border border-white/5 text-xs font-mono space-y-1">
                          {isFree ? (
                            <span className="text-emerald-400 leading-relaxed block">
                              ✓ Available for reservation on {selectedDay} P{fromPeriod}
                              {fromPeriod !== effectiveToPeriod ? `–P${effectiveToPeriod}` : ''}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-rose-400 font-bold block">Occupied:</span>
                              {busyEntries.map((b, idx) => (
                                <div key={idx} className="text-rose-300 text-[11px] flex items-center gap-1.5">
                                  <span>•</span>
                                  <span>{b.label}</span>
                                  {b.pending_approval && (
                                    <span className="text-[9px] px-1 rounded bg-[#8279FF]/20 text-[#8279FF] border border-[#8279FF]/30">
                                      Tentative
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Booking CTA Button */}
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                        <Link
                          href={`/timetable/room/${roomAvail.room_id}`}
                          className="text-xs font-mono text-[#66E3F0] hover:underline"
                        >
                          View Full Schedule ▸
                        </Link>

                        {isFree ? (
                          <Link
                            href={`/bookings/new?room=${roomAvail.room_id}&day=${selectedDay}&period=P${fromPeriod}`}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-black shadow-sm flex items-center gap-1.5 transition-opacity"
                          >
                            <span>Book Venue</span>
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
          </>
        )}

        {/* View 2: Room Availability Matrix (§5.4) */}
        {viewMode === 'matrix' && (
          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm overflow-x-auto">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-white block">
                  Matrix View: All Filtered Venues on {selectedDay} (Tap a free cell to book)
                </span>
                <span className="text-[11px] font-mono text-[#98A6BB]">
                  Green = Free (Click to book) · Dark = Occupied · Real-time backend query
                </span>
              </div>
              {isMatrixLoading && (
                <span className="text-xs font-mono text-[#66E3F0] flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading Matrix...</span>
                </span>
              )}
            </div>

            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B]">
                  <th className="p-2 text-left w-36 sticky left-0 z-10 bg-[#101A2B]">Room</th>
                  {allPeriodNumbers.map((p) => {
                    const code = `P${p}` as keyof typeof PERIOD_MAP;
                    return (
                      <th
                        key={p}
                        className="p-2 text-center border-l border-white/5 min-w-[52px]"
                        title={PERIOD_MAP[code]?.timing ?? ''}
                      >
                        P{p}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {referenceData.rooms
                  .filter((room) => {
                    if (minCapacity > 0 && room.capacity < minCapacity) return false;
                    if (roomType !== 'all' && room.type !== roomType) return false;
                    if (onlyAccessible && !room.accessible) return false;
                    if (selectedFeature !== 'all' && !room.features.includes(selectedFeature as Feature)) return false;
                    return true;
                  })
                  .map((room) => {
                    return (
                      <tr key={room.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-2 font-bold text-white sticky left-0 z-10 bg-[#0B1220] whitespace-nowrap">
                          <Link href={`/timetable/room/${room.id}`} className="hover:text-[#66E3F0]">
                            {room.id}
                          </Link>{' '}
                          <span className="text-[10px] text-[#98A6BB] font-normal">({room.capacity})</span>
                        </td>
                        {allPeriodNumbers.map((periodNum) => {
                          const periodQuery = matrixQueries[periodNum - 1];
                          const roomAvail = periodQuery?.data?.find((r) => r.room_id === room.id);
                          const isFree = roomAvail?.free ?? false;
                          const busyLabel = roomAvail?.busy_with?.map((b) => b.label).join(', ') ?? '';

                          return (
                            <td key={periodNum} className="p-1 border-l border-white/5 text-center">
                              {periodQuery?.isLoading ? (
                                <span className="block py-1.5 text-white/20 text-[9px] animate-pulse">...</span>
                              ) : isFree ? (
                                <Link
                                  href={`/bookings/new?room=${room.id}&day=${selectedDay}&period=P${periodNum}`}
                                  title={`${room.id} is Free on ${selectedDay} P${periodNum}. Click to book.`}
                                  className="block py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-bold text-[10px] transition-colors"
                                >
                                  ✓
                                </Link>
                              ) : (
                                <span
                                  title={busyLabel ? `Occupied: ${busyLabel}` : 'Unavailable'}
                                  className="block py-1.5 rounded bg-white/5 text-white/30 text-[10px] cursor-help"
                                >
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
