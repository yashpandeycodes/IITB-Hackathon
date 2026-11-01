'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, RefreshCw, RotateCcw, Send, ShieldCheck, Ticket, User as UserIcon } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useSessionUser } from '@/components/providers/session-provider';
import { useReferenceData } from '@/hooks/use-reference-data';
import { EmptyState } from '@/components/states/empty-state';
import { AssistantReplyView, sessionRefLabel } from '@/components/assistant/assistant-reply';
import { askAssistant, isApiClientError } from '@/lib/api-client';
import type { AssistantReply, AssistantRequest, SessionRef } from '@/lib/contracts/assistant';

const MAX_MESSAGE = 1000;

type Turn =
  | { id: string; from: 'user'; text: string }
  | { id: string; from: 'assistant'; reply: AssistantReply; message: string }
  | { id: string; from: 'error'; text: string; retry: AssistantRequest | null };

/** A friendly line for a failed assistant turn, and whether retrying can help. */
function describeError(error: unknown): { text: string; canRetry: boolean } {
  if (isApiClientError(error)) {
    if (error.status === 403) {
      return {
        text: 'The assistant is for faculty, department coordinators and admins. To request a room, use the booking form.',
        canRetry: false,
      };
    }
    if (error.status === 429) {
      return {
        text: `${error.message || 'Too many messages to the assistant.'} (30 messages per 10 minutes.)`,
        canRetry: true,
      };
    }
    if (error.code === 'NETWORK_ERROR') {
      return { text: "Couldn't reach the server. Check your connection and retry.", canRetry: true };
    }
    if (error.status === 400) return { text: error.message, canRetry: false };
    return { text: error.message || 'The assistant could not answer.', canRetry: true };
  }
  return { text: error instanceof Error ? error.message : 'The assistant could not answer.', canRetry: true };
}

export default function AssistantPage() {
  const user = useSessionUser();
  const { referenceData } = useReferenceData();
  const idRef = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  const ask = useMutation({
    mutationFn: (req: AssistantRequest) => askAssistant(req),
  });

  const nextId = () => `t-${++idRef.current}`;

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns.length, ask.isPending]);

  const run = (req: AssistantRequest) => {
    ask.mutate(req, {
      onSuccess: (reply) => {
        setTurns((prev) => [...prev, { id: nextId(), from: 'assistant', reply, message: req.message }]);
      },
      onError: (error) => {
        const { text, canRetry } = describeError(error);
        setTurns((prev) => [...prev, { id: nextId(), from: 'error', text, retry: canRetry ? req : null }]);
        toast.error(text);
      },
    });
  };

  const send = (req: AssistantRequest, shownText: string) => {
    if (ask.isPending) return;
    const message = req.message.trim();
    if (!message) return;
    if (message.length > MAX_MESSAGE) {
      toast.error(`Keep the message under ${MAX_MESSAGE} characters.`);
      return;
    }
    setTurns((prev) => [...prev, { id: nextId(), from: 'user', text: shownText }]);
    run({ ...req, message });
  };

  const sendText = (text: string) => {
    if (!text.trim() || ask.isPending) return;
    send({ message: text }, text.trim());
    setInput('');
  };

  const pickCandidate = (message: string, candidate: SessionRef) => {
    send({ message, session_id: candidate.session_id }, `That one: ${sessionRefLabel(candidate)}`);
  };

  const retry = (turnId: string, req: AssistantRequest) => {
    if (ask.isPending) return;
    setTurns((prev) => prev.filter((t) => t.id !== turnId));
    run(req);
  };

  // Example prompts that fit this user's scope (their own course, their department's faculty).
  const examples = useMemo(() => {
    const { sessions, courses, faculty } = referenceData;
    const lecture = (pred: (s: (typeof sessions)[number]) => boolean) =>
      sessions.find((s) => pred(s) && s.kind === 'lecture') ?? sessions.find(pred);

    if (user.role === 'faculty') {
      const mine = user.faculty_id ? lecture((s) => s.faculty_id === user.faculty_id) : undefined;
      const course = mine?.course_id ?? 'CS202';
      return [
        `Move my ${course} lecture to Thursday morning`,
        "I'm unavailable on Monday",
        'mujhe Wednesday ko chutti chahiye',
        `Why is my ${course} lecture scheduled there?`,
        `I need an extra ${course} tutorial`,
      ];
    }

    const deptCourses =
      user.role === 'department_coordinator' && user.department
        ? new Set(courses.filter((c) => c.department === user.department).map((c) => c.id))
        : null;
    const inScope = (courseId: string) => !deptCourses || deptCourses.has(courseId);
    const session =
      (inScope('CS202') ? sessions.find((s) => s.course_id === 'CS202' && s.kind === 'lecture') : undefined) ??
      lecture((s) => inScope(s.course_id));
    const course = session?.course_id ?? 'CS202';
    const teacher =
      faculty.find((f) => f.id !== session?.faculty_id && (!deptCourses || f.department === user.department)) ??
      faculty[0];
    const fid = teacher?.id ?? 'F07';
    return [
      `Move the ${course} lecture to Thursday morning`,
      `${fid} is unavailable on Monday`,
      `${fid} Wednesday ko nahi aayenge`,
      `Why is ${session?.id ?? `${course}-L1`} where it is?`,
      `Add an extra ${course} tutorial`,
    ];
  }, [referenceData, user.role, user.faculty_id, user.department]);

  if (user.role === 'club') {
    return (
      <AppShell pageTitle="AI Scheduling Assistant" breadcrumbs={[{ label: 'AI Assistant' }]}>
        <div className="max-w-2xl mx-auto">
          <EmptyState
            icon={Bot}
            title="The assistant is for teaching staff"
            description="Faculty, department coordinators and admins use it to move classes and report unavailability. Club representatives can request a venue from the booking form, which also understands plain English and Hinglish."
            cta={{ label: 'Request a room', href: '/bookings', icon: Ticket }}
          />
        </div>
      </AppShell>
    );
  }

  // The full name: a first word alone reads badly for titles and offices ("Dr.", "Dean's").
  const greetingName = user.name.trim().replace(/\.$/, '');

  return (
    <AppShell pageTitle="AI Scheduling Assistant" breadcrumbs={[{ label: 'AI Assistant' }]}>
      <div className="max-w-4xl mx-auto flex flex-col gap-3 h-[calc(100dvh-10.5rem)] lg:h-[calc(100dvh-7rem)] min-h-[460px]">
        {/* Quick prompts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          <span className="text-[11px] font-mono text-[#98A6BB] shrink-0">Try:</span>
          {examples.map((text) => (
            <button
              key={text}
              type="button"
              disabled={ask.isPending}
              onClick={() => sendText(text)}
              className="px-3 py-1 rounded-xl text-xs font-mono bg-[#0B1220] hover:bg-[#132035] text-[#cbd5e1] hover:text-[#66E3F0] border border-white/10 transition-colors shrink-0 disabled:opacity-40"
            >
              {text}
            </button>
          ))}
          {turns.length > 0 && (
            <button
              type="button"
              disabled={ask.isPending}
              onClick={() => setTurns([])}
              className="ml-auto px-2.5 py-1 rounded-xl text-[11px] font-mono text-[#98A6BB] hover:text-white hover:bg-white/5 shrink-0 inline-flex items-center gap-1 disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Chat thread */}
        <div
          ref={threadRef}
          className="flex-1 min-h-0 overflow-y-auto space-y-4 p-3 sm:p-5 rounded-3xl bg-[#0B1220] border border-white/10 shadow-sm"
          aria-live="polite"
        >
          {/* Welcome */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#66E3F0] to-[#8279FF] flex items-center justify-center text-[#070A12] shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0 max-w-2xl p-3 sm:p-4 rounded-2xl text-xs leading-relaxed bg-[#101A2B] text-[#cbd5e1] border border-white/10">
              <p>
                Hi {greetingName}. Tell me what you need in English or Hinglish: move a session, mark when{' '}
                {user.role === 'faculty' ? "you're" : 'a faculty member is'} unavailable, add an extra session, or ask why
                a class is where it is.
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[#98A6BB]">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                Every option is checked by the constraint engine, and nothing changes until an admin approves it.
              </p>
            </div>
          </div>

          {turns.map((turn) => {
            if (turn.from === 'user') {
              return (
                <div key={turn.id} className="flex items-start justify-end gap-3">
                  <div className="min-w-0 max-w-xl p-3 sm:p-4 rounded-2xl text-xs leading-relaxed bg-[#8279FF] text-white font-medium ml-6 sm:ml-12 whitespace-pre-line break-words">
                    {turn.text}
                  </div>
                  <div className="hidden sm:flex w-8 h-8 rounded-xl bg-white/10 items-center justify-center text-white shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                </div>
              );
            }
            if (turn.from === 'error') {
              return (
                <div key={turn.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-300 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div
                    role="alert"
                    className="min-w-0 max-w-2xl p-3 sm:p-4 rounded-2xl text-xs leading-relaxed bg-rose-950/30 text-rose-200 border border-rose-500/30 space-y-2"
                  >
                    <p>{turn.text}</p>
                    {turn.retry && (
                      <button
                        type="button"
                        disabled={ask.isPending}
                        onClick={() => turn.retry && retry(turn.id, turn.retry)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-rose-500/20 text-rose-100 border border-rose-500/30 hover:bg-rose-500/30 disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={turn.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#66E3F0] to-[#8279FF] flex items-center justify-center text-[#070A12] shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 sm:flex-none sm:max-w-2xl p-3 sm:p-4 rounded-2xl text-xs leading-relaxed bg-[#101A2B] text-[#cbd5e1] border border-white/10">
                  <AssistantReplyView
                    reply={turn.reply}
                    busy={ask.isPending}
                    onPickCandidate={(c) => pickCandidate(turn.message, c)}
                  />
                </div>
              </div>
            );
          })}

          {ask.isPending && (
            <div className="flex items-start gap-3" role="status">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#66E3F0] to-[#8279FF] flex items-center justify-center text-[#070A12] shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 sm:p-4 rounded-2xl text-xs font-mono bg-[#101A2B] text-[#98A6BB] border border-white/10 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#66E3F0]" />
                Checking with the constraint engine…
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendText(input);
          }}
          className="p-2 rounded-2xl bg-[#0B1220] border border-white/10 flex items-center gap-2"
        >
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <input
            id="assistant-input"
            type="text"
            value={input}
            maxLength={MAX_MESSAGE}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Move my Friday lecture to Thursday morning"
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-white/30"
          />
          {input.length > MAX_MESSAGE - 100 && (
            <span className="text-[10px] font-mono text-[#98A6BB] shrink-0">
              {input.length}/{MAX_MESSAGE}
            </span>
          )}
          <button
            type="submit"
            aria-label="Send"
            disabled={ask.isPending || !input.trim()}
            className="px-4 py-2 rounded-xl bg-[#66E3F0] text-[#070A12] text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-40"
          >
            <span className="hidden sm:inline">{ask.isPending ? 'Sending…' : 'Send'}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </AppShell>
  );
}
