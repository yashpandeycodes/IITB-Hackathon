'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Info, OctagonX, Shuffle, Ticket } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { EmptyState } from '@/components/states/empty-state';
import { ChangeCard } from '@/components/approvals/change-card';
import { BookingApprovalCard } from '@/components/approvals/booking-approval-card';
import { errorMessage } from '@/components/approvals/approval-utils';
import { useReferenceData } from '@/hooks/use-reference-data';
import { listBookings, listChanges } from '@/lib/api-client';

type Tab = 'changes' | 'bookings';

export default function ApprovalsInboxPage() {
  const user = useSessionUser();
  const { roomName } = useReferenceData();
  const isAdmin = user.role === 'admin';
  const canSeeChanges = user.role !== 'club';
  const approvesBookings = user.role === 'admin' || user.role === 'department_coordinator';
  // Coordinators approve lab bookings but only review changes, so start them on bookings.
  const [tab, setTab] = useState<Tab>(
    user.role === 'department_coordinator' || !canSeeChanges ? 'bookings' : 'changes',
  );

  const pendingChanges = useQuery({
    queryKey: ['changes', 'list', { scope: 'pending' }],
    queryFn: ({ signal }) => listChanges({ scope: 'pending' }, { signal }),
    enabled: canSeeChanges,
  });
  const infeasibleChanges = useQuery({
    queryKey: ['changes', 'list', { status: 'infeasible' }],
    queryFn: ({ signal }) => listChanges({ status: 'infeasible' }, { signal }),
    enabled: canSeeChanges,
  });
  const bookings = useQuery({
    queryKey: ['bookings', 'approvals'],
    queryFn: ({ signal }) => listBookings({ scope: 'approvals' }, { signal }),
    enabled: approvesBookings,
  });

  const changeCount = pendingChanges.data?.length;
  const bookingCount = approvesBookings ? bookings.data?.length : 0;

  const tabs: { id: Tab; label: string; icon: typeof Shuffle; count: number | undefined }[] = [
    { id: 'changes', label: 'Changes', icon: Shuffle, count: canSeeChanges ? changeCount : 0 },
    { id: 'bookings', label: 'Bookings', icon: Ticket, count: bookingCount },
  ];

  return (
    <AppShell pageTitle="Approvals" breadcrumbs={[{ label: 'Approvals' }]}>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & tabs */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[#8279FF]/30 bg-[#0B1220] p-5 shadow-lg sm:flex-row sm:items-center">
          <div>
            <span className="font-mono text-xs font-bold tracking-wider text-[#8279FF] uppercase">
              {isAdmin ? 'Admin approvals' : user.role === 'department_coordinator' ? `${user.department ?? 'Department'} approvals` : 'Pending changes'}
            </span>
            <h1 className="text-2xl font-black text-white sm:text-3xl">Approvals</h1>
            <p className="mt-1 text-xs text-[#98A6BB] sm:text-sm">
              {isAdmin
                ? 'Timetable changes and bookings that move classes or use department labs wait here for you.'
                : user.role === 'department_coordinator'
                  ? "Approve bookings of your department's labs; review timetable changes that touch your department."
                  : 'Timetable changes that touch you, waiting for an admin.'}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Approval type"
            className="flex self-start rounded-2xl border border-white/10 bg-[#101A2B] p-1 sm:self-auto"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
                    active ? 'bg-[#8279FF] text-white shadow-md' : 'text-[#98A6BB] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? 'bg-white/20' : 'bg-white/10'
                    }`}
                  >
                    {t.count === undefined ? '…' : t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Changes */}
        {tab === 'changes' ? (
          !canSeeChanges ? (
            <EmptyState
              icon={Info}
              title="Timetable changes aren't available to club accounts"
              description="Your booking requests and their decisions are on My bookings."
              cta={{ label: 'My bookings', href: '/bookings' }}
            />
          ) : (
            <div className="space-y-6">
              {!isAdmin ? (
                <Note>
                  Only an admin approves timetable changes. These are the pending proposals that touch
                  {user.role === 'department_coordinator' ? ' your department' : ' your sessions'}; open one to see
                  exactly what would move.
                </Note>
              ) : null}

              {pendingChanges.isLoading ? (
                <PageSkeleton kpis={false} />
              ) : pendingChanges.isError ? (
                <ErrorState
                  title="Couldn't load pending changes"
                  message={errorMessage(pendingChanges.error)}
                  onRetry={() => void pendingChanges.refetch()}
                />
              ) : (pendingChanges.data ?? []).length === 0 ? (
                <EmptyState
                  icon={CheckCheck}
                  title={isAdmin ? 'Nothing waiting for your approval' : 'No pending changes'}
                  description={
                    isAdmin
                      ? "You're all caught up. New change requests show up here as soon as they're filed."
                      : 'No timetable change touching you is waiting for approval.'
                  }
                  cta={{ label: 'All change requests', href: '/changes' }}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {(pendingChanges.data ?? []).map((change) => (
                    <ChangeCard key={change.id} change={change} canAct={isAdmin} />
                  ))}
                </div>
              )}

              {(infeasibleChanges.data ?? []).length > 0 ? (
                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300 uppercase">
                    <OctagonX className="h-4 w-4" />
                    No valid fix ({infeasibleChanges.data?.length})
                  </h2>
                  <p className="text-xs text-[#98A6BB]">
                    These requests can&apos;t be applied: the rescheduler found which constraints conflict.
                    {isAdmin ? ' Reject them so the requester can file a different change.' : ''}
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {(infeasibleChanges.data ?? []).map((change) => (
                      <ChangeCard key={change.id} change={change} canAct={isAdmin} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )
        ) : null}

        {/* Bookings */}
        {tab === 'bookings' ? (
          !approvesBookings ? (
            <EmptyState
              icon={Info}
              title="Bookings are approved by admins and department coordinators"
              description="Your own booking requests and their decisions are on My bookings."
              cta={{ label: 'My bookings', href: '/bookings' }}
            />
          ) : (
            <div className="space-y-4">
              <Note>
                {isAdmin
                  ? 'Bookings that move classes for Week 7 need an admin; bookings in a department lab need that department’s coordinator (or an admin). The slot is held while it waits.'
                  : `Bookings in ${user.department ?? 'your department'}'s labs wait here for you. Bookings that move classes go to an admin. The slot is held while it waits.`}
              </Note>

              {bookings.isLoading ? (
                <PageSkeleton kpis={false} />
              ) : bookings.isError ? (
                <ErrorState
                  title="Couldn't load bookings waiting for approval"
                  message={errorMessage(bookings.error)}
                  onRetry={() => void bookings.refetch()}
                />
              ) : (bookings.data ?? []).length === 0 ? (
                <EmptyState
                  icon={CheckCheck}
                  title="Nothing waiting for your approval"
                  description="No booking needs your sign-off right now."
                  cta={{ label: 'Spectra board', href: '/spectra' }}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {(bookings.data ?? []).map((booking) => (
                    <BookingApprovalCard key={booking.request.id} booking={booking} roomName={roomName} />
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}

        <p className="text-center font-mono text-[11px] text-[#98A6BB]">
          Nobody can approve their own request.{' '}
          <Link href="/changes" className="text-[#66E3F0] hover:underline">
            All change requests
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-white/10 bg-[#0B1220] p-3 text-xs text-[#cbd5e1]">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#66E3F0]" />
      <span>{children}</span>
    </p>
  );
}
