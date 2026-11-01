'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitPullRequestArrow, Plus, ShieldOff } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangeListItem } from '@/components/changes/change-list-item';
import { errorMessage } from '@/components/changes/api-errors';
import { listChanges, rejectChange } from '@/lib/api-client';
import type { ChangeListQuery, StoredChangeStatus } from '@/lib/contracts';

type Scope = ChangeListQuery['scope'];

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'All I can see' },
  { value: 'mine', label: 'Filed by me' },
  { value: 'pending', label: 'Waiting for approval' },
];

const STATUSES: Array<{ value: StoredChangeStatus | ''; label: string }> = [
  { value: '', label: 'Any status' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'infeasible', label: 'No valid fix' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected / withdrawn' },
];

const BREADCRUMBS = [{ label: 'Changes' }];

export default function ChangesListPage() {
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<StoredChangeStatus | ''>('');
  const canUse = user.role !== 'club';

  const changes = useQuery({
    queryKey: ['changes', { scope, status }],
    queryFn: ({ signal }) => listChanges({ scope, status: status || undefined }, { signal }),
    enabled: canUse,
    staleTime: 10_000,
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => rejectChange(id, {}),
    onSuccess: (change) => {
      toast.success(`${change.id} withdrawn.`);
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't withdraw this request.")),
  });

  if (!canUse) {
    return (
      <AppShell pageTitle="Timetable changes" breadcrumbs={BREADCRUMBS}>
        <EmptyState
          icon={ShieldOff}
          title="Clubs don't file timetable changes"
          description="Change requests (faculty leave, room closures, extra or moved sessions) are filed by faculty, department coordinators and admins. To book a venue for an event, use Bookings."
          cta={{ label: 'Go to Bookings', href: '/bookings' }}
        />
      </AppShell>
    );
  }

  const list = changes.data ?? [];

  return (
    <AppShell pageTitle="Timetable changes" breadcrumbs={BREADCRUMBS}>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white">Change requests</h1>
            <p className="text-xs font-mono text-[#98A6BB] mt-0.5">
              Leave, room closures, extra or moved sessions and change files. Each one is a proposal with the fewest
              moves; nothing changes until an admin approves it.
            </p>
          </div>
          <Link
            href="/changes/new"
            className="self-start sm:self-auto shrink-0 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>New change request</span>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Which requests"
            className="flex items-center gap-1 p-1 rounded-2xl bg-[#0B1220] border border-white/10 overflow-x-auto"
          >
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={scope === s.value}
                onClick={() => setScope(s.value)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors ${
                  scope === s.value ? 'bg-[#66E3F0] text-[#070A12]' : 'text-[#98A6BB] hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-mono text-[#98A6BB]">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StoredChangeStatus | '')}
              className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#66E3F0]/50"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {changes.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading change requests…</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-3xl bg-white/5" />
            ))}
          </div>
        ) : changes.isError ? (
          <ErrorState
            title="Couldn't load change requests"
            message={errorMessage(changes.error, 'The change list failed to load.')}
            onRetry={() => void changes.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={GitPullRequestArrow}
            title={scope === 'all' && !status ? 'No change requests yet' : 'Nothing matches these filters'}
            description={
              scope === 'all' && !status
                ? 'Mark faculty leave, close a room, add or move a session, or load a change file. The engine proposes the fix with the fewest moves.'
                : 'Try another status or show all requests.'
            }
            cta={{ label: 'New change request', href: '/changes/new', icon: Plus }}
          />
        ) : (
          <div className="space-y-3">
            {list.map((change) => {
              const isMine = change.requested_by === user.id;
              const canWithdraw = isMine && (change.status === 'pending' || change.status === 'infeasible');
              return (
                <ChangeListItem
                  key={change.id}
                  change={change}
                  isMine={isMine}
                  onWithdraw={canWithdraw ? () => withdraw.mutate(change.id) : undefined}
                  withdrawing={withdraw.isPending && withdraw.variables === change.id}
                />
              );
            })}
            {list.length >= 100 ? (
              <p className="text-center text-[11px] font-mono text-[#98A6BB]">
                Showing the 100 newest. Narrow the filters to see older ones.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
