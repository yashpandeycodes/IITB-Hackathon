"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Ban,
  Bot,
  ChevronDown,
  Cpu,
  HelpCircle,
  Info,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { proposeChange } from "@/lib/api-client";
import type {
  AssistantOption,
  AssistantReply,
  SessionRef,
} from "@/lib/contracts/assistant";
import type { ChangeRequest } from "@/lib/contracts/change";
import { formatPeriodShort } from "@/lib/format";

import {
  ConflictList,
  MoveDiffList,
  Pill,
  SessionFactsView,
  TextSourcePill,
  VerifiedPill,
  errorMessage,
  signed,
} from "./facts";

const KIND_LABEL: Record<SessionRef["kind"], string> = {
  lecture: "Lecture",
  tutorial: "Tutorial",
  lab: "Lab",
};

/** "CS202-L2 · Lecture · FRI P4 · 11 AM · CR-103". */
export function sessionRefLabel(ref: SessionRef): string {
  const where =
    ref.day && ref.start_period
      ? `${ref.day} ${formatPeriodShort(ref.start_period)}${ref.room_id ? ` · ${ref.room_id}` : ""}`
      : "not placed";
  return `${ref.session_id} · ${KIND_LABEL[ref.kind]} · ${where}`;
}

function OptionCard({
  option,
  submitted,
  submitting,
  disabled,
  onSubmit,
}: {
  option: AssistantOption;
  submitted: ChangeRequest | null;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const softTone =
    option.soft_delta < 0
      ? "green"
      : option.soft_delta > 0
        ? "amber"
        : "neutral";
  return (
    <div className="space-y-2.5 rounded-xl border border-[#66E3F0]/40 bg-[#070A12] p-3.5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-mono text-xs font-bold text-[#66E3F0]">
          {option.label}
        </span>
        <Pill tone="neutral">{option.option_id}</Pill>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Pill
          tone="green"
          title="Every option is a full repair with zero hard violations"
        >
          Hard 0
        </Pill>
        <Pill
          tone={softTone}
          title="Change in the timetable's total soft penalty; negative is better"
        >
          Soft {signed(option.soft_delta)}
        </Pill>
        <Pill tone="cyan">
          {option.moved_count} session{option.moved_count === 1 ? "" : "s"}{" "}
          moved
        </Pill>
        {option.time_changed > 0 ? (
          <Pill>{option.time_changed} time change</Pill>
        ) : null}
        {option.room_only_changed > 0 ? (
          <Pill>{option.room_only_changed} room only</Pill>
        ) : null}
      </div>

      {option.diff.length > 0 ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[11px] text-[#98A6BB] hover:text-white">
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            What moves ({option.diff.length})
          </summary>
          <div className="mt-2">
            <MoveDiffList diff={option.diff} />
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {submitted ? (
          <Link
            href={`/approvals/${encodeURIComponent(submitted.id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#8279FF]/40 bg-[#8279FF]/20 px-3 py-1.5 font-mono text-xs font-bold text-[#b4aefe] hover:bg-[#8279FF]/30"
          >
            {submitted.id} ·{" "}
            {submitted.status === "pending"
              ? "waiting for approval"
              : submitted.status}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#66E3F0] px-3 py-1.5 font-mono text-xs font-bold text-[#070A12] shadow-sm hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One assistant reply: its text, engine-verified options (submit one with `POST /api/changes`),
 * candidates to pick from, conflicts, assumptions and the facts of an explanation.
 */
export function AssistantReplyView({
  reply,
  onPickCandidate,
  busy,
}: {
  reply: AssistantReply;
  /** Re-ask the same message with the picked session. */
  onPickCandidate: (candidate: SessionRef) => void;
  /** True while another turn is in flight. */
  busy: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState<{
    optionId: string;
    change: ChangeRequest;
  } | null>(null);

  const submit = useMutation({
    mutationFn: (option: AssistantOption) => proposeChange(option.proposal),
    onSuccess: (change, option) => {
      setSubmitted({ optionId: option.option_id, change });
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const open = {
        label: "Open",
        onClick: () =>
          router.push(`/approvals/${encodeURIComponent(change.id)}`),
      };
      if (change.status === "pending") {
        toast.success(
          `Sent for approval as ${change.id}. Nothing changes until an admin approves it.`,
          { action: open },
        );
      } else {
        toast.warning(
          `${change.id} was filed as ${change.status}: the timetable changed since this option was computed.`,
          { action: open },
        );
      }
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't submit this option.")),
  });

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line">{reply.text}</p>

      <div className="flex flex-wrap gap-1.5">
        {reply.intent_source === "llm" ? (
          <Pill tone="violet" title="The AI read your message (intent only)">
            <Bot className="h-3 w-3" aria-hidden="true" />
            Understood by AI
          </Pill>
        ) : (
          <Pill title="The offline rule parser read your message">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            Rule parser
          </Pill>
        )}
        <TextSourcePill source={reply.text_source} />
        {reply.verified ? <VerifiedPill /> : null}
      </div>

      {reply.assumptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {reply.assumptions.map((a, i) => (
            <Pill key={i} tone="amber">
              <Info className="h-3 w-3" aria-hidden="true" />
              {a}
            </Pill>
          ))}
        </div>
      ) : null}

      {reply.follow_up ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#8279FF]/30 bg-[#8279FF]/10 p-2.5 text-[#d4d1ff]">
          <HelpCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{reply.follow_up}</span>
        </div>
      ) : null}

      {reply.candidates.length > 0 ? (
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] font-bold tracking-wider text-[#98A6BB] uppercase">
            Which session?
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {reply.candidates.map((c) => (
              <button
                key={c.session_id}
                type="button"
                disabled={busy}
                onClick={() => onPickCandidate(c)}
                className="rounded-lg border border-white/10 bg-[#070A12] px-3 py-1.5 text-left font-mono text-[11px] text-[#cbd5e1] transition-colors hover:border-[#66E3F0]/50 hover:text-[#66E3F0] disabled:opacity-40"
              >
                {sessionRefLabel(c)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reply.options.length > 0 ? (
        <div className="space-y-2.5">
          {reply.options.map((option) => (
            <OptionCard
              key={option.option_id}
              option={option}
              submitted={
                submitted?.optionId === option.option_id
                  ? submitted.change
                  : null
              }
              submitting={
                submit.isPending &&
                submit.variables?.option_id === option.option_id
              }
              disabled={submit.isPending || submitted !== null}
              onSubmit={() => submit.mutate(option)}
            />
          ))}
          {submitted ? (
            <p className="font-mono text-[10px] text-[#98A6BB]">
              One option per request: {submitted.change.id} is filed. To pick
              another, withdraw it from its page and ask again.
            </p>
          ) : null}
        </div>
      ) : null}

      {reply.conflicts.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-rose-300 uppercase">
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            Unavailable because…
          </div>
          <ConflictList conflicts={reply.conflicts} />
        </div>
      ) : null}

      {reply.facts ? (
        <div className="rounded-xl border border-white/10 bg-[#070A12] p-3">
          <SessionFactsView facts={reply.facts} />
        </div>
      ) : null}
    </div>
  );
}
