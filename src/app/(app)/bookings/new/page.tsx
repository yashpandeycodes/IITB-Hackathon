'use client';

import React, { useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { AppShell } from '@/components/layout/app-shell';
import { apiGet } from '@/lib/api-client';
import {
  DayCode,
  PeriodId,
  PriorityCategory,
  RoomAvailabilitySchema,
  BookingDraftSchema,
} from '@/lib/contracts';
import { useReferenceData } from '@/hooks/use-reference-data';
import { CategoryChip } from '@/components/semantic/badges';
import {
  Sparkles,
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  AlertTriangle,
  Bot,
  Ticket,
} from 'lucide-react';

function BookingContent() {
  const searchParams = useSearchParams();
  const { referenceData, roomName } = useReferenceData();

  // Prefills from query parameters (e.g. from /rooms "Book this")
  const prefillRoom = searchParams.get('room') || 'SH-1';
  const prefillDay = (searchParams.get('day') as DayCode) || 'TUE';
  const prefillPeriod = (searchParams.get('period') as PeriodId) || 'P10';

  const [activeTab, setActiveTab] = useState<'describe' | 'form'>('describe');
  const [nlQuery, setNlQuery] = useState('');
  const [isAiOff, setIsAiOff] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Form State
  const [title, setTitle] = useState('Rehearsal & Setup');
  const [attendance, setAttendance] = useState<number>(100);
  const [day, setDay] = useState<DayCode>(prefillDay);
  const [periodStart, setPeriodStart] = useState<PeriodId>(prefillPeriod);
  const [durationHours, setDurationHours] = useState<number>(2);
  const [roomType, setRoomType] = useState('Seminar Hall');
  const [requestedRoom, setRequestedRoom] = useState(prefillRoom);
  const [needs, setNeeds] = useState<string[]>(['PA System', 'Projector']);
  const [requesterRole, setRequesterRole] = useState<'Club Representative' | 'Faculty' | 'Admin'>('Club Representative');

  // Assumption chips and follow-up card state (§5.5)
  const [assumptions, setAssumptions] = useState<Array<{ field: string; source: string; value: string }>>([
    { field: 'attendance', source: '"100 log"', value: '100' },
    { field: 'day', source: '"kal" → Tue (ref Mon)', value: 'TUE' },
    { field: 'needs', source: '"mic chahiye"', value: 'PA System' },
  ]);

  const [followUp, setFollowUp] = useState<string | null>(null);

  // Period math for live room query
  const fromPeriodNum = parseInt(periodStart.replace('P', ''), 10) || 10;
  const toPeriodNum = Math.min(13, fromPeriodNum + durationHours - 1);

  // Query real room availability from backend
  const availQueryParams = new URLSearchParams({
    day,
    from_period: fromPeriodNum.toString(),
    to_period: toPeriodNum.toString(),
  });

  const { data: availableRooms, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['rooms', 'available', day, fromPeriodNum, toPeriodNum],
    queryFn: () =>
      apiGet(`/api/rooms/available?${availQueryParams.toString()}`, z.array(RoomAvailabilitySchema)),
    staleTime: 15_000,
  });

  // Validate draft structure against contract schema
  const draftValidation = useMemo(() => {
    return BookingDraftSchema.safeParse({
      title,
      attendance: Number(attendance),
      duration_periods: durationHours,
      windows: [
        {
          day,
          from_period: fromPeriodNum,
          to_period: toPeriodNum,
        },
      ],
      room_types: ['seminar_hall'],
      needs: needs.map((n) => n.toLowerCase().replace(/ /g, '_')),
      requested_room: requestedRoom || null,
      mandatory_for_groups: [],
      repeat_days: [],
      assumptions: assumptions.map((a) => `${a.field}: ${a.value}`),
      follow_up: followUp,
    });
  }, [title, attendance, durationHours, day, fromPeriodNum, toPeriodNum, requestedRoom, needs, assumptions, followUp]);

  // Sample Hinglish queries (§5.5)
  const sampleQueries = [
    { label: 'Hinglish Rehearsal', text: 'seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye' },
    { label: 'OAT Robowars', text: 'open air theatre on Thursday 7 PM for 400 attendees with stage lights' },
    { label: 'Vague Request', text: 'need big room tomorrow evening for coding club meet' },
  ];

  // Natural language parser simulation
  const handleParseNl = (queryText: string) => {
    setNlQuery(queryText);
    const lower = queryText.toLowerCase();

    const newAssumptions: Array<{ field: string; source: string; value: string }> = [];

    if (lower.includes('100 log') || lower.includes('100')) {
      setAttendance(100);
      newAssumptions.push({ field: 'attendance', source: '"100 log"', value: '100' });
    } else if (lower.includes('400')) {
      setAttendance(400);
      newAssumptions.push({ field: 'attendance', source: '"400 attendees"', value: '400' });
    }

    if (lower.includes('kal') || lower.includes('tomorrow') || lower.includes('tuesday')) {
      setDay('TUE');
      newAssumptions.push({ field: 'day', source: '"kal" → Tue (ref Mon)', value: 'TUE' });
    } else if (lower.includes('thursday')) {
      setDay('THU');
      newAssumptions.push({ field: 'day', source: '"Thursday"', value: 'THU' });
    }

    if (lower.includes('seminar hall')) {
      setRoomType('Seminar Hall');
      setRequestedRoom('SH-1');
      newAssumptions.push({ field: 'roomType', source: '"seminar hall"', value: 'Seminar Hall (SH-1)' });
    } else if (lower.includes('open air theatre') || lower.includes('oat')) {
      setRoomType('Open Air Theatre');
      setRequestedRoom('OAT');
      newAssumptions.push({ field: 'roomType', source: '"open air theatre"', value: 'OAT' });
    }

    if (lower.includes('mic') || lower.includes('pa system')) {
      setNeeds(['PA System', 'Projector']);
      newAssumptions.push({ field: 'needs', source: '"mic chahiye"', value: 'PA System' });
    }

    if (lower.includes('vague') || lower.includes('big room')) {
      setFollowUp('How many hours will the session run?');
    } else {
      setFollowUp(null);
    }

    setAssumptions(newAssumptions);
    setActiveTab('form');
  };

  const toggleMic = () => {
    if (isListening) {
      setIsListening(false);
    } else {
      setIsListening(true);
      // Immediately populate with sample recognition
      handleParseNl('seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye');
      setIsListening(false);
    }
  };

  const isCapped = requesterRole === 'Club Representative';
  const effectiveCategory: PriorityCategory = isCapped ? 'club_event' : 'institute_event';

  // Check if requested room is available from real API response
  const requestedRoomAvailability = availableRooms?.find((r) => r.room_id === requestedRoom);
  const isRequestedRoomAvailable = requestedRoomAvailability?.free ?? false;
  const requestedBusyReason = requestedRoomAvailability?.busy_with.map((b) => b.label).join(', ');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Preview Banner */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <div>
          <div className="font-bold text-amber-300">Preview — not connected yet</div>
          <div className="text-[11px] text-amber-200/80 mt-0.5">
            The natural language booking parser and booking submission workflow will be connected to backend APIs in Phase 4. Room availability checking below is fully live via <code>GET /api/rooms/available</code>.
          </div>
        </div>
      </div>

      {/* AI-off fallback toggle mode banner (§5.5) */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0B1220] border border-white/10 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Bot className={`w-4 h-4 ${isAiOff ? 'text-zinc-500' : 'text-[#66E3F0]'}`} />
          <span>
            {isAiOff
              ? 'AI Engine is OFF (Rule-based manual form enabled).'
              : 'AI Natural Language Intent Parser & Constraint Preview (Visual Preview).'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsAiOff(!isAiOff)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#cbd5e1] hover:text-white"
        >
          {isAiOff ? 'Enable AI Parser' : 'Toggle AI Off'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center p-1 rounded-2xl bg-[#0B1220] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('describe')}
              disabled={isAiOff}
              className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'describe'
                  ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12] shadow-md'
                  : 'text-[#98A6BB] hover:text-white disabled:opacity-40'
              }`}
            >
              Describe It (NL)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                activeTab === 'form'
                  ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12] shadow-md'
                  : 'text-[#98A6BB] hover:text-white'
              }`}
            >
              Fill The Form
            </button>
          </div>

          {activeTab === 'describe' && !isAiOff && (
            <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#66E3F0] font-bold">NATURAL LANGUAGE QUERY</span>
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`p-2 rounded-full border transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse border-rose-400'
                      : 'bg-white/5 text-[#fbbf24] border-white/10 hover:bg-white/10'
                  }`}
                  title="Toggle speech recognition"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              <textarea
                rows={3}
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                placeholder='e.g. "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"'
                className="w-full bg-[#101A2B] border border-white/10 focus:border-[#66E3F0] rounded-2xl p-3.5 text-xs font-mono text-white outline-none resize-none"
              />

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-mono text-[#98A6BB]">Try sample:</span>
                  {sampleQueries.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleParseNl(s.text)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-[#66E3F0]/20 text-[#66E3F0] border border-white/10 transition-colors"
                    >
                      [{s.label}]
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleParseNl(nlQuery || sampleQueries[0].text)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse ▸</span>
                </button>
              </div>
            </div>
          )}

          {followUp && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300">
                <HelpCircle className="w-4 h-4" />
                <span>Follow-up needed: {followUp}</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setDurationHours(h);
                      setFollowUp(null);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-mono border border-amber-500/30"
                  >
                    {h} Hour{h > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {assumptions.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center p-3 rounded-2xl bg-[#0B1220] border border-white/5">
              <span className="text-[10px] font-mono text-[#98A6BB]">Assumptions:</span>
              {assumptions.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30"
                >
                  <Info className="w-2.5 h-2.5" />
                  {a.source}
                </span>
              ))}
            </div>
          )}

          <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-mono text-white font-bold uppercase">Manual Request Form</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                draftValidation.success
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}>
                {draftValidation.success ? '✓ BookingDraftSchema Valid' : 'Draft Incomplete'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">EVENT TITLE</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">ESTIMATED ATTENDANCE</label>
                <input
                  type="number"
                  value={attendance}
                  onChange={(e) => setAttendance(Number(e.target.value))}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">DAY</label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value as DayCode)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="MON">Monday</option>
                  <option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option>
                  <option value="THU">Thursday</option>
                  <option value="FRI">Friday</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">STARTING PERIOD</label>
                <select
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value as PeriodId)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="P10">P10 (18:00–19:00 Evening)</option>
                  <option value="P11">P11 (19:00–20:00)</option>
                  <option value="P6">P6 (14:00–15:00)</option>
                  <option value="P2">P2 (09:00–10:00)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">DURATION</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value={1}>1 Period (1 Hour)</option>
                  <option value={2}>2 Periods (2 Hours)</option>
                  <option value={3}>3 Periods (3 Hours)</option>
                  <option value={4}>4 Periods (4 Hours)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">VENUE TYPE</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="Seminar Hall">Seminar Hall</option>
                  <option value="Auditorium">Auditorium</option>
                  <option value="Open Air Theatre">Open Air Theatre</option>
                  <option value="Classroom">Classroom</option>
                  <option value="Lab">Lab</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">PREFERRED VENUE</label>
                <select
                  value={requestedRoom}
                  onChange={(e) => setRequestedRoom(e.target.value)}
                  className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  {referenceData.rooms.length > 0 ? (
                    referenceData.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} ({r.name} · {r.capacity} Seats)
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="SH-1">SH-1 (Seminar Hall 1 · 150 Seats)</option>
                      <option value="SH-2">SH-2 (Seminar Hall 2 · 120 Seats)</option>
                      <option value="AUD">AUD (Main Auditorium · 650 Seats)</option>
                      <option value="OAT">OAT (Open Air Theatre · 1200 Seats)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#98A6BB] mb-1">REQUESTER ROLE</label>
              <select
                value={requesterRole}
                onChange={(e) => setRequesterRole(e.target.value as 'Club Representative' | 'Faculty' | 'Admin')}
                className="w-full bg-[#101A2B] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value="Club Representative">Club Representative (Capped to club_event)</option>
                <option value="Faculty">Faculty Member</option>
                <option value="Admin">Dean / Administrator</option>
              </select>
            </div>

            <button
              type="button"
              disabled
              className="w-full py-3 rounded-2xl text-xs font-mono font-bold bg-[#66E3F0]/40 text-[#070A12] cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
              title="Booking submission will be enabled in Phase 4"
            >
              <Ticket className="w-4 h-4" />
              <span>Preview Only — Submission Endpoint Pending (Phase 4)</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              LIVE VENUE AUDIT (GET /api/rooms/available)
            </span>
            <span className={`w-2 h-2 rounded-full ${isLoadingRooms ? 'bg-amber-400 animate-ping' : 'bg-[#10b981]'}`} />
          </div>

          <div
            className={`p-4 rounded-2xl border space-y-2 ${
              isRequestedRoomAvailable
                ? 'bg-[#101A2B] border-emerald-500/30'
                : 'bg-[#101A2B] border-amber-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#98A6BB]">REQUESTED VENUE STATUS:</span>
              <span
                className={`text-xs font-mono font-bold ${
                  isRequestedRoomAvailable ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isLoadingRooms ? 'CHECKING...' : isRequestedRoomAvailable ? '✓ AVAILABLE' : '⚠ BUSY / RESTRICTED'}
              </span>
            </div>
            <div className="text-sm font-bold text-white font-mono">
              {roomName(requestedRoom)} · {day} {periodStart} ({durationHours} hr{durationHours > 1 ? 's' : ''})
            </div>
            <div className="text-xs text-[#cbd5e1]">
              {isLoadingRooms
                ? 'Querying room availability from backend...'
                : isRequestedRoomAvailable
                ? `Venue is clash-free for ${day} P${fromPeriodNum}–P${toPeriodNum}.`
                : requestedBusyReason
                ? `Reserved: ${requestedBusyReason}`
                : `Venue has scheduled commitments during ${day} P${fromPeriodNum}–P${toPeriodNum}.`}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-[11px] font-mono text-[#98A6BB] uppercase">
                AVAILABLE ALTERNATIVES ({availableRooms?.filter((r) => r.free).length ?? 0})
              </span>
              <span className="text-[10px] font-mono text-[#98A6BB]">P{fromPeriodNum}–P{toPeriodNum}</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {availableRooms?.slice(0, 6).map((c) => {
                const meta = referenceData.rooms.find((r) => r.id === c.room_id);
                const busyLabel = c.busy_with.map((b) => b.label).join(', ');
                return (
                  <div
                    key={c.room_id}
                    className="p-3 rounded-xl bg-[#070A12] border border-white/5 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white">{c.room_id}</span>
                        <span className="text-[11px] text-[#cbd5e1]">{meta?.name ?? c.room_id}</span>
                        {meta && <span className="text-[10px] text-[#98A6BB]">({meta.capacity} seats)</span>}
                      </div>
                      <div className="text-[10px] text-[#98A6BB] mt-0.5">
                        {c.free ? 'Clash-free in this window' : (busyLabel || 'Occupied')}
                      </div>
                    </div>

                    {c.free ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#070A12] border border-white/5 space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#98A6BB]">Effective Priority:</span>
              <CategoryChip category={effectiveCategory} isCapped={isCapped} originalClaim="institute_event" />
            </div>
            {isCapped && (
              <p className="text-[10px] text-amber-300/80 leading-normal">
                Policy notice: Club accounts are automatically capped to <code>club_event</code> category. High-priority overrides require Dean or Coordinator sign-off.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <AppShell
      pageTitle="New Venue Booking"
      breadcrumbs={[{ label: 'Bookings', href: '/bookings' }, { label: 'New Request' }]}
    >
      <Suspense fallback={<div className="p-8 text-center text-xs font-mono text-[#98A6BB]">Loading booking form...</div>}>
        <BookingContent />
      </Suspense>
    </AppShell>
  );
}
