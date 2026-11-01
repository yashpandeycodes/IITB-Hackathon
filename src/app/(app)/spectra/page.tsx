'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { useReferenceData } from '@/hooks/use-reference-data';
import { apiGet, apiPost, isApiClientError } from '@/lib/api-client';
import {
  SpectraStateSchema,
  SpectraRunResultSchema,
  TimetableViewSchema,
  type SpectraDecisionView,
  type ReferenceBookingRequest,
  type DayCode,
  type PeriodId,
  type TimetableAssignment,
  type SessionItem,
  type BookingItem,
} from '@/lib/contracts';
import { CategoryChip, StatusBadge } from '@/components/semantic/badges';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { ExplanationPanel } from '@/components/assistant/explanations';
import { formatDay } from '@/lib/format';
import {
  Sparkles,
  Zap,
  RotateCcw,
  Ticket,
  CheckCircle2,
  AlertTriangle,
  X,
  Shuffle,
  XCircle,
  Building,
  RefreshCw,
  SlidersHorizontal,
  HelpCircle,
} from 'lucide-react';

function SpectraStatusBadge({ status }: { status: string }) {
  if (status === 'approved' || status === 'applied') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" />
        Approved
      </span>
    );
  }
  if (status === 'alternative_offered' || status === 'alternative') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
        <Shuffle className="w-3 h-3" />
        Alternative Offered
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
        <XCircle className="w-3 h-3" />
        Rejected
      </span>
    );
  }
  return <StatusBadge status={status} />;
}

export default function SpectraBoardPage() {
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const isAdmin = sessionUser?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'decisions' | 'timeline'>('decisions');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'alternative_offered' | 'rejected'>('all');
  const [selectedDecision, setSelectedDecision] = useState<SpectraDecisionView | null>(null);
  // True when the drawer was opened from a row's "Why?" button: load the explanation at once.
  const [explainOnOpen, setExplainOnOpen] = useState(false);

  // Reference data hook for room names and booking requests
  const { referenceData, roomName, facultyName, courseName } = useReferenceData();

  // Selected room for Week-7 Timetable view
  const [selectedRoomId, setSelectedRoomId] = useState<string>('AUD');

  // Map of booking requests from reference data by id
  const bookingMap = useMemo(() => {
    const map = new Map<string, ReferenceBookingRequest>();
    referenceData.booking_requests?.forEach((b) => map.set(b.id, b));
    return map;
  }, [referenceData.booking_requests]);

  // Query actual persisted Spectra state from backend
  const {
    data: spectraState,
    isLoading: isSpectraLoading,
    isError: isSpectraError,
    error: spectraError,
    refetch: refetchSpectra,
  } = useQuery({
    queryKey: ['spectra'],
    queryFn: () => apiGet('/api/spectra', SpectraStateSchema),
    staleTime: 10_000,
  });

  // Query Week-7 Timetable for the selected venue
  const {
    data: roomTimetable,
    isLoading: isRoomTimetableLoading,
    isError: isRoomTimetableError,
    error: roomTimetableError,
    refetch: refetchRoomTimetable,
  } = useQuery({
    queryKey: ['timetable', 'room', selectedRoomId, 'spectra'],
    queryFn: () =>
      apiGet(
        `/api/timetable?view=room&id=${encodeURIComponent(selectedRoomId)}&week=spectra`,
        TimetableViewSchema
      ),
    enabled: activeTab === 'timeline' && Boolean(selectedRoomId),
    staleTime: 10_000,
  });

  // Re-run Spectra Engine Mutation (Admin only)
  const runSpectraMutation = useMutation({
    mutationFn: () => apiPost('/api/spectra/run', {}, SpectraRunResultSchema),
    onSuccess: (result) => {
      toast.success(
        `Spectra engine re-run complete: ${result.approved} approved, ${result.alternatives} alternative, ${result.rejected} rejected.`
      );
      refetchSpectra();
      queryClient.invalidateQueries({ queryKey: ['spectra'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['validate'] });
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: (err: unknown) => {
      if (isApiClientError(err)) {
        if (err.status === 404) {
          toast.error('No active timetable found. Please generate and activate a timetable in the Admin Console first.');
        } else if (err.status === 409) {
          toast.error('Conflict (409): Another engine run or dataset operation holds the lock.');
        } else if (err.status === 429) {
          toast.error(`Rate limited (429): ${err.message}`);
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Failed to run Spectra engine.');
      }
    },
  });

  // Summary counts and metrics directly from the backend
  const summary = spectraState?.summary;
  const decisions = useMemo(() => spectraState?.decisions ?? [], [spectraState?.decisions]);
  const overrides = useMemo(() => spectraState?.overrides ?? [], [spectraState?.overrides]);

  // Filtered decisions list
  const filteredDecisions = useMemo(() => {
    if (statusFilter === 'all') return decisions;
    return decisions.filter((d) => d.status === statusFilter);
  }, [decisions, statusFilter]);

  // Transform backend Week-7 timetable cells into UI contracts
  const roomAssignments: TimetableAssignment[] = useMemo(() => {
    return (roomTimetable?.cells ?? []).map((cell) => ({
      sessionId: cell.session_id,
      day: cell.day as DayCode,
      period: `P${cell.start_period}` as PeriodId,
      roomId: cell.room_id,
      roomName: roomName(cell.room_id),
      isOverride: Boolean(cell.override),
    }));
  }, [roomTimetable?.cells, roomName]);

  const roomSessions: SessionItem[] = useMemo(() => {
    return (roomTimetable?.cells ?? []).map((cell) => ({
      id: cell.session_id,
      courseCode: cell.course_id,
      courseName: courseName(cell.course_id),
      kind: cell.kind === 'lab' ? 'lab' : cell.kind === 'tutorial' ? 'tutorial' : 'lecture',
      groups: cell.groups,
      facultyId: cell.faculty_id,
      facultyName: facultyName(cell.faculty_id),
      durationPeriods: cell.duration,
      studentCount: cell.size,
    }));
  }, [roomTimetable?.cells, courseName, facultyName]);

  const roomBookings: BookingItem[] = useMemo(() => {
    return (roomTimetable?.bookings ?? []).map((b) => ({
      id: b.request_id,
      title: b.title,
      requesterId: '',
      requesterName: '',
      requesterRole: 'Club Representative',
      requestedCategory: b.effective_category,
      effectiveCategory: b.effective_category,
      day: b.day as DayCode,
      periodStart: `P${b.start_period}` as PeriodId,
      periodEnd: `P${b.end_period}` as PeriodId,
      durationHours: Math.max(1, b.end_period - b.start_period + 1),
      assignedRoomId: b.room_id,
      assignedRoomName: roomName(b.room_id),
      expectedAttendance: 0,
      requiredFeatures: [],
      status: b.status === 'approved' ? 'approved' : b.status === 'rejected' ? 'rejected' : 'alternative',
      decisionReason: '',
    }));
  }, [roomTimetable?.bookings, roomName]);

  // Selected decision matched booking request
  const selectedRequest = selectedDecision ? bookingMap.get(selectedDecision.request_id) : undefined;

  // `POST /api/explain` for a booking follows `GET /api/bookings/:id`: dataset requests are
  // explained to admins only; live requests to their requester and approvers (a 404 otherwise).
  const canExplain = (requestId: string) => isAdmin || !bookingMap.has(requestId);

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
              Persisted multi-venue scheduling across competing cultural, technical & guest requests.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin ? (
              <button
                onClick={() => runSpectraMutation.mutate()}
                disabled={runSpectraMutation.isPending || isSpectraLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/25 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${runSpectraMutation.isPending ? 'animate-spin' : ''}`} />
                <span>{runSpectraMutation.isPending ? 'Running Spectra Engine...' : 'Re-run Decisions'}</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#98A6BB] bg-white/5 border border-white/10">
                View Only
              </span>
            )}
          </div>
        </div>

        {/* 4 Score Metrics Grid (§5.7) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">DECISIONS BREAKDOWN</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white mt-1">
              {summary ? (
                <>
                  <span className="text-emerald-400">{summary.approved}</span> /{' '}
                  <span className="text-amber-400">{summary.alternatives}</span> /{' '}
                  <span className="text-rose-400">{summary.rejected}</span>
                </>
              ) : (
                <span className="text-[#98A6BB] text-base font-normal">No run yet</span>
              )}
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">Appr / Alt / Rej</div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">BOOKING SCORE</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-pink-400 mt-1">
              {summary ? (
                `${summary.booking_score} / ${summary.booking_score_max_if_all_approved}`
              ) : (
                <span className="text-[#98A6BB] text-base font-normal">—</span>
              )}
            </div>
            <div className="text-[10px] font-mono text-pink-300/70 mt-0.5">
              {summary && summary.booking_score_max_if_all_approved > 0
                ? `${((summary.booking_score / summary.booking_score_max_if_all_approved) * 100).toFixed(1)}% Capacity Sat.`
                : 'Weighted Satisfaction'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">PRIORITY INVERSIONS</div>
            <div className="text-xl sm:text-2xl font-black font-mono mt-1">
              {summary ? (
                summary.priority_inversions.length === 0 ? (
                  <span className="text-[#34d399]">0 ✓</span>
                ) : (
                  <span className="text-rose-400">{summary.priority_inversions.length} ⚠</span>
                )
              ) : (
                <span className="text-[#98A6BB] text-base font-normal">—</span>
              )}
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">
              {summary && summary.priority_inversions.length === 0
                ? 'Strict Order Preserved'
                : 'Inversion Count'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1220] border border-white/10 text-center">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">CLASS OVERRIDES</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-violet-400 mt-1">
              {summary ? `${summary.session_overrides} Relocation(s)` : `${overrides.length} Relocation(s)`}
            </div>
            <div className="text-[10px] font-mono text-[#98A6BB] mt-0.5">Displaced for Fest</div>
          </div>
        </div>

        {/* View Toggle: Decisions Table vs Room Timetable Grid */}
        <div className="flex items-center p-1 rounded-2xl bg-[#0B1220] border border-white/10 max-w-sm">
          <button
            onClick={() => setActiveTab('decisions')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'decisions'
                ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                : 'text-[#98A6BB] hover:text-white'
            }`}
          >
            Decisions Table ({decisions.length})
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === 'timeline'
                ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                : 'text-[#98A6BB] hover:text-white'
            }`}
          >
            Week-7 Room Grid
          </button>
        </div>

        {/* Tab 1: Decisions Table (§5.7) */}
        {activeTab === 'decisions' && (
          <div className="space-y-4">
            {/* Status Filter Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
              <span className="text-[#98A6BB] flex items-center gap-1.5 mr-1 text-[11px]">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filter:</span>
              </span>
              {[
                { id: 'all', label: `All (${decisions.length})` },
                { id: 'approved', label: `Approved (${summary?.approved ?? decisions.filter((d) => d.status === 'approved').length})` },
                { id: 'alternative_offered', label: `Alternative (${summary?.alternatives ?? decisions.filter((d) => d.status === 'alternative_offered').length})` },
                { id: 'rejected', label: `Rejected (${summary?.rejected ?? decisions.filter((d) => d.status === 'rejected').length})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as typeof statusFilter)}
                  className={`px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                    statusFilter === f.id
                      ? 'bg-white/15 text-white font-bold border border-white/20'
                      : 'bg-[#0B1220] text-[#98A6BB] hover:text-white border border-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Content Table / Loading / Empty */}
            {isSpectraLoading ? (
              <div className="p-12 text-center rounded-3xl bg-[#0B1220] border border-white/10 text-xs font-mono text-[#98A6BB]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-pink-400" />
                Loading persisted Spectra decisions from backend...
              </div>
            ) : isSpectraError ? (
              <div className="p-6 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-xs font-mono text-rose-300">
                Failed to load Spectra state: {spectraError instanceof Error ? spectraError.message : 'Unknown error'}
              </div>
            ) : decisions.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-[#0B1220] border border-dashed border-white/10 space-y-3">
                <Ticket className="w-8 h-8 text-[#98A6BB] mx-auto opacity-50" />
                <div className="text-sm font-mono font-bold text-white">No Spectra Decisions Persisted</div>
                <p className="text-xs font-mono text-[#98A6BB] max-w-md mx-auto">
                  No decision records currently exist for Week 7. Generate and activate a timetable baseline first, then trigger the Spectra decision engine.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => runSpectraMutation.mutate()}
                    disabled={runSpectraMutation.isPending}
                    className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-pink-500 text-white hover:bg-pink-600 shadow-md inline-flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Run Spectra Decisions</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#101A2B] text-[11px] font-mono text-[#98A6BB] uppercase">
                      <th className="p-3.5">ID / Event Title</th>
                      <th className="p-3.5">Requester</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Requested Slot</th>
                      <th className="p-3.5">Decision & Venue</th>
                      <th className="p-3.5">Reason & Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-mono">
                    {filteredDecisions.map((decision) => {
                      const req = bookingMap.get(decision.request_id);
                      const isCapped = decision.category_capped || Boolean(req?.category_capped);
                      const category = decision.effective_category || req?.effective_category || req?.requested_category || 'club_event';

                      // Format requested windows
                      const requestedWindows = req?.windows && req.windows.length > 0
                        ? req.windows.map((w) => `${w.day} P${w.from_period}–P${w.to_period}`).join(', ')
                        : decision.day
                        ? `${decision.day} P${decision.start_period}–P${decision.end_period}`
                        : '—';

                      return (
                        <tr
                          key={decision.request_id}
                          onClick={() => {
                            setExplainOnOpen(false);
                            setSelectedDecision(decision);
                          }}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                        >
                          <td className="p-3.5 align-top">
                            <div className="font-bold text-white text-sm hover:text-pink-300 transition-colors flex items-center gap-2">
                              <span>{req?.title || decision.request_id}</span>
                              {Boolean(req?.cancelled) && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  Cancelled
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#98A6BB] mt-0.5 flex items-center gap-2">
                              <span>{decision.request_id}</span>
                              {req?.series_id && (
                                <span className="text-purple-300/80">· Series: {req.series_id}</span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 align-top whitespace-nowrap text-[#cbd5e1]">
                            <div>{req?.requester || 'Requester'}</div>
                            <div className="text-[10px] text-[#98A6BB]">{req?.role || 'Club'}</div>
                          </td>

                          <td className="p-3.5 align-top">
                            <CategoryChip
                              category={category}
                              isCapped={isCapped}
                              originalClaim={req?.requested_category}
                            />
                          </td>

                          <td className="p-3.5 align-top">
                            <div className="text-white font-bold">{requestedWindows}</div>
                            {req?.requested_room && (
                              <div className="text-[10px] text-[#98A6BB]">Wanted: {roomName(req.requested_room) || req.requested_room}</div>
                            )}
                          </td>

                          <td className="p-3.5 align-top whitespace-nowrap">
                            <SpectraStatusBadge status={decision.status} />
                            {decision.status !== 'rejected' && decision.room_id ? (
                              <div className="text-[11px] text-[#66E3F0] font-bold mt-1">
                                {roomName(decision.room_id) || decision.room_id} ({decision.day} P{decision.start_period}–P{decision.end_period})
                              </div>
                            ) : (
                              <div className="text-[10px] text-[#98A6BB] mt-1 italic">No venue allocated</div>
                            )}
                          </td>

                          <td className="p-3.5 align-top max-w-xs sm:max-w-sm text-[#cbd5e1] text-[11px] leading-relaxed">
                            {decision.reason_code && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-white/10 text-[#66E3F0] border border-white/10 mr-1.5 mb-1">
                                {decision.reason_code}
                              </span>
                            )}
                            <span>{decision.reason}</span>
                            {canExplain(decision.request_id) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExplainOnOpen(true);
                                  setSelectedDecision(decision);
                                }}
                                className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[#66E3F0]/10 hover:bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/30 transition-colors"
                                aria-label={`Why was ${decision.request_id} decided this way?`}
                              >
                                <HelpCircle className="w-3 h-3" />
                                Why?
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Week-7 Room Timetable Grid (§5.7) */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            {/* Room Selector Header */}
            <div className="p-4 rounded-3xl bg-[#0B1220] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-mono font-bold text-white uppercase">
                  Select Campus Room (Week 7 Spectra View)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-pink-500 transition-colors"
                >
                  {(referenceData.rooms || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} — {r.name} ({r.type}, cap {r.capacity})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => refetchRoomTimetable()}
                  disabled={isRoomTimetableLoading}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#98A6BB] hover:text-white transition-colors"
                  title="Refresh timetable"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRoomTimetableLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Quick Venue Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono pb-1">
              {['AUD', 'SH-1', 'SH-2', 'OAT', 'LH-1', 'CR-101', 'CR-102'].map((venue) => (
                <button
                  key={venue}
                  onClick={() => setSelectedRoomId(venue)}
                  className={`px-3 py-1 rounded-xl transition-all shrink-0 ${
                    selectedRoomId === venue
                      ? 'bg-pink-500/20 text-pink-300 font-bold border border-pink-500/40'
                      : 'bg-[#0B1220] text-[#98A6BB] hover:text-white border border-white/5'
                  }`}
                >
                  {venue}
                </button>
              ))}
            </div>

            {/* Notice Banner for Spectra Grid */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-pink-950/40 border border-pink-500/30 flex items-center justify-between text-xs font-mono text-pink-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                <span>
                  <strong>Week 7 Room Schedule:</strong> Academic sessions displaced for the fest display with ⚡ dashed violet borders. Approved Spectra bookings are hatched in pink.
                </span>
              </div>
            </div>

            {/* Timetable Grid Render */}
            {isRoomTimetableLoading ? (
              <div className="p-12 text-center rounded-3xl bg-[#0B1220] border border-white/10 text-xs font-mono text-[#98A6BB]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-pink-400" />
                Loading Week-7 schedule for room {selectedRoomId}...
              </div>
            ) : isRoomTimetableError ? (
              <div className="p-6 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-xs font-mono text-rose-300">
                Failed to load timetable for {selectedRoomId}:{' '}
                {roomTimetableError instanceof Error ? roomTimetableError.message : 'Unknown error'}
              </div>
            ) : (
              <div className="rounded-3xl bg-[#0B1220] border border-white/10 p-2 overflow-x-auto">
                <TimetableGrid
                  assignments={roomAssignments}
                  sessions={roomSessions}
                  bookings={roomBookings}
                  week="spectra"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Inspection Drawer on Row Click (§5.7) */}
      {selectedDecision && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#0B1220] border-l border-white/10 h-full p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right font-mono">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <span className="text-xs text-pink-400 font-bold uppercase">Spectra Decision Audit</span>
                <button
                  onClick={() => setSelectedDecision(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-bold text-xs text-pink-400">{selectedDecision.request_id}</span>
                  <SpectraStatusBadge status={selectedDecision.status} />
                  <CategoryChip
                    category={selectedDecision.effective_category || selectedRequest?.effective_category || selectedRequest?.requested_category || 'club_event'}
                    isCapped={selectedDecision.category_capped || Boolean(selectedRequest?.category_capped)}
                    originalClaim={selectedRequest?.requested_category}
                  />
                  {selectedDecision.reason_code && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-[#66E3F0] border border-white/10">
                      {selectedDecision.reason_code}
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-bold text-white tracking-tight">
                  {selectedRequest?.title || selectedDecision.request_id}
                </h2>
                <div className="text-xs text-[#98A6BB] mt-1">
                  Requested by: {selectedRequest?.requester || 'Requester'} ({selectedRequest?.role || 'Club'})
                  {selectedRequest?.department ? ` · Dept: ${selectedRequest.department}` : ''}
                </div>
              </div>

              {/* Cancellation Alert */}
              {Boolean(selectedRequest?.cancelled) && (
                <div className="mt-4 p-3 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>This booking request was subsequently cancelled.</span>
                </div>
              )}

              {/* Relocation Admin Notice */}
              {selectedDecision.requires_admin_approval && (
                <div className="mt-3 p-3 rounded-2xl bg-purple-950/30 border border-purple-500/40 text-xs text-purple-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 shrink-0 text-purple-400" />
                  <span>Institute event displaces regular academic classes for Week 7 (Admin approved).</span>
                </div>
              )}

              {/* Prominent Reasoning Block */}
              <div className="mt-5 space-y-3">
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/10 space-y-1.5">
                  <span className="text-[10px] text-[#98A6BB] uppercase block font-bold">
                    DECISION REASONING
                  </span>
                  <p className="text-xs text-white leading-relaxed">
                    {selectedDecision.reason}
                  </p>
                </div>

                {canExplain(selectedDecision.request_id) && (
                  <ExplanationPanel
                    key={selectedDecision.request_id}
                    subject="booking"
                    id={selectedDecision.request_id}
                    label="Why this decision? (engine facts)"
                    autoLoad={explainOnOpen}
                  />
                )}

                {/* Slot Details */}
                <div className="p-4 rounded-2xl bg-[#101A2B] border border-white/10 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Requested Windows:</span>
                    <span className="text-white font-bold text-right">
                      {selectedRequest?.windows && selectedRequest.windows.length > 0
                        ? selectedRequest.windows.map((w) => `${w.day} P${w.from_period}–P${w.to_period}`).join(', ')
                        : 'Any'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Preferred Room:</span>
                    <span className="text-white font-bold">
                      {selectedRequest?.requested_room
                        ? `${roomName(selectedRequest.requested_room) || selectedRequest.requested_room}`
                        : 'No preference'}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-white/5 pt-2">
                    <span className="text-[#98A6BB]">Assigned Venue:</span>
                    <span className="text-[#66E3F0] font-bold">
                      {selectedDecision.room_id
                        ? `${roomName(selectedDecision.room_id) || selectedDecision.room_id}`
                        : 'None'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Assigned Slot:</span>
                    <span className="text-white font-bold">
                      {selectedDecision.day
                        ? `${formatDay(selectedDecision.day as DayCode)} P${selectedDecision.start_period}–P${selectedDecision.end_period}`
                        : 'None'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#98A6BB]">Expected Attendees:</span>
                    <span className="text-white font-bold">
                      {selectedRequest?.attendance ?? 0} Persons
                    </span>
                  </div>

                  {selectedDecision.decided_at && (
                    <div className="flex justify-between border-t border-white/5 pt-2 text-[10px] text-[#98A6BB]">
                      <span>Decided At:</span>
                      <span>{new Date(selectedDecision.decided_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedDecision(null)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold transition-colors mt-4 cursor-pointer"
            >
              Close Audit Drawer
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
