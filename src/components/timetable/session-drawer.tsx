'use client';

import React from 'react';
import Link from 'next/link';
import {
  X,
  Building,
  User,
  Users,
  Clock,
  Shuffle,
} from 'lucide-react';
import { SessionItem, TimetableAssignment } from '@/lib/contracts';
import { KindChip, Week7OverrideBadge } from '@/components/semantic/badges';
import { ExplanationPanel } from '@/components/assistant/explanations';
import { useOptionalSessionUser } from '@/components/providers/session-provider';
import { useReferenceData } from '@/hooks/use-reference-data';
import { PERIOD_MAP, formatDay } from '@/lib/format';

/** Legacy display labels the `userRole` prop accepts, for callers without a session. */
const CAN_REQUEST_LABELS = new Set(['Faculty', 'Department Coordinator', 'Admin']);

interface SessionDrawerProps {
  session: SessionItem | null;
  assignment: TimetableAssignment | null;
  onClose: () => void;
  userRole?: string;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  session,
  assignment,
  onClose,
  userRole,
}) => {
  const sessionUser = useOptionalSessionUser();
  const { referenceData } = useReferenceData();

  if (!session || !assignment) return null;

  const periodData = PERIOD_MAP[assignment.period];
  const room = referenceData.rooms.find((r) => r.id === assignment.roomId);
  const capacity = room?.capacity ?? null;
  const occupancyPercent = capacity
    ? Math.min(100, Math.round((session.studentCount / capacity) * 100))
    : null;
  // Clubs can't file change requests; everyone else can (the API checks the scope).
  const canRequestChange = sessionUser
    ? sessionUser.role !== 'club'
    : CAN_REQUEST_LABELS.has(userRole ?? '');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0B1220] border-l border-white/10 h-full p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#66E3F0] font-bold">SESSION DIAGNOSIS</span>
              {assignment.isOverride && <Week7OverrideBadge reason={assignment.overrideReason} />}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Title & Kind */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-lg font-black text-white">{session.courseCode}</span>
              <KindChip kind={session.kind} isBasket={session.isElectiveBasket} basketName={session.basketName} />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">{session.courseName}</h2>
          </div>

          {/* Time & Venue Information */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#101A2B] border border-white/10">
              <div className="text-[10px] font-mono text-[#98A6BB] uppercase flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-[#66E3F0]" />
                SCHEDULE
              </div>
              <div className="font-mono font-bold text-sm text-white">{formatDay(assignment.day, true)}</div>
              <div className="font-mono text-xs text-[#98A6BB]">{periodData?.timing} ({assignment.period})</div>
            </div>

            <div className="p-3 rounded-xl bg-[#101A2B] border border-white/10">
              <div className="text-[10px] font-mono text-[#98A6BB] uppercase flex items-center gap-1.5 mb-1">
                <Building className="w-3.5 h-3.5 text-[#fbbf24]" />
                ASSIGNED VENUE
              </div>
              <div className="font-mono font-bold text-sm text-white">{assignment.roomName}</div>
              <div className="text-[10px] text-[#98A6BB]">
                {room ? `${room.building} · ${room.type}` : assignment.roomId}
              </div>
            </div>
          </div>

          {/* Instructor & Cohorts */}
          <div className="mt-4 space-y-3">
            <div className="p-3 rounded-xl bg-[#101A2B] border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#8279FF]/20 text-[#8279FF]">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{session.facultyName}</div>
                  <div className="text-[10px] font-mono text-[#98A6BB]">Faculty ID: {session.facultyId}</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/70">
                Primary
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#101A2B] border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#98A6BB] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#66E3F0]" />
                  STUDENT OCCUPANCY
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {capacity !== null
                    ? `${session.studentCount} / ${capacity} Seats (${occupancyPercent}%)`
                    : `${session.studentCount} Students`}
                </span>
              </div>
              {occupancyPercent !== null && (
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#66E3F0] to-[#8279FF] rounded-full"
                    style={{ width: `${occupancyPercent}%` }}
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {session.groups.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* "Why here?" from the engine (POST /api/explain, subject session) */}
          <div className="mt-5">
            <ExplanationPanel
              key={session.id}
              subject="session"
              id={session.id}
              label="Why was this scheduled here?"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-white/10 space-y-2">
          {canRequestChange && (
            <Link
              href={`/changes/new?session=${session.id}&course=${session.courseCode}`}
              className="w-full py-2.5 rounded-xl text-xs font-mono font-bold bg-[#8279FF]/20 hover:bg-[#8279FF]/30 text-[#8279FF] border border-[#8279FF]/40 flex items-center justify-center gap-2 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Request Reschedule / Change</span>
            </Link>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs font-mono text-[#98A6BB] hover:text-white hover:bg-white/5 transition-colors"
          >
            Dismiss Drawer
          </button>
        </div>
      </div>
    </div>
  );
};

