'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eraser, FileText, Loader2, Send, Sparkles } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { PageSkeleton } from '@/components/states/page-skeleton';
import { useReferenceData } from '@/hooks/use-reference-data';
import { createBooking, parseBooking } from '@/lib/api-client';
import {
  Day,
  RoomType,
  type CreateBookingResult,
  type ParseBookingResult,
  type ReferenceData,
  type SessionUser,
} from '@/lib/contracts';
import { BookingDraftForm } from '@/components/bookings/booking-draft-form';
import { BookingResult } from '@/components/bookings/booking-result';
import { ParseResultPanel } from '@/components/bookings/parse-result-panel';
import { VenueAudit } from '@/components/bookings/venue-audit';
import { BOOKING_QUERY_KEYS } from '@/components/bookings/cancel-booking-button';
import {
  allowedGroups,
  calendarDays,
  calendarPeriods,
  checkDraft,
  decisionSlot,
  draftFromParse,
  emptyDraft,
  errorText,
  problemsToErrors,
  roleLabel,
  validationDetails,
  type DraftField,
  type DraftFormState,
  type FieldErrors,
} from '@/components/bookings/booking-utils';

const MAX_TEXT = 2000;

const SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'Hinglish',
    text: 'Dramatics rehearsal, seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye',
  },
  {
    label: 'Claims institute level',
    text: 'Quiz prelims Thursday 6 to 8 pm, 140 people, SH-1, projector and mic. This is an official Spectra event so mark it institute level.',
  },
  {
    label: 'Clash with Pro-Night',
    text: 'Friday raat 6 se 10 baje OAT chahiye, 700 log, stage aur mic, band night',
  },
  {
    label: 'Wrong room name',
    text: 'Open mic night in LHC-5 on Wednesday 7 to 9 pm for 90 people, need a mic',
  },
];

function prefillFrom(searchParams: ReturnType<typeof useSearchParams>, reference: ReferenceData): DraftFormState {
  const roomId = searchParams.get('room');
  const room = roomId ? reference.rooms.find((r) => r.id === roomId) ?? null : null;
  const day = Day.safeParse(searchParams.get('day'));
  const periodText = searchParams.get('period')?.replace(/^P/i, '');
  const period = periodText ? Number(periodText) : NaN;
  return emptyDraft({
    room,
    day: day.success ? day.data : null,
    period: Number.isInteger(period) && period >= 1 && period <= 13 ? period : null,
  });
}

function BookingWorkspace({
  user,
  reference,
  roomName,
}: {
  user: SessionUser;
  reference: ReferenceData;
  roomName: (id: string) => string;
}) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const periods = calendarPeriods(reference.calendar.periods);
  const days = calendarDays(reference.calendar.days);
  const allowedGroupIds = useMemo(
    () => new Set(allowedGroups(reference.student_groups, user).map((g) => g.id)),
    [reference.student_groups, user],
  );

  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<ParseBookingResult | null>(null);
  const [editedSinceParse, setEditedSinceParse] = useState(false);
  const [form, setForm] = useState<DraftFormState>(() => prefillFrom(searchParams, reference));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitResult, setSubmitResult] = useState<CreateBookingResult | null>(null);

  const parseMutation = useMutation({
    mutationFn: (input: string) => parseBooking(input),
    onSuccess: (result) => {
      setParseResult(result);
      setForm(draftFromParse(result.draft));
      setErrors(problemsToErrors(result.problems));
      setEditedSinceParse(false);
      if (result.draft.missing.length > 0 || result.problems.length > 0) {
        toast.message('Draft ready: fill the highlighted gaps, then submit.');
      } else {
        toast.success('Draft ready: check it, then submit.');
      }
    },
    onError: (error) => {
      toast.error(
        `${errorText(error, "Couldn't read that request.")} You can still fill the form by hand below.`,
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: (body: Parameters<typeof createBooking>[0]) => createBooking(body),
    onSuccess: (result) => {
      setSubmitResult(result);
      for (const queryKey of BOOKING_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
      const first = result.bookings[0];
      const decision = first?.decision;
      const where = decision?.room_id
        ? ` ${decision.room_id}, ${decisionSlot(decision, periods) ?? ''}`
        : '';
      if (first?.request.state === 'pending_approval') {
        toast.success(`Submitted: held${where}, awaiting approval.`);
      } else if (decision?.status === 'approved') {
        toast.success(`Approved:${where}.`);
      } else if (decision?.status === 'alternative_offered') {
        toast.warning(`Submitted: an alternative was offered (${where.trim()}).`);
      } else if (decision?.status === 'rejected') {
        toast.warning('Submitted, but the engine could not give it a room. See why below.');
      } else {
        toast.success('Submitted. It will be decided once a timetable is active.');
      }
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error) => {
      const validation = validationDetails(error);
      if (validation) {
        setErrors(validation.fieldErrors);
        const suggestion = validation.roomSuggestion;
        if (suggestion) {
          toast.error(errorText(error, 'The booking request is invalid.'), {
            action: {
              label: `Use ${suggestion}`,
              onClick: () => pickRoom(suggestion),
            },
          });
          return;
        }
        const firstMessage = Object.values(validation.fieldErrors).flat()[0];
        toast.error(firstMessage ?? errorText(error, 'The booking request is invalid.'));
        return;
      }
      toast.error(errorText(error, "Couldn't submit the request."));
    },
  });

  const handleChange = (next: DraftFormState, field: DraftField) => {
    setForm(next);
    if (parseResult) setEditedSinceParse(true);
    setErrors((prev) => {
      // Fields that change together clear together (a picked room can add its room type).
      const linked: string[] =
        field === 'windows' || field === 'duration_periods'
          ? ['windows', 'duration_periods']
          : field === 'requested_room'
            ? ['requested_room', 'room_types']
            : [field];
      if (!linked.some((f) => prev[f])) return prev;
      const copy = { ...prev };
      for (const f of linked) delete copy[f];
      return copy;
    });
  };

  // Picks a room from the venue check, a parser suggestion or a toast action.
  function pickRoom(roomId: string) {
    setForm((prev) => {
      const room = reference.rooms.find((r) => r.id === roomId);
      const type = RoomType.safeParse(room?.type);
      const roomTypes =
        type.success && !prev.room_types.includes(type.data) ? [...prev.room_types, type.data] : prev.room_types;
      return { ...prev, requested_room: roomId, room_types: roomTypes };
    });
    if (parseResult) setEditedSinceParse(true);
    setErrors((prev) => {
      if (!prev.requested_room && !prev.room_types) return prev;
      const copy = { ...prev };
      delete copy.requested_room;
      delete copy.room_types;
      return copy;
    });
  }

  const runParse = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error('Describe your request first, or fill the form below.');
      return;
    }
    parseMutation.mutate(trimmed.slice(0, MAX_TEXT));
  };

  const clearForm = () => {
    setParseResult(null);
    setEditedSinceParse(false);
    setForm(emptyDraft());
    setErrors({});
  };

  const submit = () => {
    const check = checkDraft(form);
    if (!check.ok) {
      setErrors(check.errors);
      toast.error('Some fields need attention before submitting.');
      return;
    }
    submitMutation.mutate({
      ...check.draft,
      source: parseResult ? 'nl' : 'form',
      ai_log_id: parseResult?.log_id ?? null,
    });
  };

  const startNewRequest = () => {
    setSubmitResult(null);
    setText('');
    clearForm();
  };

  const attendance = Number(form.attendance);

  if (submitResult) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <BookingResult
          result={submitResult}
          user={user}
          periods={periods}
          roomName={roomName}
          onNewRequest={startNewRequest}
        />
      </div>
    );
  }

  const busy = parseMutation.isPending || submitMutation.isPending;
  const errorCount = Object.values(errors).filter((m) => m && m.length > 0).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="p-5 rounded-3xl bg-[#0B1220] border border-white/10">
        <h1 className="text-xl sm:text-2xl font-black text-white">Request a venue</h1>
        <p className="text-xs font-mono text-[#98A6BB] mt-1">
          Booking as {user.club ?? user.name} ({roleLabel(user.role)}). Describe it in English or Hinglish and
          check the draft, or fill the form directly. The scheduling engine decides every request by priority.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4 min-w-0">
          {/* Plain-language path */}
          <section
            aria-labelledby="describe-heading"
            className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="describe-heading" className="text-xs font-mono text-[#66E3F0] font-bold uppercase">
                1 · Describe it (optional)
              </h2>
              <span className="text-[10px] font-mono text-[#98A6BB]">
                {text.length}/{MAX_TEXT}
              </span>
            </div>
            <label htmlFor="booking-text" className="sr-only">
              Describe your booking request
            </label>
            <textarea
              id="booking-text"
              rows={3}
              value={text}
              maxLength={MAX_TEXT}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  runParse(text);
                }
              }}
              placeholder='e.g. "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"'
              className="w-full bg-[#101A2B] border border-white/10 focus:border-[#66E3F0] rounded-2xl p-3.5 text-xs font-mono text-white outline-none resize-y disabled:opacity-60"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-mono text-[#98A6BB]">Try:</span>
                {SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setText(s.text);
                      runParse(s.text);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-[#66E3F0]/20 text-[#66E3F0] border border-white/10 transition-colors disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => runParse(text)}
                disabled={busy || !text.trim()}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#66E3F0] text-[#070A12] shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{parseMutation.isPending ? 'Reading…' : 'Turn into a draft'}</span>
              </button>
            </div>
            <p className="text-[10px] font-mono text-[#98A6BB]">
              Works without AI: when AI is off or fails, the offline rule parser reads it instead. Nothing is booked
              until you submit.
            </p>
          </section>

          {parseResult ? (
            <ParseResultPanel
              result={parseResult}
              stale={editedSinceParse}
              user={user}
              periods={periods}
              roomName={roomName}
              currentRoom={form.requested_room}
              onUseRoom={pickRoom}
            />
          ) : null}

          {/* The draft: filled by the parser or by hand */}
          <section
            aria-labelledby="draft-heading"
            className="p-5 rounded-3xl bg-[#0B1220] border border-white/10 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/5">
              <h2 id="draft-heading" className="text-xs font-mono text-white font-bold uppercase">
                2 · Check and edit the booking
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${
                    parseResult
                      ? 'bg-[#66E3F0]/10 text-[#66E3F0] border-[#66E3F0]/30'
                      : 'bg-white/5 text-[#98A6BB] border-white/10'
                  }`}
                >
                  {parseResult ? (
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <FileText className="w-3 h-3" aria-hidden="true" />
                  )}
                  {parseResult ? 'From your text' : 'Manual form'}
                </span>
                <button
                  type="button"
                  onClick={clearForm}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[#cbd5e1] hover:bg-white/10 disabled:opacity-50"
                >
                  <Eraser className="w-3 h-3" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <BookingDraftForm
              value={form}
              onChange={handleChange}
              errors={errors}
              rooms={reference.rooms}
              groups={reference.student_groups}
              allowedGroupIds={allowedGroupIds}
              user={user}
              days={days}
              periods={periods}
              disabled={busy}
            />

            {errors.form ? (
              <ul className="space-y-0.5" role="alert">
                {errors.form.map((m) => (
                  <li key={m} className="text-[11px] font-mono text-rose-300">
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full py-3 rounded-2xl text-xs font-mono font-bold bg-gradient-to-r from-[#66E3F0] to-[#8279FF] text-[#070A12] shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{submitMutation.isPending ? 'Submitting and deciding…' : 'Submit request'}</span>
            </button>
            {errorCount > 0 ? (
              <p className="text-[11px] font-mono text-rose-300 text-center">
                {errorCount} field{errorCount === 1 ? '' : 's'} need{errorCount === 1 ? 's' : ''} attention.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="lg:col-span-5 space-y-4 min-w-0 lg:sticky lg:top-4">
          <VenueAudit
            firstWindow={form.windows[0]}
            attendance={Number.isInteger(attendance) && attendance > 0 ? attendance : null}
            roomTypes={form.room_types}
            needs={form.needs}
            requestedRoom={form.requested_room}
            rooms={reference.rooms}
            periods={periods}
            durationPeriods={form.duration_periods}
            onUseRoom={pickRoom}
          />
        </aside>
      </div>
    </div>
  );
}

function NewBookingContent() {
  const user = useSessionUser();
  const { referenceData, roomName, isLoading } = useReferenceData();
  if (isLoading) return <PageSkeleton kpis={false} />;
  return <BookingWorkspace user={user} reference={referenceData} roomName={roomName} />;
}

export default function NewBookingPage() {
  return (
    <AppShell
      pageTitle="New Venue Booking"
      breadcrumbs={[{ label: 'Bookings', href: '/bookings' }, { label: 'New Request' }]}
    >
      <Suspense fallback={<PageSkeleton kpis={false} />}>
        <NewBookingContent />
      </Suspense>
    </AppShell>
  );
}
