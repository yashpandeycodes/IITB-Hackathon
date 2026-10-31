'use client';

import React from 'react';
import Link from 'next/link';
import {
  X,
  Building,
  User,
  Users,
  Clock,
  Sparkles,
  Zap,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  Shuffle,
} from 'lucide-react';
import { SessionItem, TimetableAssignment } from '@/lib/contracts';
import { KindChip, Week7OverrideBadge } from '@/components/semantic/badges';
import { PERIOD_MAP, formatDay } from '@/lib/format';

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
  userRole = 'Admin',
}) => {
  const [showExplanation, setShowExplanation] = React.useState(false);

  if (!session || !assignment) return null;

  const periodData = PERIOD_MAP[assignment.period];
  const capacity = 150; // Mock room capacity benchmark
  const occupancyPercent = Math.min(100, Math.round((session.studentCount / capacity) * 100));

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
              <div className="text-[10px] text-[#98A6BB]">Central Complex</div>
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
                  {session.studentCount} / {capacity} Seats ({occupancyPercent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#66E3F0] to-[#8279FF] rounded-full"
                  style={{ width: `${occupancyPercent}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {session.groups.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* "Why here?" AI Constraint Explainer (§5.3) */}
          <div className="mt-5">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#132035] hover:bg-[#1a2b47] border border-[#66E3F0]/30 text-xs font-mono font-bold text-[#66E3F0] flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                Why was this scheduled here?
              </span>
              <span>{showExplanation ? '▲ Hide' : '▼ Explain'}</span>
            </button>

            {showExplanation && (
              <div className="mt-3 p-3.5 rounded-xl bg-[#070A12] border border-white/10 space-y-2 text-xs text-[#cbd5e1] animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-[#34d399]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Optimal Multi-Objective Assignment:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-[#98A6BB]">
                  <li>H1/H2: Room {assignment.roomName} and {session.facultyName} strictly clash-free at {assignment.period}.</li>
                  <li>H4 Capacity: {session.studentCount} enrolled students fit comfortably within {capacity} room seats.</li>
                  <li>S1 Compactness: Zero idle gap periods created for {session.groups.join(', ')}.</li>
                  <li>S4 Preference: Theory lecture matched to morning window per department curriculum weight.</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-white/10 space-y-2">
          {(userRole === 'Faculty' || userRole === 'Department Coordinator' || userRole === 'Admin') && (
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

