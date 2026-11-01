'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, RefreshCw, Sparkles, Ticket } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { useReferenceData } from '@/hooks/use-reference-data';
import { listBookings } from '@/lib/api-client';
import type { RequestState } from '@/lib/contracts';
import { BookingCard } from '@/components/bookings/booking-card';
import { OPEN_STATES, calendarPeriods, errorText } from '@/components/bookings/booking-utils';

/** At most this many open live requests per user (`POST /api/bookings` → 409 beyond it). */
const OPEN_REQUEST_LIMIT = 20;

const STATE_FILTERS: Array<{ value: RequestState | 'all'; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending_approval', label: 'Awaiting approval' },
  { value: 'decided', label: 'Decided' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function BookingsPage() {
  const user = useSessionUser();
  const isAdmin = user.role === 'admin';
  const { referenceData, roomName } = useReferenceData();
  const periods = calendarPeriods(referenceData.calendar.periods);

  const [scopeChoice, setScopeChoice] = useState<'mine' | 'all'>('mine');
  const [stateFilter, setStateFilter] = useState<RequestState | 'all'>('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const scope = isAdmin ? scopeChoice : 'mine';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['bookings', 'list', scope, stateFilter],
    queryFn: () =>
      listBookings({ scope, state: stateFilter === 'all' ? undefined : stateFilter }),
    staleTime: 10_000,
  });

  // Newest first for the user's own list; the admin's full list keeps submission (priority tie) order.
  const items = useMemo(() => {
    const list = data ?? [];
    const filtered = scope === 'all' && liveOnly ? list.filter((v) => v.request.source !== 'dataset') : list;
    return scope === 'mine' ? [...filtered].reverse() : filtered;
  }, [data, scope, liveOnly]);

  const openCount = useMemo(
    () =>
      (data ?? []).filter(
        (v) => v.request.source !== 'dataset' && OPEN_STATES.includes(v.request.state),
      ).length,
    [data],
  );

  return (
    <AppShell pageTitle="My Booking Requests" breadcrumbs={[{ label: 'Bookings' }]}>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {scope === 'all' ? 'All booking requests' : 'My booking requests'}
            </h1>
            <p className="text-xs font-mono text-[#98A6BB] mt-0.5">
              Each request shows where it is, what the engine decided and why.
              {scope === 'mine' && stateFilter === 'all' && data
                ? ` ${openCount} of ${OPEN_REQUEST_LIMIT} open requests used.`
                : ''}
            </p>
          </div>
          <Link
            href="/bookings/new"
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center justify-center gap-1.5 shrink-0"
          >
            <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Request a venue</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin ? (
            <div
              role="group"
              aria-label="Which requests"
              className="flex items-center p-1 rounded-xl bg-[#0B1220] border border-white/10"
            >
              {(['mine', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scopeChoice === value}
                  onClick={() => setScopeChoice(value)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                    scopeChoice === value
                      ? 'bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12]'
                      : 'text-[#98A6BB] hover:text-white'
                  }`}
                >
                  {value === 'mine' ? 'My requests' : 'All requests'}
                </button>
              ))}
            </div>
          ) : null}

          <label htmlFor="state-filter" className="sr-only">
            Filter by state
          </label>
          <select
            id="state-filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as RequestState | 'all')}
            className="bg-[#101A2B] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
          >
            {STATE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {scope === 'all' ? (
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[#cbd5e1] cursor-pointer">
              <input
                type="checkbox"
                checked={liveOnly}
                onChange={(e) => setLiveOnly(e.target.checked)}
                className="accent-[#66E3F0]"
              />
              Live requests only (hide dataset BR-)
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono text-[#cbd5e1] bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <PageSkeleton kpis={false} />
        ) : isError ? (
          <ErrorState
            title="Couldn't load booking requests"
            message={errorText(error, 'Please try again in a moment.')}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={stateFilter === 'all' ? 'No booking requests yet' : 'No requests in this state'}
            description={
              stateFilter === 'all'
                ? 'Describe what you need in plain English or Hinglish, or fill the form. The engine decides at once.'
                : 'Try another filter, or make a new request.'
            }
            cta={{ label: 'Request a venue', href: '/bookings/new', icon: Ticket }}
          />
        ) : (
          <div className="space-y-4">
            {items.map((view) => (
              <BookingCard
                key={view.request.id}
                view={view}
                user={user}
                periods={periods}
                roomName={roomName}
                showRequester={scope === 'all'}
              />
            ))}
          </div>
        )}

        <Link
          href="/spectra"
          className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B1220] border border-white/10 hover:border-[#8279FF]/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-mono text-[#cbd5e1]">
            <Sparkles className="w-4 h-4 text-[#8279FF] shrink-0" aria-hidden="true" />
            Every Week 7 decision, dataset and live, is on the Spectra board.
          </span>
          <ArrowRight className="w-4 h-4 text-[#8279FF] shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </AppShell>
  );
}
