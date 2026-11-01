"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Cpu,
  Gauge,
  ListChecks,
  ShieldAlert,
} from "lucide-react";

import { CategoryChip } from "@/components/semantic/badges";
import type {
  CalendarPeriod,
  ParseBookingResult,
  SessionUser,
} from "@/lib/contracts";

import { DecisionBadge } from "./booking-badges";
import {
  DRAFT_FIELD_LABEL,
  FALLBACK_LABEL,
  approvalNeededText,
  categoryLabel,
  decisionSlot,
  roleLabel,
} from "./booking-utils";

/** Who read the text: the AI or the offline rule parser, and why. */
export function ParseSourceNote({ result }: { result: ParseBookingResult }) {
  if (result.source === "llm") {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-[#66E3F0]/30 bg-[#66E3F0]/10 p-3 font-mono text-xs text-[#cbd5e1]">
        <Bot
          className="mt-0.5 h-4 w-4 shrink-0 text-[#66E3F0]"
          aria-hidden="true"
        />
        <span>
          <span className="font-bold text-[#66E3F0]">Read by AI</span>
          {result.model ? ` (${result.model})` : ""}. It only extracts fields;
          the scheduling engine makes every decision.
        </span>
      </div>
    );
  }
  const why = !result.ai_enabled
    ? "AI is switched off"
    : result.fallback_reason
      ? FALLBACK_LABEL[result.fallback_reason]
      : "the AI wasn't used";
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 font-mono text-xs text-[#cbd5e1]">
      <Cpu
        className="mt-0.5 h-4 w-4 shrink-0 text-[#8279FF]"
        aria-hidden="true"
      />
      <span>
        <span className="font-bold text-[#8279FF]">
          Read by the offline rule parser
        </span>{" "}
        because {why}. Check the fields below; the form works the same way.
      </span>
    </div>
  );
}

export type ParseResultPanelProps = {
  result: ParseBookingResult;
  /** The draft was edited after this parse, so the preview may no longer match it. */
  stale: boolean;
  user: SessionUser;
  periods: readonly CalendarPeriod[];
  roomName: (id: string) => string;
  /** The room currently chosen in the form (hides the suggestion once it's applied). */
  currentRoom: string | null;
  onUseRoom: (roomId: string) => void;
};

/** What the parser understood (category, room, conditions, gaps) and the engine's preview. */
export function ParseResultPanel({
  result,
  stale,
  user,
  periods,
  roomName,
  currentRoom,
  onUseRoom,
}: ParseResultPanelProps) {
  const { category, requested_room: room, preview, draft } = result;
  const confidence = Math.round(result.confidence * 100);
  const suggestion = room.suggestion;

  return (
    <div className="space-y-3">
      <ParseSourceNote result={result} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-[#070A12] p-3">
          <div className="font-mono text-[11px] text-[#98A6BB] uppercase">
            Priority category
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {category.claimed && category.claimed !== category.effective ? (
              <>
                <CategoryChip category={category.claimed} />
                <ArrowRight
                  className="h-3 w-3 text-[#98A6BB]"
                  aria-label="becomes"
                />
              </>
            ) : null}
            <CategoryChip
              category={category.effective}
              isCapped={category.capped}
              originalClaim={category.claimed ?? undefined}
            />
          </div>
          {category.capped && category.claimed ? (
            <p className="font-mono text-[11px] leading-relaxed text-amber-300">
              Capped: the text asked for {categoryLabel(category.claimed)}, but
              requests from a {roleLabel(user.role)} rank as{" "}
              {categoryLabel(category.effective)}. Priority comes from your
              role, never from the wording.
            </p>
          ) : (
            <p className="font-mono text-[11px] text-[#98A6BB]">
              Set by your role ({roleLabel(user.role)}).
            </p>
          )}
        </div>

        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-[#070A12] p-3">
          <div className="flex items-center justify-between font-mono text-[11px] text-[#98A6BB] uppercase">
            <span>Confidence</span>
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${
                  confidence >= 75
                    ? "bg-emerald-400"
                    : confidence >= 50
                      ? "bg-amber-400"
                      : "bg-rose-400"
                }`}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-white">
              {confidence}%
            </span>
          </div>
          {draft.missing.length > 0 ? (
            <p className="font-mono text-[11px] text-amber-300">
              Still needed:{" "}
              {draft.missing.map((f) => DRAFT_FIELD_LABEL[f] ?? f).join(", ")}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-emerald-300">
              Every required field was found.
            </p>
          )}
        </div>
      </div>

      {room.text || room.note ? (
        <div
          className={`space-y-1.5 rounded-2xl border p-3 font-mono text-xs ${
            room.note
              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
              : "border-white/10 bg-[#070A12] text-[#cbd5e1]"
          }`}
        >
          <div>
            Room asked for:{" "}
            <span className="font-bold text-white">
              &ldquo;{room.text ?? "—"}&rdquo;
            </span>
            {room.room_id ? (
              <>
                {" "}
                → {room.room_id} ({roomName(room.room_id)})
              </>
            ) : null}
          </div>
          {room.note ? <div className="text-amber-200">{room.note}</div> : null}
          {suggestion && suggestion !== currentRoom ? (
            <button
              type="button"
              onClick={() => onUseRoom(suggestion)}
              className="rounded-lg border border-[#66E3F0]/40 bg-[#66E3F0]/10 px-2.5 py-1 text-[11px] font-bold text-[#66E3F0] hover:bg-[#66E3F0]/20"
            >
              Use {suggestion} ({roomName(suggestion)})
            </button>
          ) : null}
        </div>
      ) : null}

      {result.conditions.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#070A12] p-3 font-mono text-xs text-[#cbd5e1]">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[#98A6BB] uppercase">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Conditions you mentioned
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {result.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-[#98A6BB]">
            Kept as notes: the engine already falls back to another suitable
            room inside your window when the preferred one is taken.
          </p>
        </div>
      ) : null}

      {result.problems.length > 0 ? (
        <div
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-200"
          role="alert"
        >
          <div className="mb-1 flex items-center gap-1.5 font-bold text-rose-300">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {stale
              ? "Problems in the parsed draft (checked again on submit)"
              : "Fix before submitting"}
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {result.problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 rounded-2xl border border-[#8279FF]/30 bg-[#8279FF]/10 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-bold text-[#c4c0ff] uppercase">
            Engine preview (nothing is held yet)
          </span>
          {preview ? <DecisionBadge status={preview.status} /> : null}
        </div>
        {preview ? (
          <>
            {preview.room_id ? (
              <div className="font-mono text-sm font-bold text-white">
                {preview.room_id} · {roomName(preview.room_id)}
                {decisionSlot(preview, periods) ? (
                  <span className="mt-0.5 block text-xs font-normal text-[#cbd5e1]">
                    {decisionSlot(preview, periods)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs leading-relaxed text-[#cbd5e1]">
              {preview.reason}
            </p>
            {approvalNeededText(preview.approval) ? (
              <p className="font-mono text-[11px] text-amber-300">
                {approvalNeededText(preview.approval)}
              </p>
            ) : null}
            {draft.repeat_days.length > 0 ? (
              <p className="font-mono text-[10px] text-[#98A6BB]">
                A series is decided as a whole; this shows its first day.
              </p>
            ) : null}
          </>
        ) : (
          <p className="font-mono text-xs text-[#cbd5e1]">
            {draft.missing.length > 0 || result.problems.length > 0
              ? "No preview until the draft is complete and has no problems. Fill the gaps below, then submit to get the decision."
              : "No preview right now (there may be no active timetable yet). Submitting still records your request."}
          </p>
        )}
        {stale ? (
          <p className="flex items-start gap-1.5 font-mono text-[10px] text-amber-300">
            <AlertTriangle
              className="mt-0.5 h-3 w-3 shrink-0"
              aria-hidden="true"
            />
            You edited the draft after parsing; this preview is for the parsed
            version. Submit to get the final decision.
          </p>
        ) : null}
      </div>
    </div>
  );
}
