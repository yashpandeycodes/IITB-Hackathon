'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  FileQuestion,
  MapPin,
  MessageSquareText,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { CategoryChip } from '@/components/semantic/badges';
import { useReferenceData } from '@/hooks/use-reference-data';
import { getBooking, isApiClientError } from '@/lib/api-client';
import type { BookingDetail, CalendarPeriod, Category, SessionUser } from '@/lib/contracts';
import { DecisionBadge, RequestStateBadge } from '@/components/bookings/booking-badges';
import { SourceTag, approvalLines } from '@/components/bookings/booking-card';
import { BookingFactsSummary } from '@/components/bookings/booking-facts';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import {
  NEED_LABEL,
  ROOM_TYPE_LABEL,
  calendarPeriods,
  canCancel,
  categoryLabel,
  decisionSlot,
  errorText,
  formatWhen,
  roleLabel,
  slotLabel,
} from '@/components/bookings/booking-utils';

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3 min-w-0">
      <h2 className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider">
        <Icon className="w-4 h-4 text-[#66E3F0]" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-0.5 sm:gap-3">
      <dt className="text-[11px] font-mono text-[#98A6BB] uppercase">{label}</dt>
      <dd className="text-xs text-[#cbd5e1] break-words">{children}</dd>
    </div>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function label<T extends string>(map: Record<string, string>, value: T): string {
  return map[value] ?? value;
}

function DetailBody({
  detail,
  user,
  periods,
  roomName,
}: {
  detail: BookingDetail;
  user: SessionUser;
  periods: readonly CalendarPeriod[];
  roomName: (id: string) => string;
}) {
  const { request, decision, explanation } = detail;
  const slot = decision ? decisionSlot(decision, periods) : null;
  const approval = approvalLines(detail);
  const facts = explanation?.facts ?? decision?.facts ?? null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-[#66E3F0] hover:underline"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to requests
      </Link>

      <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white break-words">
              {request.title || 'Untitled request'}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-mono text-[#98A6BB]">
              <span className="font-bold text-[#cbd5e1]">{request.id}</span>
              <span aria-hidden="true">·</span>
              <span>
                {request.requester || roleLabel(request.role)}
                {request.department ? ` (${request.department})` : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatWhen(request.submitted_at)}</span>
              <SourceTag view={detail} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <RequestStateBadge state={request.state} />
            {request.state !== 'cancelled' ? <DecisionBadge status={decision?.status} /> : null}
          </div>
        </div>
        {canCancel(detail, user) ? (
          <div className="flex justify-end">
            <CancelBookingButton requestId={request.id} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card title="Decision" icon={MapPin}>
          {decision ? (
            <div className="space-y-2">
              {decision.room_id && slot ? (
                <div className="font-mono text-sm font-bold text-white">
                  {decision.room_id} · {roomName(decision.room_id)}
                  <span className="block text-xs font-normal text-[#cbd5e1]">{slot}</span>
                </div>
              ) : (
                <div className="font-mono text-sm font-bold text-rose-300">No room given</div>
              )}
              <p className="text-xs text-[#cbd5e1] leading-relaxed">{decision.reason}</p>
              <dl className="space-y-2 pt-1">
                <Field label="Priority">
                  <CategoryChip
                    category={decision.effective_category}
                    isCapped={decision.category_capped}
                    originalClaim={request.requested_category}
                  />
                  {decision.category_capped ? (
                    <span className="block mt-1 text-[11px] font-mono text-amber-300">
                      Asked as {categoryLabel(request.requested_category as Category)}; capped by the
                      requester&apos;s role.
                    </span>
                  ) : null}
                </Field>
                <Field label="Decided">
                  {decision.auto ? 'Automatically by the engine' : 'By an approver'}, {formatWhen(decision.decided_at)}
                </Field>
                <Field label="Reason code">
                  <code className="text-[11px]">{decision.reason_code}</code>
                </Field>
              </dl>
            </div>
          ) : (
            <p className="text-xs text-[#98A6BB]">
              {request.state === 'cancelled'
                ? 'This request was cancelled, so it holds no room. Its slot went back to other requests.'
                : 'No decision yet: the engine decides once a timetable is active.'}
            </p>
          )}

          <div className="pt-2 border-t border-white/5 space-y-1">
            <div className="text-[11px] font-mono text-[#98A6BB] uppercase">Approval</div>
            {approval.length > 0 ? (
              approval.map((line) => (
                <p key={line} className="text-xs font-mono text-amber-300">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-xs font-mono text-[#cbd5e1]">No approval needed.</p>
            )}
            {detail.approval.needed && detail.approval.approver_role ? (
              <p className="text-[11px] font-mono text-[#98A6BB]">
                Approver: {roleLabel(detail.approval.approver_role)}
                {detail.approval.department ? ` · ${detail.approval.department}` : ''}. The slot is held meanwhile.
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Why" icon={MessageSquareText}>
          {explanation ? (
            <>
              <p className="text-sm text-white leading-relaxed">{explanation.text}</p>
              <p className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[#98A6BB]">
                {explanation.source === 'llm' ? (
                  <>
                    <Bot className="w-3 h-3 text-[#66E3F0]" aria-hidden="true" />
                    Phrased by AI from the engine&apos;s facts (checked against them)
                  </>
                ) : (
                  <>
                    <ScrollText className="w-3 h-3 text-[#8279FF]" aria-hidden="true" />
                    The engine&apos;s own wording
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-xs text-[#98A6BB]">
              {decision ? decision.reason : 'There is nothing to explain until the request is decided.'}
            </p>
          )}
          {facts ? (
            <details className="pt-2 border-t border-white/5" open>
              <summary className="cursor-pointer text-[11px] font-mono text-[#98A6BB] uppercase hover:text-white">
                Facts behind it
              </summary>
              <div className="mt-2">
                <BookingFactsSummary facts={facts} periods={periods} roomName={roomName} />
              </div>
            </details>
          ) : null}
        </Card>
      </div>

      <Card title="What was asked for" icon={FileQuestion}>
        <dl className="space-y-2">
          <Field label="Attendance">{request.attendance} people</Field>
          <Field label="Duration">
            {request.duration_periods} period{request.duration_periods === 1 ? '' : 's'}
          </Field>
          <Field label="Windows">
            {request.windows.length > 0
              ? request.windows.map((w) => slotLabel(w.day, w.from_period, w.to_period, periods)).join('; ')
              : '—'}
          </Field>
          <Field label="Room types">
            {request.room_types.map((t) => label(ROOM_TYPE_LABEL, t)).join(', ') || '—'}
          </Field>
          <Field label="Needs">{request.needs.map((n) => label(NEED_LABEL, n)).join(', ') || 'None'}</Field>
          <Field label="Preferred room">
            {request.requested_room ? `${request.requested_room} (${roomName(request.requested_room)})` : 'Any suitable room'}
          </Field>
          <Field label="Compulsory for">
            {request.mandatory_for_groups.length > 0 ? request.mandatory_for_groups.join(', ') : 'Nobody'}
          </Field>
          {request.series_id ? <Field label="Series">{request.series_id}</Field> : null}
          {request.raw_text ? (
            <Field label="Original text">
              <span className="italic">&ldquo;{request.raw_text}&rdquo;</span>
            </Field>
          ) : null}
          {request.ai_meta ? (
            <>
              <Field label="Read by">
                {request.ai_meta.source === 'rules' || request.ai_meta.model === 'rules'
                  ? 'Offline rule parser'
                  : `AI (${request.ai_meta.model})`}
              </Field>
              {request.ai_meta.assumptions.length > 0 ? (
                <Field label="Assumptions">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {request.ai_meta.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </Field>
              ) : null}
              {request.ai_meta.follow_up ? <Field label="Open question">{request.ai_meta.follow_up}</Field> : null}
            </>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = safeDecode(rawId);
  const user = useSessionUser();
  const { referenceData, roomName } = useReferenceData();
  const periods = calendarPeriods(referenceData.calendar.periods);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bookings', 'detail', id],
    queryFn: () => getBooking(id),
    staleTime: 10_000,
  });

  const notFound = isError && isApiClientError(error) && error.status === 404;

  return (
    <AppShell
      pageTitle="Booking Request"
      breadcrumbs={[{ label: 'Bookings', href: '/bookings' }, { label: id }]}
    >
      {isLoading ? (
        <PageSkeleton kpis={false} />
      ) : notFound ? (
        <div className="max-w-3xl mx-auto">
          <EmptyState
            icon={FileQuestion}
            title="Booking request not found"
            description={`There's no request "${id}" that you can see. It may belong to someone else, or the dataset was reset.`}
            cta={{ label: 'Back to my requests', href: '/bookings' }}
          />
        </div>
      ) : isError ? (
        <div className="max-w-3xl mx-auto">
          <ErrorState
            title="Couldn't load this request"
            message={errorText(error, 'Please try again in a moment.')}
            onRetry={() => void refetch()}
          />
        </div>
      ) : data ? (
        <DetailBody detail={data} user={user} periods={periods} roomName={roomName} />
      ) : null}
    </AppShell>
  );
}
