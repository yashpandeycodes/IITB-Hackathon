'use client';

import React, { use, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, FileQuestion, MessageSquareText } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { StatusBadge } from '@/components/semantic/status-badge';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { EmptyState } from '@/components/states/empty-state';
import {
  CHANGE_KIND_LABEL,
  errorMessage,
  formatDateTime,
  roleLabel,
  timeAgo,
} from '@/components/approvals/approval-utils';
import { ChangeMetrics } from '@/components/approvals/change-metrics';
import { ConflictReport } from '@/components/approvals/conflict-report';
import { ChangeDiffGrid } from '@/components/approvals/change-diff-grid';
import { MovesTable } from '@/components/approvals/moves-table';
import { ChangeExplain } from '@/components/approvals/change-explain';
import {
  ChangeDecisionPanel,
  changeDetailKey,
} from '@/components/approvals/change-decision-panel';
import { buildSessionInfo } from '@/components/approvals/session-info';
import { useReferenceData } from '@/hooks/use-reference-data';
import { getChange, isApiClientError } from '@/lib/api-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ApprovalDetailPage({ params }: PageProps) {
  const { id: rawId } = use(params);
  const id = safeDecode(rawId);
  const user = useSessionUser();
  const { referenceData, courseName, facultyName } = useReferenceData();
  const isClub = user.role === 'club';

  const query = useQuery({
    queryKey: changeDetailKey(id),
    queryFn: ({ signal }) => getChange(id, { signal }),
    enabled: !isClub,
  });
  const change = query.data;

  const info = useMemo(
    () => buildSessionInfo(referenceData.sessions, change),
    [referenceData.sessions, change],
  );

  const notFound =
    query.isError && isApiClientError(query.error) && query.error.code === 'NOT_FOUND';

  return (
    <AppShell
      pageTitle={`Change ${id}`}
      breadcrumbs={[{ label: 'Approvals', href: '/approvals' }, { label: id }]}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-[#98A6BB] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to approvals</span>
        </Link>

        {isClub ? (
          <EmptyState
            icon={FileQuestion}
            title="Change requests aren't available to club accounts"
            description="Timetable changes are filed by faculty, coordinators and admins."
            cta={{ label: 'Go to bookings', href: '/bookings' }}
          />
        ) : query.isLoading ? (
          <PageSkeleton />
        ) : notFound ? (
          <EmptyState
            icon={FileQuestion}
            title={`No change request ${id}`}
            description="It doesn't exist, or it doesn't touch your department or sessions."
            cta={{ label: 'Back to approvals', href: '/approvals' }}
          />
        ) : query.isError || !change ? (
          <ErrorState
            title="Couldn't load this change request"
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            {/* Header */}
            <div className="space-y-3 rounded-3xl border border-white/10 bg-[#0B1220] p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xl font-black text-[#66E3F0]">{change.id}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white">
                  {CHANGE_KIND_LABEL[change.kind]}
                </span>
                <StatusBadge status={change.status} />
              </div>
              <h1 className="text-xl font-black break-words text-white sm:text-2xl">
                {change.title || 'Timetable change'}
              </h1>
              {change.description ? (
                <p className="text-sm text-[#cbd5e1]">{change.description}</p>
              ) : null}
              {change.nl_prompt ? (
                <p className="flex items-start gap-1.5 text-xs text-[#98A6BB]">
                  <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Asked the assistant: “{change.nl_prompt}”</span>
                </p>
              ) : null}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 font-mono text-[11px] text-[#98A6BB] sm:grid-cols-2">
                <div>
                  <dt className="inline">Requested by </dt>
                  <dd className="inline text-white">
                    {change.requested_by} ({roleLabel(change.requested_by_role)})
                    {change.requested_by === user.id ? ' · you' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Filed </dt>
                  <dd className="inline text-white" title={formatDateTime(change.created_at)}>
                    {timeAgo(change.created_at)} · {formatDateTime(change.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Timetable </dt>
                  <dd className="inline text-white">
                    built on {change.base_version}
                    {change.proposed_version ? ` → draft ${change.proposed_version}` : ''}
                  </dd>
                </div>
                {change.decided_at ? (
                  <div>
                    <dt className="inline">Decided </dt>
                    <dd className="inline text-white">
                      {formatDateTime(change.decided_at)}
                      {change.decided_by ? ` by ${change.decided_by}` : ''}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {change.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  {change.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <ChangeMetrics change={change} />

            {change.status === 'infeasible' ? (
              <ConflictReport conflicts={change.conflicts} info={info} courseName={courseName} />
            ) : null}

            {change.diff.length > 0 ? (
              <>
                <ChangeDiffGrid change={change} />
                <div className="space-y-3 rounded-3xl border border-white/10 bg-[#0B1220] p-4 sm:p-5">
                  <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
                    What changes ({change.diff.length})
                  </h2>
                  <MovesTable
                    diff={change.diff}
                    info={info}
                    courseName={courseName}
                    facultyName={facultyName}
                  />
                </div>
              </>
            ) : change.status !== 'infeasible' ? (
              <p className="rounded-2xl border border-white/10 bg-[#0B1220] p-4 font-mono text-xs text-[#98A6BB]">
                No session moves: every session keeps its slot.
              </p>
            ) : null}

            <ChangeExplain changeId={change.id} infeasible={change.status === 'infeasible'} />

            <ChangeDecisionPanel change={change} />
          </>
        )}
      </div>
    </AppShell>
  );
}
