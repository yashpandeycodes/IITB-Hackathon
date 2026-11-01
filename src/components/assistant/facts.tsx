"use client";

import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  BookingExplainFacts,
  SessionFacts,
} from "@/lib/contracts/explain";
import type { ConflictEntry, MoveDiff, SlotRef } from "@/lib/contracts/change";
import { isApiClientError } from "@/lib/api-client";
import { formatPeriodShort } from "@/lib/format";

/** Readable message for anything thrown by the API client (or anything else). */
export function errorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** `{day, start_period, room_id}` → "THU P2 · 9 AM · LH-3". */
export function slotLabel(slot: SlotRef | null): string {
  if (!slot) return "not placed";
  return `${slot.day} ${formatPeriodShort(slot.start_period)} · ${slot.room_id}`;
}

/** `+3`, `−2` or `0` for a soft-penalty change. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** Small mono pill. */
export function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "cyan" | "violet" | "green" | "amber" | "rose";
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/5 text-[#cbd5e1] border-white/10",
    cyan: "bg-[#66E3F0]/10 text-[#66E3F0] border-[#66E3F0]/30",
    violet: "bg-[#8279FF]/15 text-[#b4aefe] border-[#8279FF]/40",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** "AI-phrased" vs "Template" for an explanation's text. */
export function TextSourcePill({ source }: { source: "llm" | "template" }) {
  return source === "llm" ? (
    <Pill
      tone="violet"
      title="Phrased by the AI from the engine's facts, then fact-checked"
    >
      <Bot className="h-3 w-3" aria-hidden="true" />
      AI-phrased
    </Pill>
  ) : (
    <Pill tone="neutral" title="Written by a template from the engine's facts">
      <Cpu className="h-3 w-3" aria-hidden="true" />
      Template
    </Pill>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold tracking-wider text-[#98A6BB] uppercase">
      {children}
    </div>
  );
}

/** Compact view of the engine's facts behind "why is this session here?". */
export function SessionFactsView({ facts }: { facts: SessionFacts }) {
  const { placed, room, soft_costs, alternatives } = facts;
  return (
    <div className="space-y-3 text-[11px] text-[#cbd5e1]">
      <div className="flex flex-wrap gap-1.5">
        {placed ? (
          <Pill tone="cyan">
            {placed.day} {placed.time} (P{placed.start_period}
            {placed.end_period > placed.start_period
              ? `–P${placed.end_period}`
              : ""}
            ) · {placed.room_id}
          </Pill>
        ) : (
          <Pill tone="amber">Not placed in the active timetable</Pill>
        )}
        {facts.fixed_slot ? (
          <Pill tone="violet">Fixed slot in the dataset</Pill>
        ) : null}
        {facts.version_id ? <Pill>{facts.version_id}</Pill> : null}
      </div>

      {room ? (
        <div className="space-y-1">
          <SectionLabel>Why this room</SectionLabel>
          <p>
            <strong className="text-white">{room.room_name}</strong> (
            {room.type}): {room.capacity} seats, {room.fill_percent}% full ·{" "}
            {room.suitable_rooms} suitable room
            {room.suitable_rooms === 1 ? "" : "s"} in total.
          </p>
          {room.smaller_suitable_busy.length > 0 ? (
            <p className="text-[#98A6BB]">
              Smaller suitable rooms busy at this time:{" "}
              {room.smaller_suitable_busy.join(", ")}.
            </p>
          ) : null}
          {room.note ? <p className="text-[#98A6BB]">{room.note}</p> : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <SectionLabel>Soft-rule cost here</SectionLabel>
        {soft_costs.length === 0 ? (
          <p className="flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            No soft points at this slot.
          </p>
        ) : (
          <ul className="space-y-1">
            {soft_costs.map((c, i) => (
              <li key={`${c.rule}-${i}`} className="flex gap-2">
                <Pill tone="amber">
                  {c.rule} +{c.points}
                </Pill>
                <span>{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <SectionLabel>Other slots considered</SectionLabel>
        <div className="grid grid-cols-3 gap-2 font-mono">
          <Stat label="Considered" value={alternatives.considered} />
          <Stat label="Free" value={alternatives.free} />
          <Stat label="Better" value={alternatives.better} />
        </div>
        {alternatives.blocked.length > 0 ? (
          <ul className="space-y-1">
            {alternatives.blocked.map((b, i) => (
              <li key={`${b.rule}-${i}`} className="flex gap-2">
                <Pill tone="rose">
                  {b.rule} × {b.count}
                </Pill>
                <span>{b.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {alternatives.best.length > 0 ? (
          <div className="space-y-1 pt-1">
            <div className="text-[10px] text-[#98A6BB]">
              Best free slots (nothing else moves):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {alternatives.best.map((s) => (
                <Pill key={`${s.day}-${s.start_period}-${s.room_id}`}>
                  {s.day} P{s.start_period} · {s.room_id} · soft{" "}
                  {signed(s.soft_delta)}
                </Pill>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#101A2B] px-2 py-1.5 text-center">
      <div className="text-sm font-black text-white">{value}</div>
      <div className="text-[9px] text-[#98A6BB] uppercase">{label}</div>
    </div>
  );
}

/** Compact view of a booking decision's stored facts (or an approver's rejection). */
export function BookingFactsView({ facts }: { facts: BookingExplainFacts }) {
  if ("rejected_by" in facts) {
    return (
      <div className="space-y-1 text-[11px] text-[#cbd5e1]">
        <p>
          Rejected by{" "}
          <strong className="text-white">{facts.rejected_by}</strong> on{" "}
          {new Date(facts.rejected_at).toLocaleString()}.
        </p>
        {facts.comment ? (
          <p className="text-[#98A6BB] italic">“{facts.comment}”</p>
        ) : null}
      </div>
    );
  }
  if (!("candidate_rooms" in facts)) {
    return (
      <p className="text-[11px] text-[#98A6BB]">
        No structured facts were stored with this decision.
      </p>
    );
  }
  return (
    <div className="space-y-2.5 text-[11px] text-[#cbd5e1]">
      <div className="flex flex-wrap gap-1.5">
        <Pill>{facts.attendance} attending</Pill>
        <Pill>
          {facts.duration} period{facts.duration === 1 ? "" : "s"}
        </Pill>
        {facts.series_id ? (
          <Pill tone="violet">Series {facts.series_id}</Pill>
        ) : null}
        {facts.largest_room ? (
          <Pill title="Largest room of a suitable type">
            Largest: {facts.largest_room.room_id} ({facts.largest_room.capacity}
            )
          </Pill>
        ) : null}
      </div>

      {facts.requested_room ? (
        <div className="space-y-0.5">
          <SectionLabel>Requested room</SectionLabel>
          {facts.requested_room_known ? (
            <p>
              {facts.requested_room}
              {facts.requested_room_missing.length > 0
                ? ` lacks: ${facts.requested_room_missing.join(", ")}.`
                : " has everything asked for."}
            </p>
          ) : (
            <p>
              “{facts.requested_room}” is not a room in the dataset
              {facts.room_suggestion
                ? `; the closest match is ${facts.room_suggestion}.`
                : "."}
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-0.5">
        <SectionLabel>
          Suitable rooms ({facts.candidate_rooms.length})
        </SectionLabel>
        <p>
          {facts.candidate_rooms.length > 0
            ? facts.candidate_rooms.join(", ")
            : "No room fits the type, capacity and needs asked for."}
        </p>
      </div>

      {facts.blocked_by.length > 0 ? (
        <div className="space-y-1">
          <SectionLabel>What stood in the way</SectionLabel>
          <ul className="space-y-1">
            {facts.blocked_by.slice(0, 8).map((b, i) => (
              <li key={`${b.kind}-${b.id}-${i}`} className="flex gap-2">
                <Pill tone="rose">{b.kind}</Pill>
                <span>
                  {b.id}
                  {b.room_id ? ` in ${b.room_id}` : ""} · {b.day} P
                  {b.periods.join(", P")}
                </span>
              </li>
            ))}
          </ul>
          {facts.blocked_by.length > 8 ? (
            <p className="text-[10px] text-[#98A6BB]">
              …and {facts.blocked_by.length - 8} more.
            </p>
          ) : null}
        </div>
      ) : null}

      {facts.displaced.length > 0 ? (
        <div className="space-y-1">
          <SectionLabel>Classes moved for Week 7</SectionLabel>
          <ul className="space-y-0.5">
            {facts.displaced.map((d) => (
              <li key={d.session_id}>
                <strong className="text-white">{d.session_id}</strong>:{" "}
                {slotLabel(d.from)} → {slotLabel(d.to)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {facts.cancelled ? (
        <p className="text-rose-300">
          Cancelled by {facts.cancelled.by} on{" "}
          {new Date(facts.cancelled.at).toLocaleString()}
          {facts.cancelled.note ? `: ${facts.cancelled.note}` : "."}
        </p>
      ) : null}
    </div>
  );
}

const MOVE_LABEL: Record<MoveDiff["move"], string> = {
  room_only: "room only",
  time_only: "time only",
  time_and_room: "time + room",
  added: "added",
  removed: "removed",
};

/** What a proposal moves, one line per session. */
export function MoveDiffList({ diff }: { diff: MoveDiff[] }) {
  if (diff.length === 0) {
    return (
      <p className="text-[11px] text-[#98A6BB]">No session changes slot.</p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {diff.map((d) => (
        <li
          key={`${d.session_id}-${d.move}`}
          className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <strong className="font-mono text-white">{d.session_id}</strong>
            <Pill tone={d.cause === "requested" ? "cyan" : "neutral"}>
              {MOVE_LABEL[d.move]}
            </Pill>
            {d.cause === "evicted" && d.displaced_by ? (
              <Pill tone="amber">makes room for {d.displaced_by}</Pill>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#98A6BB]">
            {slotLabel(d.from)} → {slotLabel(d.to)}
          </div>
          {d.reason ? (
            <div className="mt-0.5 text-[#cbd5e1]">{d.reason}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Why something can't be placed: blocking rules and direct contradictions. */
export function ConflictList({ conflicts }: { conflicts: ConflictEntry[] }) {
  return (
    <ul className="space-y-2">
      {conflicts.map((c) => (
        <li
          key={c.session_id}
          className="space-y-1.5 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-[11px]"
        >
          <div className="flex items-start gap-2 text-rose-200">
            <Ban
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"
              aria-hidden="true"
            />
            <span>
              <strong className="font-mono text-white">{c.session_id}</strong>:{" "}
              {c.summary}
            </span>
          </div>
          {c.blocking.length > 0 ? (
            <ul className="space-y-1 pl-5">
              {c.blocking.map((b, i) => (
                <li key={`${b.rule}-${i}`} className="flex gap-2">
                  <Pill tone="rose">
                    {b.rule} × {b.count}
                  </Pill>
                  <span className="text-[#cbd5e1]">{b.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {c.contradictions.length > 0 ? (
            <ul className="space-y-0.5 pl-5 text-amber-200">
              {c.contradictions.map((x, i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** "Checked by the constraint engine" marker. */
export function VerifiedPill() {
  return (
    <Pill
      tone="green"
      title="Options and conflicts were computed by the constraint engine"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Engine-verified
    </Pill>
  );
}
