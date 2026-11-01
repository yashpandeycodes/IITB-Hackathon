'use client';

import React, { useState, use, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { useReferenceData } from '@/hooks/use-reference-data';
import {
  MOCK_CHANGE_REQUESTS,
  PREVIEW_REGULAR_ASSIGNMENTS,
} from '../../changes/preview-data';
import { TimetableAssignment, SessionItem } from '@/lib/contracts';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ApprovalDetailPage({ params }: PageProps) {
  const { referenceData, courseName, facultyName } = useReferenceData();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const changeRequest = MOCK_CHANGE_REQUESTS.find((c) => c.id === id) || MOCK_CHANGE_REQUESTS[0];

  const [viewState, setViewState] = useState<'before' | 'after' | 'overlay'>('overlay');
  const [selectedCohort, setSelectedCohort] = useState<string>('Y1-A');
  const [comment, setComment] = useState('');

  const activeSessions: SessionItem[] = useMemo(() => {
    return referenceData.sessions.map((s) => ({
      id: s.id,
      courseCode: s.course_id,
      courseName: courseName(s.course_id),
      kind: s.kind === 'lab' ? 'lab' : s.kind === 'tutorial' ? 'tutorial' : 'lecture',
      groups: s.groups,
      facultyId: s.faculty_id,
      facultyName: facultyName(s.faculty_id),
      durationPeriods: s.duration,
      studentCount: s.size,
    }));
  }, [referenceData.sessions, courseName, facultyName]);

  // Generate "Before", "After", and "Overlay" assignments
  const beforeAssignments = PREVIEW_REGULAR_ASSIGNMENTS;

  // After assignments: replace moved sessions with their toDay/toPeriod/toRoom
  const afterAssignments: TimetableAssignment[] = PREVIEW_REGULAR_ASSIGNMENTS.map((assign) => {
    const move = changeRequest.moves.find(
      (m) => m.fromDay === assign.day && m.fromPeriod === assign.period && m.fromRoomId === assign.roomId
    );
    if (move) {
      return {
        ...assign,
        day: move.toDay,
        period: move.toPeriod,
        roomId: move.toRoomId,
        roomName: move.toRoomName,
      };
    }
    return assign;
  });

  // Ghost assignments (old slots during overlay)
  const ghostAssignments: TimetableAssignment[] = changeRequest.moves.map((m) => ({
    sessionId: m.sessionId,
    day: m.fromDay,
    period: m.fromPeriod,
    roomId: m.fromRoomId,
    roomName: m.fromRoomName,
    isGhost: true,
  }));

  // New assignments (new proposed slots during overlay)
  const newAssignments: TimetableAssignment[] = changeRequest.moves.map((m) => ({
    sessionId: m.sessionId,
    day: m.toDay,
    period: m.toPeriod,
    roomId: m.toRoomId,
    roomName: m.toRoomName,
    isNew: true,
  }));

  return (
    <AppShell
      pageTitle={`Review Proposal — ${changeRequest.id}`}
      breadcrumbs={[
        { label: 'Approvals', href: '/approvals' },
        { label: changeRequest.id },
      ]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Preview Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Preview — not connected yet</div>
            <div className="text-[11px] text-amber-200/80 mt-0.5">
              Change proposal reviews and rescheduling approvals will be integrated via Phase 5 governance endpoints. The timetable diff below illustrates proposed session movements.
            </div>
          </div>
        </div>

        {/* Back Link & Title Header (§5.8) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div className="space-y-1">
            <Link
              href="/approvals"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-[#98A6BB] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Approvals Inbox</span>
            </Link>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-mono font-black text-xl text-[#66E3F0]">{changeRequest.id}</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-white">
                {changeRequest.type.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">{changeRequest.title}</h1>
            <p className="text-xs text-[#98A6BB]">{changeRequest.reason}</p>
          </div>

          {/* Quick Metrics Capsule */}
          <div className="flex sm:flex-col items-end gap-2 text-xs font-mono">
            <div className="px-3 py-1 rounded-full bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/30 font-bold">
              0 Hard Violations
            </div>
            <div className="text-[#fbbf24]">Soft Penalty Delta: +{changeRequest.softPenaltyDelta}</div>
            <div className="text-[#98A6BB]">{changeRequest.moves.length} Sessions Relocated</div>
          </div>
        </div>

        {/* Diff Mode Toggle & Cohort Filter (§5.8) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B1220] border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#98A6BB]">VIEW DIFF MODE:</span>
            <div className="flex p-1 rounded-xl bg-[#101A2B] border border-white/10 text-xs font-mono">
              <button
                type="button"
                onClick={() => setViewState('before')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewState === 'before' ? 'bg-white/20 text-white font-bold' : 'text-[#98A6BB]'
                }`}
              >
                1. Before
              </button>
              <button
                type="button"
                onClick={() => setViewState('after')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewState === 'after' ? 'bg-[#10b981] text-black font-bold' : 'text-[#98A6BB]'
                }`}
              >
                2. After
              </button>
              <button
                type="button"
                onClick={() => setViewState('overlay')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewState === 'overlay' ? 'bg-[#8279FF] text-white font-bold' : 'text-[#98A6BB]'
                }`}
              >
                3. Overlay Diff (Ghost Slots)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#98A6BB]">FILTER COHORT:</span>
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
            >
              <option value="Y1-A">Y1-A (First Year Batch A)</option>
              <option value="CSE-2">CSE-2 (Year 2 Computer Science)</option>
              <option value="Y1-B">Y1-B (First Year Batch B)</option>
            </select>
          </div>
        </div>

        {/* Timetable Diff Visualization */}
        <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-white">SCHEDULE IMPACT PREVIEW</span>
              {viewState === 'overlay' && (
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-rose-300">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500/30 border border-rose-500/60 inline-block" />
                    Vacated Slots (Ghost)
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-500/60 inline-block" />
                    New Proposed Slots
                  </span>
                </div>
              )}
            </div>
            <span className="text-[#98A6BB]">Cohort: {selectedCohort}</span>
          </div>

          <div className="overflow-x-auto">
            <TimetableGrid
              assignments={viewState === 'after' ? afterAssignments : beforeAssignments}
              sessions={activeSessions}
              mode={viewState === 'overlay' ? 'diff' : 'view'}
              ghostAssignments={viewState === 'overlay' ? ghostAssignments : undefined}
              newAssignments={viewState === 'overlay' ? newAssignments : undefined}
            />
          </div>
        </div>

        {/* Relocated Sessions Table (§5.8) */}
        <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            RELOCATED SESSIONS BREAKDOWN ({changeRequest.moves.length})
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 bg-[#101A2B] text-[#98A6BB] text-[10px] uppercase">
                  <th className="p-2.5">Move ID</th>
                  <th className="p-2.5">Course</th>
                  <th className="p-2.5">From Slot & Room</th>
                  <th className="p-2.5">To Slot & Room</th>
                  <th className="p-2.5">Shift Type</th>
                  <th className="p-2.5">Reason / Constraint Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {changeRequest.moves.map((move) => (
                  <tr key={move.id} className="hover:bg-white/[0.02]">
                    <td className="p-2.5 font-bold text-[#66E3F0]">{move.id}</td>
                    <td className="p-2.5">
                      <div className="font-bold text-white">{move.courseCode}</div>
                      <div className="text-[10px] text-[#98A6BB]">{move.courseName}</div>
                    </td>
                    <td className="p-2.5 text-rose-300">
                      <span className="line-through">{move.fromDay} {move.fromPeriod} ({move.fromRoomName})</span>
                    </td>
                    <td className="p-2.5 text-emerald-400 font-bold">
                      {move.toDay} {move.toPeriod} ({move.toRoomName})
                    </td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded bg-white/10 text-white text-[10px] uppercase font-bold">
                        {move.moveType}
                      </span>
                    </td>
                    <td className="p-2.5 text-[#cbd5e1] max-w-xs">{move.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Approval Decision Card (§5.8) */}
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold text-white uppercase">Governance Sign-Off (Preview)</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Actions Pending Phase 5
            </span>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Governance review comments (e.g. 'Approved with alternate room verified by HOD')..."
              className="w-full bg-[#101A2B] border border-white/10 focus:border-[#66E3F0] rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <span className="text-xs font-mono text-[#98A6BB]">
                Decision API endpoint: <code>POST /api/changes/{changeRequest.id}/decide</code> (Phase 5)
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled
                  className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-white/5 text-rose-400/60 border border-white/10 cursor-not-allowed"
                  title="Decision endpoints will be connected in Phase 5"
                >
                  Reject Proposal (Preview)
                </button>

                <button
                  type="button"
                  disabled
                  className="px-6 py-2.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-emerald-500/60 to-teal-600/60 text-black/70 shadow-lg cursor-not-allowed flex items-center gap-2"
                  title="Decision endpoints will be connected in Phase 5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Apply (Preview)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
