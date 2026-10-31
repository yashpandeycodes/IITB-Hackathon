'use client';

import React, { useState, use, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { AgendaList } from '@/components/timetable/agenda-list';
import { SessionDrawer } from '@/components/timetable/session-drawer';
import { useTimetable, useCurrentUser } from '@/lib/api-queries';
import {
  STUDENT_GROUPS,
  CAMPUS_ROOMS,
  FACULTY_MEMBERS,
  getCourseTitle,
  getFacultyName,
  getRoomName,
  getGroupName,
} from '@/lib/dataset/reference-lookup';
import {
  SessionItem,
  TimetableAssignment,
  BookingItem,
  TimetableWeek,
  PeriodId,
  BookingStatus,
  UiSessionKind,
  DayCode,
} from '@/lib/contracts';
import { PERIOD_MAP } from '@/lib/format';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Printer,
  Calendar,
  Grid3X3,
  List,
  Sparkles,
  Zap,
  RefreshCw,
  Users,
  GraduationCap,
  Building,
  ArrowRight,
} from 'lucide-react';

interface PageProps {
  params: Promise<{
    view: string;
    id: string;
  }>;
  searchParams: Promise<{
    week?: string;
  }>;
}

type ViewType = 'group' | 'faculty' | 'room';

export default function TimetableExplorerPage({ params, searchParams }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const resolvedSearch = use(searchParams);

  const rawView = resolvedParams.view || 'group';
  const view: ViewType = rawView === 'faculty' || rawView === 'room' ? rawView : 'group';
  const id = decodeURIComponent(resolvedParams.id || 'Y1-A');
  const weekParam = resolvedSearch.week === 'spectra' ? 'spectra' : 'regular';
  const [week, setWeek] = useState<TimetableWeek>(weekParam);
  const [mobileLayout, setMobileLayout] = useState<'agenda' | 'grid'>('agenda');

  // Selected session for drawer
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<TimetableAssignment | null>(null);

  // Authenticated user session
  const { user } = useCurrentUser();

  // Fetch real timetable data from the backend API
  const {
    data: timetableData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useTimetable({
    view,
    id,
    week,
  });

  // Keep week state in sync with URL search params
  useEffect(() => {
    if (resolvedSearch.week === 'spectra' && week !== 'spectra') {
      setWeek('spectra');
    } else if (!resolvedSearch.week && week !== 'regular') {
      setWeek('regular');
    }
  }, [resolvedSearch.week, week]);

  // Handle Faculty-specific auto navigation
  // When a Faculty user visits and is not already on their own timetable, allow quick 1-click jump
  const isFacultyUser = user?.role === 'faculty';
  const facultyId = user?.faculty_id;
  const isViewingOwnSchedule = isFacultyUser && view === 'faculty' && id === facultyId;

  // Convert API cells and bookings to UI contracts
  const { uiSessions, uiAssignments, uiBookings } = useMemo(() => {
    if (!timetableData?.cells) {
      return { uiSessions: [], uiAssignments: [], uiBookings: [] };
    }

    const sessionsMap = new Map<string, SessionItem>();
    const assignments: TimetableAssignment[] = [];

    for (const cell of timetableData.cells) {
      const periodId = `P${cell.start_period}` as PeriodId;
      const courseTitle = getCourseTitle(cell.course_id);
      const facultyName = getFacultyName(cell.faculty_id);
      const roomName = getRoomName(cell.room_id);

      // Construct SessionItem
      const sessionItem: SessionItem = {
        id: cell.session_id,
        courseCode: cell.course_id,
        courseName: courseTitle,
        kind: cell.basket_slot ? 'basket' : (cell.kind as UiSessionKind),
        groups: cell.groups,
        facultyId: cell.faculty_id,
        facultyName,
        durationPeriods: cell.duration,
        studentCount: cell.size,
        isElectiveBasket: Boolean(cell.basket_slot),
        basketName: cell.basket_slot ?? undefined,
      };
      sessionsMap.set(cell.session_id, sessionItem);

      // Construct TimetableAssignment
      assignments.push({
        sessionId: cell.session_id,
        day: cell.day as DayCode,
        period: periodId,
        roomId: cell.room_id,
        roomName,
        isOverride: Boolean(cell.override),
        overrideReason: cell.override
          ? `Displaced by festival booking ${cell.override.displaced_by}`
          : undefined,
      });
    }

    const bookings: BookingItem[] = (timetableData.bookings || []).map((b) => ({
      id: b.request_id,
      title: b.title,
      requesterId: b.request_id,
      requesterName: b.title,
      requesterRole: 'Club Representative',
      requestedCategory: b.effective_category,
      effectiveCategory: b.effective_category,
      day: b.day as DayCode,
      periodStart: `P${b.start_period}` as PeriodId,
      periodEnd: `P${b.end_period}` as PeriodId,
      durationHours: b.end_period - b.start_period + 1,
      assignedRoomId: b.room_id,
      assignedRoomName: getRoomName(b.room_id),
      expectedAttendance: 0,
      requiredFeatures: [],
      status: b.status as BookingStatus,
      decisionReason: `Scheduled for Spectra Week 7 (${b.status})`,
    }));

    return {
      uiSessions: Array.from(sessionsMap.values()),
      uiAssignments: assignments,
      uiBookings: bookings,
    };
  }, [timetableData]);

  const handleCellClick = (session: SessionItem, assignment: TimetableAssignment) => {
    setSelectedSession(session);
    setSelectedAssignment(assignment);
  };

  const handleNavigate = (newView: ViewType, newId: string, newWeek: TimetableWeek = week) => {
    router.push(`/timetable/${newView}/${encodeURIComponent(newId)}?week=${newWeek}`);
  };

  const handleWeekChange = (newWeek: TimetableWeek) => {
    setWeek(newWeek);
    router.push(`/timetable/${view}/${encodeURIComponent(id)}?week=${newWeek}`);
  };

  // Human-readable title for header and breadcrumb
  const entityDisplayName = useMemo(() => {
    switch (view) {
      case 'group':
        return getGroupName(id);
      case 'faculty':
        return getFacultyName(id);
      case 'room':
        return getRoomName(id);
      default:
        return id;
    }
  }, [view, id]);

  const handleExportIcs = () => {
    const calendarLines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CIT Nexus//Timetable Generator//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:CIT Nexus ${entityDisplayName} (${view.toUpperCase()}) Timetable`,
    ];

    for (const a of uiAssignments) {
      const s = uiSessions.find((sess) => sess.id === a.sessionId);
      if (!s) continue;
      const timing = PERIOD_MAP[a.period]?.timing || '08:00–09:00';
      const [startHour, endHour] = timing.split('–');
      const startClean = (startHour || '08:00').replace(':', '') + '00';
      const endClean = (endHour || '09:00').replace(':', '') + '00';

      calendarLines.push(
        'BEGIN:VEVENT',
        `UID:${a.sessionId}-${a.day}-${a.period}@citnexus.edu`,
        `SUMMARY:${s.courseCode} ${s.courseName}`,
        `LOCATION:${a.roomName}`,
        `DESCRIPTION:Faculty: ${s.facultyName} | Cohort: ${s.groups.join(', ')} | Type: ${s.kind}`,
        `DTSTART:20261102T${startClean}Z`,
        `DTEND:20261102T${endClean}Z`,
        'END:VEVENT',
      );
    }

    calendarLines.push('END:VCALENDAR');
    const icsContent = calendarLines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `CIT_Nexus_${view}_${id}_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell
      pageTitle={`Timetable Explorer — ${entityDisplayName}`}
      breadcrumbs={[
        { label: 'Timetables', href: '/timetable/group/Y1-A' },
        { label: `${view.toUpperCase()}: ${id}` },
      ]}
    >
      <div className="space-y-6">
        {/* Faculty quick navigation notice if user is faculty but viewing something else */}
        {isFacultyUser && facultyId && !isViewingOwnSchedule && (
          <div className="p-3.5 rounded-2xl bg-[#132035] border border-[#66E3F0]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#66E3F0] shrink-0" />
              <span>
                Signed in as Faculty: <strong>{user.name}</strong> ({facultyId})
              </span>
            </div>
            <button
              onClick={() => handleNavigate('faculty', facultyId)}
              className="px-3 py-1.5 rounded-xl bg-[#66E3F0]/20 hover:bg-[#66E3F0]/30 text-[#66E3F0] border border-[#66E3F0]/40 font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <span>Switch to My Timetable</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top Controls Toolbar (§5.3) */}
        <div className="flex flex-col gap-4 p-4 rounded-2xl bg-[#0B1220] border border-white/10 shadow-sm">
          {/* Row 1: View Modes & Entity Selector */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* View Mode Segmented Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#101A2B] border border-white/10 self-start sm:self-auto">
              <button
                onClick={() => handleNavigate('group', 'Y1-A')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  view === 'group'
                    ? 'bg-[#66E3F0] text-[#070A12] shadow-[0_0_12px_rgba(102,227,240,0.3)]'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Student Groups</span>
              </button>

              <button
                onClick={() => handleNavigate('faculty', facultyId || 'F01')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  view === 'faculty'
                    ? 'bg-[#8279FF] text-white shadow-[0_0_12px_rgba(130,121,255,0.3)]'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Faculty</span>
              </button>

              <button
                onClick={() => handleNavigate('room', 'LH-1')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  view === 'room'
                    ? 'bg-[#fbbf24] text-[#070A12] shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Rooms</span>
              </button>
            </div>

            {/* Entity Select Dropdown (covers all 14 groups, 40 faculty, 27 rooms) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#98A6BB] uppercase whitespace-nowrap">
                Select {view === 'group' ? 'Cohort' : view === 'faculty' ? 'Faculty' : 'Venue'}:
              </span>
              <select
                value={id}
                onChange={(e) => handleNavigate(view, e.target.value)}
                className="bg-[#101A2B] border border-white/20 text-white rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-[#66E3F0] transition-colors max-w-[260px] truncate"
              >
                {view === 'group' &&
                  STUDENT_GROUPS.map((g) => (
                    <option key={g.id} value={g.id} className="bg-[#0B1220] text-white">
                      {g.id} — {g.name}
                    </option>
                  ))}
                {view === 'faculty' &&
                  FACULTY_MEMBERS.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#0B1220] text-white">
                      {f.id} — {f.name} ({f.department})
                    </option>
                  ))}
                {view === 'room' &&
                  CAMPUS_ROOMS.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#0B1220] text-white">
                      {r.id} — {r.name} ({r.capacity} seats)
                    </option>
                  ))}
              </select>
            </div>

            {/* Week Mode Toggle & Utility Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {/* Week Mode Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-[#101A2B] border border-white/10 text-xs font-mono">
                <button
                  onClick={() => handleWeekChange('regular')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    week === 'regular'
                      ? 'bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/40'
                      : 'text-[#98A6BB] hover:text-white'
                  }`}
                >
                  Regular
                </button>
                <button
                  onClick={() => handleWeekChange('spectra')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                    week === 'spectra'
                      ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-[0_0_10px_rgba(236,72,153,0.2)]'
                      : 'text-[#98A6BB] hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-pink-400" />
                  Spectra Wk 7
                </button>
                <button
                  onClick={() => router.push('/exams')}
                  className="px-3 py-1.5 rounded-lg text-[#98A6BB] hover:text-white transition-colors"
                >
                  Exam Wk
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#101A2B] hover:bg-[#132035] border border-white/10 text-xs font-mono text-[#cbd5e1] hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Refresh Schedule"
              >
                <RefreshCw className={`w-4 h-4 text-[#66E3F0] ${isFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {/* ICS Export & Print */}
              <button
                onClick={handleExportIcs}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#101A2B] hover:bg-[#132035] border border-white/10 text-xs font-mono text-[#cbd5e1] hover:text-white flex items-center gap-1.5 transition-colors"
                title="Download iCalendar format"
              >
                <Download className="w-4 h-4 text-[#66E3F0]" />
                <span className="hidden sm:inline">ICS</span>
              </button>

              <button
                onClick={() => window.print()}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#101A2B] hover:bg-[#132035] border border-white/10 text-xs font-mono text-[#cbd5e1] hover:text-white flex items-center gap-1.5 transition-colors"
                title="Print Schedule"
              >
                <Printer className="w-4 h-4 text-[#8279FF]" />
                <span className="hidden sm:inline">Print</span>
              </button>

              {/* Mobile View Toggle */}
              <div className="md:hidden flex items-center p-1 rounded-xl bg-[#101A2B] border border-white/10">
                <button
                  onClick={() => setMobileLayout('agenda')}
                  className={`p-1.5 rounded-lg ${
                    mobileLayout === 'agenda' ? 'bg-white/10 text-[#66E3F0]' : 'text-white/40'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMobileLayout('grid')}
                  className={`p-1.5 rounded-lg ${
                    mobileLayout === 'grid' ? 'bg-white/10 text-[#66E3F0]' : 'text-white/40'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Quick Pick Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
            <span className="text-[11px] font-mono text-[#98A6BB]">Quick Switch:</span>
            {view === 'group' &&
              ['Y1-A', 'Y1-B', 'CSE-2', 'ECE-2', 'EE-2', 'ME-2', 'CE-2', 'CSE-3'].map((groupId) => (
                <button
                  key={groupId}
                  onClick={() => handleNavigate('group', groupId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    id === groupId
                      ? 'bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/40'
                      : 'bg-[#101A2B] text-[#98A6BB] hover:text-white hover:bg-[#132035]'
                  }`}
                >
                  {groupId}
                </button>
              ))}

            {view === 'faculty' &&
              ['F01', 'F02', 'F03', 'F06', 'F09', 'F12', 'F14', 'F19', 'F21'].map((facId) => (
                <button
                  key={facId}
                  onClick={() => handleNavigate('faculty', facId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    id === facId
                      ? 'bg-[#8279FF]/20 text-[#8279FF] border border-[#8279FF]/40'
                      : 'bg-[#101A2B] text-[#98A6BB] hover:text-white hover:bg-[#132035]'
                  }`}
                >
                  {facId} {facultyId === facId ? '★' : ''}
                </button>
              ))}

            {view === 'room' &&
              ['AUD', 'LH-1', 'LH-2', 'LH-3', 'CR-101', 'CS-LAB-1', 'ELEC-LAB-1', 'SH-1'].map((rId) => (
                <button
                  key={rId}
                  onClick={() => handleNavigate('room', rId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    id === rId
                      ? 'bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/40'
                      : 'bg-[#101A2B] text-[#98A6BB] hover:text-white hover:bg-[#132035]'
                  }`}
                >
                  {rId}
                </button>
              ))}
          </div>
        </div>

        {/* Notice Banner for Spectra Week */}
        {week === 'spectra' && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-pink-950/40 border border-pink-500/30 flex items-center justify-between text-xs font-mono text-pink-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
              <span>
                <strong>Spectra Week 7 Coordination Active:</strong> Academic classes pre-empted or moved for the fest are marked with ⚡ dashed violet outlines. Evening festival event bookings are displayed in hatched pink.
              </span>
            </div>
            <Link href="/spectra" className="font-bold underline text-pink-300 hover:text-white shrink-0 ml-2">
              View Spectra Board ▸
            </Link>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#0B1220] border border-white/10">
              <Skeleton className="h-6 w-64 bg-white/10" />
              <Skeleton className="h-6 w-32 bg-white/10" />
            </div>
            <div className="p-6 rounded-2xl bg-[#070A12] border border-white/10 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="h-16 w-24 bg-white/10 shrink-0" />
                  <Skeleton className="h-16 flex-1 bg-white/10" />
                  <Skeleton className="h-16 flex-1 bg-white/10" />
                  <Skeleton className="h-16 flex-1 bg-white/10" />
                  <Skeleton className="h-16 flex-1 bg-white/10" />
                  <Skeleton className="h-16 flex-1 bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <ErrorState
            title="Failed to load timetable"
            message={
              error instanceof Error
                ? error.message
                : `We could not load the timetable for ${view} '${id}'. Please verify the entity ID or try again.`
            }
            onRetry={() => refetch()}
            retryLabel="Retry Connection"
          />
        )}

        {/* Empty State when no timetable version exists in backend yet */}
        {!isLoading && !isError && timetableData?.version_id === null && (
          <EmptyState
            icon={Calendar}
            title="No Timetable Generated Yet"
            description="There is no active timetable version published for the campus dataset yet. Generate or activate a schedule from the Admin command center to populate timetable slots."
            cta={{ label: 'Go to Admin Center', href: '/admin', icon: Zap }}
          >
            <button
              onClick={() => refetch()}
              className="text-xs font-mono text-[#66E3F0] hover:underline mt-2"
            >
              Check again for new version
            </button>
          </EmptyState>
        )}

        {/* Timetable Grid View */}
        {!isLoading && !isError && timetableData?.version_id !== null && (
          <>
            {/* Desktop View */}
            <div className="hidden md:block">
              <TimetableGrid
                assignments={uiAssignments}
                sessions={uiSessions}
                bookings={uiBookings}
                week={week}
                onCellClick={handleCellClick}
              />
            </div>

            {/* Mobile View (Agenda List vs Grid) */}
            <div className="md:hidden">
              {mobileLayout === 'agenda' ? (
                <AgendaList
                  assignments={uiAssignments}
                  sessions={uiSessions}
                  bookings={uiBookings}
                  week={week}
                  onCellClick={handleCellClick}
                />
              ) : (
                <TimetableGrid
                  assignments={uiAssignments}
                  sessions={uiSessions}
                  bookings={uiBookings}
                  week={week}
                  onCellClick={handleCellClick}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Slide-in Session Inspection Drawer */}
      <SessionDrawer
        session={selectedSession}
        assignment={selectedAssignment}
        onClose={() => {
          setSelectedSession(null);
          setSelectedAssignment(null);
        }}
        userRole={user?.role}
      />
    </AppShell>
  );
}
