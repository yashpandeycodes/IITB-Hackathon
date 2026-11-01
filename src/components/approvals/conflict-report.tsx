"use client";

import { OctagonX } from "lucide-react";

import { RuleChip } from "@/components/semantic/rule-chip";
import type { ConflictEntry } from "@/lib/contracts";

import { ruleLabel } from "./approval-utils";
import type { SessionInfo } from "./session-info";

/**
 * Why no valid fix exists: for each session that can't be placed, the constraints that block
 * every candidate slot (with how many slots each rules out) and the direct contradictions.
 */
export function ConflictReport({
  conflicts,
  info,
  courseName,
}: {
  conflicts: readonly ConflictEntry[];
  info: Map<string, SessionInfo>;
  courseName: (id: string) => string;
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-rose-500/40 bg-rose-950/20 p-5">
      <div className="flex items-start gap-3">
        <OctagonX
          className="mt-0.5 h-5 w-5 shrink-0 text-rose-400"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-mono text-sm font-bold text-rose-200 uppercase">
            No valid fix
          </h2>
          <p className="mt-0.5 text-xs text-rose-200/80">
            The rescheduler could not place{" "}
            {conflicts.length === 1
              ? "this session"
              : `these ${conflicts.length} sessions`}{" "}
            without breaking a hard rule. Nothing will change; reject or
            withdraw this request and file a different change.
          </p>
        </div>
      </div>

      {conflicts.length === 0 ? (
        <p className="font-mono text-xs text-rose-200/80">
          No conflict details were recorded.
        </p>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => {
            const s = info.get(c.session_id);
            const total = c.blocking.reduce((sum, b) => sum + b.count, 0);
            return (
              <li
                key={c.session_id}
                className="space-y-2 rounded-2xl border border-white/10 bg-[#0B1220] p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-bold text-[#66E3F0]">
                    {c.session_id}
                  </span>
                  {s ? (
                    <span className="text-xs text-[#98A6BB]">
                      {courseName(s.course_id)} · {s.groups.join(", ")}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-white">{c.summary}</p>

                {c.blocking.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="font-mono text-[10px] text-[#98A6BB] uppercase">
                      What blocks each of the {total} candidate slots
                    </div>
                    <ul className="space-y-1">
                      {c.blocking.map((b, i) => (
                        <li
                          key={`${b.rule}-${i}`}
                          className="flex flex-wrap items-center gap-2 text-xs text-[#cbd5e1]"
                        >
                          <RuleChip code={b.rule} label={ruleLabel(b.rule)} />
                          <span className="font-mono font-bold text-white">
                            × {b.count}
                          </span>
                          <span>{b.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {c.contradictions.length > 0 ? (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] text-[#98A6BB] uppercase">
                      Contradictions no move can fix
                    </div>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-rose-200">
                      {c.contradictions.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
