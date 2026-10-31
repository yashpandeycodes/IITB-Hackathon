'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import {
  MOCK_CHANGE_REQUESTS,
  REGULAR_ASSIGNMENTS,
  TIMETABLE_SESSIONS,
} from '@/lib/dataset/cit-data';
import { TimetableAssignment } from '@/lib/contracts';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Shuffle,
  Clock,
  Building,
  User,
  Users,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ApprovalDetailPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const changeRequest = MOCK_CHANGE_REQUESTS.find((c) => c.id === id) || MOCK_CHANGE_REQUESTS[0];

  const [viewState, setViewState] = useState<'before' | 'after' | 'overlay'>('overlay');
  const [selectedCohort, setSelectedCohort] = useState<string>('Y1-A');
  const [comment, setComment] = useState('');
  const [isDecided, setIsDecided] = useState<boolean>(false);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected' | null>(null);

  // Generate "Before", "After", and "Overlay" assignments
  const beforeAssignments = REGULAR_ASSIGNMENTS;

  // After assignments: replace moved sessions with their toDay/toPeriod/toRoom
  const afterAssignments: TimetableAssignment[] = REGULAR_ASSIGNMENTS.map((assign) => {
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

  const handleApprove = () => {
    setIsDecided(true);
    setDecisionType('approved');
  };

  const handleReject = () => {
    setIsDecided(true);
    setDecisionType('rejected');
  };

  return (
    <AppShell
      pageTitle={`Review Proposal — ${changeRequest.id}`}
      breadcrumbs={[
        { label: 'Approvals', href: '/approvals' },
        { label: changeRequest.id },
      ]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Back Link */}
        <Link
          href="/approvals"
          className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#98A6BB] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Approvals Inbox</span>
        </Link>

        {/* Header Summary Banner (§5.8) */}
        <div className="p-6 rounded-3xl bg-[#0B1220] border border-[#8279FF]/40 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-lg text-[#66E3F0]">{changeRequest.id}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-white font-bold">
                  {changeRequest.type.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">{changeRequest.title}</h1>
              <p className="text-xs text-[#98A6BB] font-mono mt-0.5">
                Requested by: {changeRequest.requestedBy} · {changeRequest.createdAt}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/40">
                0 hard violations ✓
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono text-[#fbbf24] bg-amber-500/15 border border-amber-500/30">
                Soft penalty +{changeRequest.softPenaltyDelta}
              </span>
            </div>
          </div>

          <div className="text-xs text-[#cbd5e1] leading-relaxed">
            {changeRequest.reason}
          </div>

          {/* Affected Cohorts & Faculty Pills (§5.8) */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-mono text-[#98A6BB]">Affected cohorts:</span>
            {changeRequest.affectedGroups.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedCohort(g)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedCohort === g
                    ? 'bg-[#66E3F0] text-[#070A12]'
                    : 'bg-white/10 text-[#cbd5e1] hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
            <span className="text-white/20 mx-1">|</span>
            <span className="text-[11px] font-mono text-[#98A6BB]">Faculty:</span>
            {changeRequest.affectedFaculty.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/20 text-purple-300">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Before / After / Overlay Switcher Bar (§5.8) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B1220] border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#98A6BB] uppercase">TIMETABLE DIFF VIEW:</span>
            <div className="flex items-center p-1 rounded-xl bg-[#101A2B] border border-white/10 text-xs font-mono">
              <button
                onClick={() => setViewState('before')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  viewState === 'before' ? 'bg-white/20 text-white' : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                Before
              </button>
              <button
                onClick={() => setViewState('after')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  viewState === 'after' ? 'bg-[#10b981] text-black' : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                After
              </button>
              <button
                onClick={() => setViewState('overlay')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  viewState === 'overlay'
                    ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12]'
                    : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                Overlay (Ghost + Diff)
              </button>
            </div>
          </div>

          <span className="text-xs font-mono text-[#98A6BB]">
            Cohort viewing: <strong className="text-white font-mono">{selectedCohort}</strong>
          </span>
        </div>

        {/* Timetable Diff Render */}
        <TimetableGrid
          assignments={
            viewState === 'before'
              ? beforeAssignments
              : viewState === 'after'
              ? afterAssignments
              : beforeAssignments.filter(
                  (a) =>
                    !changeRequest.moves.some(
                      (m) => m.fromDay === a.day && m.fromPeriod === a.period && m.fromRoomId === a.roomId
                    )
                )
          }
          sessions={TIMETABLE_SESSIONS}
          ghostAssignments={viewState === 'overlay' ? ghostAssignments : []}
          newAssignments={viewState === 'overlay' ? newAssignments : []}
          mode="diff"
        />

        {/* Moves Detailed Table (§5.8) */}
        <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              INDIVIDUAL SESSION MOVES BREAKDOWN ({changeRequest.moves.length})
            </span>
            <span className="text-[11px] font-mono text-[#98A6BB]">Automated constraint repair</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#98A6BB] uppercase text-[10px]">
                  <th className="p-2.5">Session</th>
                  <th className="p-2.5">From Slot</th>
                  <th className="p-2.5">To Slot</th>
                  <th className="p-2.5">Move Type</th>
                  <th className="p-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {changeRequest.moves.map((move) => (
                  <tr key={move.id} className="hover:bg-white/[0.02]">
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
          <h3 className="text-sm font-mono font-bold text-white uppercase">Governance Sign-Off</h3>

          {isDecided ? (
            <div
              className={`p-4 rounded-2xl flex items-center gap-3 font-mono text-xs font-bold ${
                decisionType === 'approved'
                  ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
              }`}
            >
              {decisionType === 'approved' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Proposal Approved and applied to active campus schedule. All cohorts notified.</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <span>Proposal Rejected. Requester notified to submit an alternative scenario.</span>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional governance notes (e.g. 'Approved with alternate room verified by HOD')..."
                className="w-full bg-[#101A2B] border border-white/10 focus:border-[#66E3F0] rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReject}
                  className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-rose-500/20 text-rose-400 border border-white/10 hover:border-rose-500/30 transition-all"
                >
                  Reject Proposal
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  className="px-6 py-2.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-black shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Apply to Schedule</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

