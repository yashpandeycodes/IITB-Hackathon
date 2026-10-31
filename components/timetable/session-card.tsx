'use client';

import React from 'react';
import { SessionItem, TimetableAssignment, BookingItem } from '@/lib/contracts';
import { KindChip, Week7OverrideBadge } from '@/components/semantic/badges';
import { Ticket, ArrowRight } from 'lucide-react';

interface SessionCardProps {
  session?: SessionItem;
  assignment?: TimetableAssignment;
  booking?: BookingItem;
  isGhost?: boolean;
  isNewPlacement?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  assignment,
  booking,
  isGhost = false,
  isNewPlacement = false,
  onClick,
  compact = false,
}) => {
  // 1. Event Booking Card (Spectra View Hatched Pink)
  if (booking) {
    return (
      <div
        onClick={onClick}
        className="w-full h-full p-2.5 rounded-xl border-2 border-pink-500/50 bg-[#1e0725]/90 hover:bg-[#2c0b36] cursor-pointer transition-all shadow-sm flex flex-col justify-between relative overflow-hidden group"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(236,72,153,0.1), rgba(236,72,153,0.1) 6px, transparent 6px, transparent 12px)',
        }}
      >
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-pink-400 bg-pink-500/20 px-1.5 py-0.5 rounded">
              <Ticket className="w-3 h-3" />
              {booking.id}
            </span>
            <span className="text-[10px] font-mono font-bold text-pink-300 truncate max-w-[80px]">
              {booking.assignedRoomName || booking.requestedRoomId}
            </span>
          </div>
          <div className="font-bold text-xs text-white line-clamp-2 leading-tight group-hover:text-pink-300 transition-colors">
            {booking.title}
          </div>
        </div>

        <div className="mt-1 pt-1 border-t border-pink-500/20 flex items-center justify-between text-[10px] font-mono text-pink-300/80">
          <span>{booking.requesterName.split(' ')[0]}</span>
          <span className="capitalize">{booking.status}</span>
        </div>
      </div>
    );
  }

  if (!session || !assignment) return null;

  // 2. Ghost Diff Card (Approval Before slot)
  if (isGhost) {
    return (
      <div className="w-full h-full p-2.5 rounded-xl border-2 border-dashed border-rose-500/60 bg-rose-950/20 opacity-70 flex flex-col justify-between cursor-not-allowed">
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-rose-300 font-bold mb-1">
            <span>{session.courseCode}</span>
            <span className="line-through">{assignment.roomName}</span>
          </div>
          <div className="text-[11px] font-medium text-rose-200 line-clamp-1">{session.courseName}</div>
        </div>
        <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1 font-bold">
          <span>RELOCATING</span>
          <ArrowRight className="w-3 h-3 animate-pulse" />
        </div>
      </div>
    );
  }

  // 3. New Placement Diff Card (Approval After slot)
  if (isNewPlacement) {
    return (
      <div className="w-full h-full p-2.5 rounded-xl border-2 border-emerald-500 bg-emerald-950/40 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300 font-bold mb-1">
            <span>{session.courseCode}</span>
            <span className="bg-emerald-500/20 px-1 rounded">{assignment.roomName}</span>
          </div>
          <div className="text-[11px] font-bold text-white line-clamp-1">{session.courseName}</div>
        </div>
        <div className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
          <span>✓ NEW PROPOSED SLOT</span>
        </div>
      </div>
    );
  }

  // 4. Standard Course Session Card (Hero UI)
  const isLab = session.kind === 'lab';
  const isBasket = session.isElectiveBasket;

  return (
    <div
      onClick={onClick}
      className={`w-full h-full p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group shadow-sm ${
        assignment.isOverride
          ? 'border-dashed border-violet-400 bg-violet-950/30 hover:bg-violet-900/40 shadow-[0_0_15px_rgba(139,92,246,0.25)]'
          : isLab
          ? 'border-amber-500/40 bg-[#1f1406]/90 hover:bg-[#2c1c08]'
          : isBasket
          ? 'border-fuchsia-500/40 bg-[#1c0828]/90 hover:bg-[#280c3a]'
          : 'border-white/10 bg-[#101A2B]/90 hover:bg-[#16243c] hover:border-[#66E3F0]/50 hover:shadow-[0_0_15px_rgba(102,227,240,0.15)]'
      }`}
    >
      <div>
        {/* Header: Course Code + Kind Chip */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="font-mono font-black text-xs sm:text-sm text-white group-hover:text-[#66E3F0] transition-colors">
            {session.courseCode}
          </span>
          <KindChip kind={session.kind} isBasket={isBasket} basketName={session.basketName} />
        </div>

        {/* Title */}
        <div className="text-xs font-semibold text-[#cbd5e1] line-clamp-1 group-hover:text-white transition-colors">
          {session.courseName}
        </div>

        {/* Stacked sub-rows for Elective Baskets */}
        {isBasket && session.basketSubCourses && (
          <div className="mt-1.5 space-y-1">
            {session.basketSubCourses.map((sub) => (
              <div key={sub.code} className="text-[10px] font-mono text-fuchsia-300/90 flex justify-between bg-black/30 px-1 py-0.5 rounded">
                <span>{sub.code} · {sub.room}</span>
                <span className="opacity-70">{sub.faculty.split(' ').pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Room + Faculty + Override marker */}
      <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-[#98A6BB]">
        <span className="font-bold text-white/90 group-hover:text-[#66E3F0] transition-colors">
          {assignment.roomName}
        </span>
        <span className="truncate max-w-[110px] text-right">
          {session.facultyName.replace(/^Dr\.\s*|^Prof\.\s*/, '')}
        </span>
      </div>

      {/* Week 7 Override Badge */}
      {assignment.isOverride && (
        <div className="mt-1">
          <Week7OverrideBadge reason={assignment.overrideReason} />
        </div>
      )}
    </div>
  );
};

