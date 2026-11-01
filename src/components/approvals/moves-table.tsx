"use client";

import { MoveRight } from "lucide-react";

import { RuleChip } from "@/components/semantic/rule-chip";
import type { MoveDiff, MoveKind } from "@/lib/contracts";

import {
  MOVE_CAUSE_LABEL,
  MOVE_KIND_LABEL,
  ruleLabel,
  slotText,
} from "./approval-utils";
import type { SessionInfo } from "./session-info";

const MOVE_TONE: Record<MoveKind, string> = {
  room_only: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  time_only: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  time_and_room: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  added: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  removed: "border-rose-500/30 bg-rose-500/15 text-rose-300",
};

type Lookups = {
  info: Map<string, SessionInfo>;
  courseName: (id: string) => string;
  facultyName: (id: string) => string;
};

function MoveKindChip({ move }: { move: MoveKind }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${MOVE_TONE[move]}`}
    >
      {MOVE_KIND_LABEL[move]}
    </span>
  );
}

function Cause({ d }: { d: MoveDiff }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] font-bold text-white/80 uppercase">
        {MOVE_CAUSE_LABEL[d.cause]}
        {d.displaced_by ? ` · for ${d.displaced_by}` : ""}
      </div>
      {d.rules.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {d.rules.map((rule) => (
            <RuleChip key={rule} code={rule} label={ruleLabel(rule)} />
          ))}
        </div>
      ) : null}
      <p className="text-[11px] leading-relaxed text-[#cbd5e1]">{d.reason}</p>
    </div>
  );
}

function SessionLabel({ d, lookups }: { d: MoveDiff; lookups: Lookups }) {
  const s = lookups.info.get(d.session_id);
  return (
    <div className="min-w-0">
      <div className="font-mono font-bold text-[#66E3F0]">{d.session_id}</div>
      {s ? (
        <>
          <div className="text-[11px] font-semibold text-white">
            {lookups.courseName(s.course_id)}
          </div>
          <div className="font-mono text-[10px] text-[#98A6BB]">
            {s.groups.join(", ")} · {lookups.facultyName(s.faculty_id)}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Every session the change moves, adds or removes: from → to, the kind of move and why.
 * A table on wide screens, stacked cards on phones.
 */
export function MovesTable({
  diff,
  ...lookups
}: { diff: readonly MoveDiff[] } & Lookups) {
  if (diff.length === 0) {
    return (
      <p className="font-mono text-xs text-[#98A6BB]">
        No session moves: every session keeps its slot.
      </p>
    );
  }
  const duration = (id: string) => lookups.info.get(id)?.duration ?? 1;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-[#101A2B] text-[10px] text-[#98A6BB] uppercase">
              <th className="p-2.5">Session</th>
              <th className="p-2.5">From</th>
              <th className="p-2.5">To</th>
              <th className="p-2.5">Move</th>
              <th className="p-2.5">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {diff.map((d) => (
              <tr
                key={d.session_id}
                className="align-top hover:bg-white/[0.02]"
              >
                <td className="p-2.5">
                  <SessionLabel d={d} lookups={lookups} />
                </td>
                <td className="p-2.5 whitespace-nowrap text-rose-300">
                  <span className={d.from && d.to ? "line-through" : ""}>
                    {slotText(d.from, duration(d.session_id))}
                  </span>
                </td>
                <td className="p-2.5 font-bold whitespace-nowrap text-emerald-400">
                  {slotText(d.to, duration(d.session_id))}
                </td>
                <td className="p-2.5">
                  <MoveKindChip move={d.move} />
                </td>
                <td className="max-w-sm p-2.5">
                  <Cause d={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {diff.map((d) => (
          <li
            key={d.session_id}
            className="space-y-2 rounded-2xl border border-white/10 bg-[#101A2B] p-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <SessionLabel d={d} lookups={lookups} />
              <MoveKindChip move={d.move} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-mono">
              <span
                className={`text-rose-300 ${d.from && d.to ? "line-through" : ""}`}
              >
                {slotText(d.from, duration(d.session_id))}
              </span>
              <MoveRight
                className="h-3 w-3 text-[#98A6BB]"
                aria-label="moves to"
              />
              <span className="font-bold text-emerald-400">
                {slotText(d.to, duration(d.session_id))}
              </span>
            </div>
            <Cause d={d} />
          </li>
        ))}
      </ul>
    </>
  );
}
