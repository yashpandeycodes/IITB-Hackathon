'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { AgendaList } from '@/components/timetable/agenda-list';
import { SessionDrawer } from '@/components/timetable/session-drawer';
import {
  REGULAR_ASSIGNMENTS,
  SPECTRA_WEEK_ASSIGNMENTS,
  TIMETABLE_SESSIONS,
  SPECTRA_BOOKINGS,
  CAMPUS_ROOMS,
} from '@/lib/dataset/cit-data';
import {
  SessionItem,
  TimetableAssignment,
  BookingItem,
  TimetableWeek,
} from '@/lib/contracts';
import {
  Download,
  Printer,
  Calendar,
  Grid3X3,
  List,
  Sparkles,
  Zap,
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

export default function TimetableExplorerPage({ params, searchParams }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const resolvedSearch = use(searchParams);

  const view = resolvedParams.view || 'group';
  const id = decodeURIComponent(resolvedParams.id || 'Y1-A');
  const [week, setWeek] = useState<TimetableWeek>((resolvedSearch.week as TimetableWeek) || 'regular');
  const [mobileLayout, setMobileLayout] = useState<'agenda' | 'grid'>('agenda');

  // Selected session for drawer
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<TimetableAssignment | null>(null);

  // Pick dataset based on week
  const activeAssignments = week === 'spectra' ? SPECTRA_WEEK_ASSIGNMENTS : REGULAR_ASSIGNMENTS;
  const activeBookings = week === 'spectra' ? SPECTRA_BOOKINGS : [];

  const handleCellClick = (session: SessionItem, assignment: TimetableAssignment) => {
    setSelectedSession(session);
    setSelectedAssignment(assignment);
  };

  const handleExportIcs = () => {
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CIT Nexus//Timetable Generator//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:CIT Nexus ${id} Timetable
BEGIN:VEVENT
SUMMARY:MA101 Calculus Lecture
LOCATION:LH-1
DESCRIPTION:CIT Nexus Academic Schedule
DTSTART:20261102T080000Z
DTEND:20261102T090000Z
END:VEVENT
END:VCALENDAR`;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `CIT_Nexus_${id}_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell
      pageTitle={`Timetable Explorer — ${id}`}
      breadcrumbs={[
        { label: 'Timetables', href: '/timetable/group/Y1-A' },
        { label: `${view.toUpperCase()}: ${id}` },
      ]}
    >
      <div className="space-y-6">
        {/* Top Controls Toolbar (§5.3) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B1220] border border-white/10 shadow-sm">
          {/* Entity & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#98A6BB] uppercase">Target Cohort:</span>
            {['Y1-A', 'Y1-B', 'CSE-2', 'ECE-2'].map((groupId) => (
              <button
                key={groupId}
                onClick={() => router.push(`/timetable/group/${groupId}?week=${week}`)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  id === groupId && view === 'group'
                    ? 'bg-[#66E3F0] text-[#070A12] shadow-[0_0_12px_rgba(102,227,240,0.3)]'
                    : 'bg-[#101A2B] text-[#98A6BB] hover:text-white hover:bg-[#132035]'
                }`}
              >
                {groupId}
              </button>
            ))}

            <span className="text-white/20 mx-1 hidden sm:inline">|</span>

            <span className="text-xs font-mono font-bold text-[#98A6BB] uppercase hidden sm:inline">Venues:</span>
            {['LH-1', 'AUD', 'CS-LAB-1'].map((roomId) => (
              <button
                key={roomId}
                onClick={() => router.push(`/timetable/room/${roomId}?week=${week}`)}
                className={`hidden sm:inline-block px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  id === roomId && view === 'room'
                    ? 'bg-[#fbbf24] text-[#070A12] shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                    : 'bg-[#101A2B] text-[#98A6BB] hover:text-white hover:bg-[#132035]'
                }`}
              >
                {roomId}
              </button>
            ))}
          </div>

          {/* Week Toggle & Utility Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Week Mode Toggle (§5.3) */}
            <div className="flex items-center p-1 rounded-xl bg-[#101A2B] border border-white/10 text-xs font-mono">
              <button
                onClick={() => setWeek('regular')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  week === 'regular'
                    ? 'bg-[#66E3F0]/20 text-[#66E3F0] border border-[#66E3F0]/40'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                Regular
              </button>
              <button
                onClick={() => setWeek('spectra')}
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
                className={`p-1.5 rounded-lg ${mobileLayout === 'agenda' ? 'bg-white/10 text-[#66E3F0]' : 'text-white/40'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMobileLayout('grid')}
                className={`p-1.5 rounded-lg ${mobileLayout === 'grid' ? 'bg-white/10 text-[#66E3F0]' : 'text-white/40'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Notice Banner for Spectra Week */}
        {week === 'spectra' && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-pink-950/40 border border-pink-500/30 flex items-center justify-between text-xs font-mono text-pink-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
              <span>
                <strong>Spectra Week 7 Coordination Active:</strong> Academic classes pre-empted or moved for the fest are marked with ⚡ dashed violet outlines. Evening event bookings are hatched in pink.
              </span>
            </div>
            <Link href="/spectra" className="font-bold underline text-pink-300 hover:text-white shrink-0 ml-2">
              View Spectra Board ▸
            </Link>
          </div>
        )}

        {/* Timetable View */}
        <div className="hidden md:block">
          <TimetableGrid
            assignments={activeAssignments}
            sessions={TIMETABLE_SESSIONS}
            bookings={activeBookings}
            week={week}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Mobile View (Agenda List vs Grid) */}
        <div className="md:hidden">
          {mobileLayout === 'agenda' ? (
            <AgendaList
              assignments={activeAssignments}
              sessions={TIMETABLE_SESSIONS}
              bookings={activeBookings}
              week={week}
              onCellClick={handleCellClick}
            />
          ) : (
            <TimetableGrid
              assignments={activeAssignments}
              sessions={TIMETABLE_SESSIONS}
              bookings={activeBookings}
              week={week}
              onCellClick={handleCellClick}
            />
          )}
        </div>
      </div>

      {/* Slide-in Session Inspection Drawer */}
      <SessionDrawer
        session={selectedSession}
        assignment={selectedAssignment}
        onClose={() => {
          setSelectedSession(null);
          setSelectedAssignment(null);
        }}
      />
    </AppShell>
  );
}

