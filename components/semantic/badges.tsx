import React from 'react';
import {
  BookOpen,
  HelpCircle,
  FlaskConical,
  Layers,
  Zap,
  Ticket,
  CheckCircle2,
  Shuffle,
  XCircle,
  Clock,
  Ban,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import {
  SessionKind,
  BookingStatus,
  PriorityCategory,
} from '@/lib/contracts';

// ==========================================
// 1. Kind Chip (Lecture, Lab, Tutorial, Basket)
// ==========================================

export const KindChip: React.FC<{ kind: SessionKind; isBasket?: boolean; basketName?: string }> = ({
  kind,
  isBasket,
  basketName,
}) => {
  if (isBasket) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
        <Layers className="w-3 h-3 text-fuchsia-400" />
        {basketName || 'OEB-1'}
      </span>
    );
  }

  switch (kind) {
    case 'lecture':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          <BookOpen className="w-2.5 h-2.5" />
          L
        </span>
      );
    case 'tutorial':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
          <HelpCircle className="w-2.5 h-2.5" />
          T
        </span>
      );
    case 'lab':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <FlaskConical className="w-3 h-3 text-amber-400" />
          P
        </span>
      );
    case 'booking':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
          <Ticket className="w-2.5 h-2.5" />
          Event
        </span>
      );
    case 'exam':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          Exam
        </span>
      );
    default:
      return null;
  }
};

// ==========================================
// 2. Status Badge (Approved, Alternative, Rejected, Pending)
// ==========================================

export const StatusBadge: React.FC<{ status: BookingStatus | string; className?: string }> = ({ status, className = '' }) => {
  switch (status.toLowerCase()) {
    case 'approved':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)] ${className}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approved
        </span>
      );
    case 'alternative':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 ${className}`}>
          <Shuffle className="w-3.5 h-3.5" />
          Alternative
        </span>
      );
    case 'rejected':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 ${className}`}>
          <XCircle className="w-3.5 h-3.5" />
          Rejected
        </span>
      );
    case 'pending':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 ${className}`}>
          <Clock className="w-3.5 h-3.5 animate-pulse" />
          Pending
        </span>
      );
    case 'cancelled':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 line-through ${className}`}>
          <Ban className="w-3.5 h-3.5" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/20 ${className}`}>
          {status}
        </span>
      );
  }
};

// ==========================================
// 3. Category Chip (with Capped indicator)
// ==========================================

export const CategoryChip: React.FC<{
  category: PriorityCategory | string;
  isCapped?: boolean;
  originalClaim?: string;
}> = ({ category, isCapped, originalClaim }) => {
  const styles: Record<string, { bg: string; text: string; border: string; label: string }> = {
    exam: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40', label: 'Exam' },
    regular_class: { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/40', label: 'Regular Class' },
    institute_event: { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/40', label: 'Institute Event' },
    guest_lecture: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/40', label: 'Guest Lecture' },
    department_event: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', label: 'Dept Event' },
    club_event: { bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500/40', label: 'Club Event' },
  };

  const current = styles[category] || {
    bg: 'bg-zinc-500/20',
    text: 'text-zinc-300',
    border: 'border-zinc-500/30',
    label: category,
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${current.bg} ${current.text} ${current.border}`}>
        {current.label}
      </span>
      {isCapped && (
        <span
          title={originalClaim ? `Role capped from: ${originalClaim}` : 'Role capped by policy'}
          className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 cursor-help"
        >
          CAPPED
        </span>
      )}
    </span>
  );
};

// ==========================================
// 4. Constraint Rule Chips (H1..H14, S1..S6)
// ==========================================

export const RuleChip: React.FC<{ code: string; type?: 'hard' | 'soft'; description?: string }> = ({
  code,
  type = code.startsWith('H') ? 'hard' : 'soft',
  description,
}) => {
  if (type === 'hard') {
    return (
      <span
        title={description}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40"
      >
        <OctagonAlert className="w-3 h-3 text-rose-400" />
        {code}
      </span>
    );
  }

  return (
    <span
      title={description}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
    >
      <TriangleAlert className="w-3 h-3 text-amber-400" />
      {code}
    </span>
  );
};

// ==========================================
// 5. Week-7 Override Indicator (⚡)
// ==========================================

export const Week7OverrideBadge: React.FC<{ reason?: string }> = ({ reason }) => {
  return (
    <span
      title={reason || 'Moved for Spectra Inauguration (Week 7 override)'}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-600/25 text-violet-300 border border-dashed border-violet-400 cursor-help shadow-[0_0_8px_rgba(139,92,246,0.3)]"
    >
      <Zap className="w-2.5 h-2.5 text-violet-400 fill-violet-400" />
      Week 7 only
    </span>
  );
};

