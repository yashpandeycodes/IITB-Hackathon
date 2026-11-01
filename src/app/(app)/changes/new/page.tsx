'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, ShieldOff } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { useReferenceData } from '@/hooks/use-reference-data';
import { EmptyState } from '@/components/states/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { isStaff } from '@/components/changes/change-scope';
import { UnavailabilityForm } from '@/components/changes/unavailability-form';
import { MoveSessionForm } from '@/components/changes/move-session-form';
import { AddSessionForm } from '@/components/changes/add-session-form';
import { RoomClosureForm } from '@/components/changes/room-closure-form';
import { RemoveSessionForm } from '@/components/changes/remove-session-form';
import { ChangeFileForm } from '@/components/changes/change-file-form';
import type { SessionUser } from '@/lib/contracts';

type TabId = 'unavailability' | 'move' | 'add' | 'room' | 'remove' | 'file';

function tabsFor(user: SessionUser): Array<{ id: TabId; label: string }> {
  if (user.role === 'faculty') {
    return [
      { id: 'unavailability', label: 'Mark unavailability' },
      { id: 'move', label: 'Move my session' },
      { id: 'add', label: 'Extra session' },
    ];
  }
  if (!isStaff(user)) return [];
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'unavailability', label: 'Faculty unavailability' },
    { id: 'move', label: 'Manual placement' },
    { id: 'add', label: 'Add session' },
    { id: 'room', label: 'Room closure' },
    { id: 'remove', label: 'Remove session' },
  ];
  if (user.role === 'admin') tabs.push({ id: 'file', label: 'Upload change file' });
  return tabs;
}

const BREADCRUMBS = [{ label: 'Changes', href: '/changes' }, { label: 'New change' }];

function FormSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4 max-w-4xl mx-auto">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-28 rounded-3xl bg-white/5" />
      <Skeleton className="h-80 rounded-3xl bg-white/5" />
    </div>
  );
}

function NewChangeContent() {
  const user = useSessionUser();
  const params = useSearchParams();
  const { referenceData, isLoading } = useReferenceData();
  const tabs = tabsFor(user);
  const requested = params.get('tab');
  const [tabChoice, setTabChoice] = useState<TabId | null>(null);
  const active: TabId | null =
    tabs.find((t) => t.id === (tabChoice ?? requested))?.id ?? tabs[0]?.id ?? null;

  if (tabs.length === 0 || !active) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Clubs don't file timetable changes"
        description="Faculty, department coordinators and admins request timetable changes. To book a venue for an event, use Bookings."
        cta={{ label: 'Go to Bookings', href: '/bookings' }}
      />
    );
  }
  if (isLoading) return <FormSkeleton />;
  if (referenceData.sessions.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No dataset loaded yet"
        description={
          user.role === 'admin'
            ? 'Load or reset the dataset and generate a timetable first; changes are proposed against the active timetable.'
            : 'An admin has to load the dataset and generate a timetable before changes can be proposed.'
        }
        cta={user.role === 'admin' ? { label: 'Open the Admin console', href: '/admin' } : undefined}
      />
    );
  }

  const faculty = params.get('faculty');
  const session = params.get('session');
  const room = params.get('room');
  const day = params.get('day');
  const course = params.get('course');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-black text-white">New change request</h1>
        <p className="text-xs font-mono text-[#98A6BB] mt-1">
          Preview shows exactly which sessions move (the fewest possible, with zero hard violations) or which
          constraints conflict. Submitting files it for an admin&apos;s approval.
        </p>
        <div
          role="tablist"
          aria-label="Kind of change"
          className="flex gap-2 mt-4 pt-3 border-t border-white/10 overflow-x-auto pb-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => setTabChoice(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                active === t.id
                  ? t.id === 'file'
                    ? 'bg-[#8279FF] text-white'
                    : 'bg-[#66E3F0] text-[#070A12]'
                  : 'bg-[#101A2B] text-[#98A6BB] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        className={`p-4 sm:p-6 rounded-3xl bg-[#0B1220] border ${
          active === 'file' ? 'border-[#8279FF]/40' : 'border-white/10'
        }`}
      >
        {active === 'unavailability' ? (
          <UnavailabilityForm user={user} initialFaculty={faculty} initialDay={day} />
        ) : active === 'move' ? (
          <MoveSessionForm user={user} initialSession={session} />
        ) : active === 'add' ? (
          <AddSessionForm user={user} initialCourse={course} />
        ) : active === 'room' ? (
          <RoomClosureForm user={user} initialRoom={room} initialDay={day} />
        ) : active === 'remove' ? (
          <RemoveSessionForm user={user} initialSession={session} />
        ) : (
          <ChangeFileForm />
        )}
      </div>
    </div>
  );
}

export default function NewChangeRequestPage() {
  return (
    <AppShell pageTitle="New change request" breadcrumbs={BREADCRUMBS}>
      <Suspense fallback={<FormSkeleton />}>
        <NewChangeContent />
      </Suspense>
    </AppShell>
  );
}
