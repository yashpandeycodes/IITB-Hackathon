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
import type {
  UiSessionKind,
  BookingStatus,
  PriorityCategory,
} from '@/lib/contracts';

// ==========================================
// 1. Kind Chip (Lecture, Lab, Tutorial, Basket)
// ==========================================

export const KindChip: React.FC<{ kind: UiSessionKind; isBasket?: boolean; basketName?: string }> = ({
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
// 2. Status Badge (Approved, Pending, Alternative, etc.)
// ==========================================

export const StatusBadge: React.FC<{ status: BookingStatus | string; className?: string }> = ({
  status,
  className = '',
}) => {
  switch (status) {
    case 'approved':
    case 'applied':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ${className}`}
        >
          <CheckCircle2 className="w-3 h-3" />
          Approved
        </span>
      );
    case 'alternative':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 ${className}`}
        >
          <Shuffle className="w-3 h-3" />
          Alternative Offered
        </span>
      );
    case 'rejected':
    case 'infeasible':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 ${className}`}
        >
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      );
    case 'pending':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 ${className}`}
        >
          <Clock className="w-3 h-3 animate-pulse" />
          Pending
        </span>
      );
    case 'cancelled':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30 line-through ${className}`}
        >
          <Ban className="w-3 h-3" />
          Cancelled
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30 ${className}`}
        >
          {status}
        </span>
      );
  }
};

// ==========================================
// 3. Priority Category Chip
// ==========================================

export const CategoryChip: React.FC<{
  category: PriorityCategory | string;
  isCapped?: boolean;
  originalClaim?: string;
  className?: string;
}> = ({ category, isCapped, originalClaim, className = '' }) => {
  const getBadgeConfig = () => {
    switch (category) {
      case 'exam':
        return { label: 'Exam', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/30' };
      case 'regular_class':
        return { label: 'Regular Class', bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30' };
      case 'institute_event':
        return { label: 'Institute Event', bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/30' };
      case 'guest_lecture':
        return { label: 'Guest Lecture', bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/30' };
      case 'department_event':
        return { label: 'Dept Event', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' };
      case 'club_event':
        return { label: 'Club Event', bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500/30' };
      default:
        return { label: category, bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30' };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span>{config.label}</span>
      {isCapped && (
        <span
          title={`Claimed '${originalClaim}', capped by role`}
          className="px-1 py-0.2 rounded text-[10px] uppercase font-bold tracking-wider bg-amber-500/30 text-amber-300 border border-amber-500/40"
        >
          capped
        </span>
      )}
    </span>
  );
};

// ==========================================
// 4. Hard & Soft Rule Chips
// ==========================================

export const HardRuleChip: React.FC<{ code: string; label?: string }> = ({ code, label }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
    <OctagonAlert className="w-3 h-3 text-rose-400" />
    <span>{code}</span>
    {label && <span className="font-sans font-normal opacity-80 text-[11px]">— {label}</span>}
  </span>
);

export const SoftPenaltyChip: React.FC<{ code: string; points: number; label?: string }> = ({
  code,
  points,
  label,
}) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
    <TriangleAlert className="w-3 h-3 text-amber-400" />
    <span>{code}</span>
    <span className="font-bold">(-{points})</span>
    {label && <span className="font-sans font-normal opacity-80 text-[11px]">— {label}</span>}
  </span>
);

// ==========================================
// 5. Week 7 Override Badge (§3.2)
// ==========================================

export const Week7OverrideBadge: React.FC<{ reason?: string }> = ({ reason }) => (
  <span
    title={reason || 'Active during Week 7 only'}
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40 border-dashed"
  >
    <Zap className="w-2.5 h-2.5 text-violet-400" />
    Week 7 only
  </span>
);

export { RuleChip } from './rule-chip';
