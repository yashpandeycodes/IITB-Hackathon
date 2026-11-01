"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Loader2, RotateCcw } from "lucide-react";

import { explain } from "@/lib/api-client";

import { errorMessage } from "./approval-utils";

/** "Why these moves?" — the engine's own explanation of a change request (`POST /api/explain`). */
export function ChangeExplain({
  changeId,
  infeasible,
}: {
  changeId: string;
  infeasible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["changes", "explain", changeId],
    queryFn: ({ signal }) =>
      explain({ subject: "change", id: changeId }, { signal }),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-3 rounded-3xl border border-white/10 bg-[#0B1220] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
            {infeasible ? "Why is there no fix?" : "Why these moves?"}
          </h2>
          <p className="mt-0.5 text-xs text-[#98A6BB]">
            A plain-language explanation built from the rescheduler&apos;s own
            facts.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#8279FF]/40 bg-[#8279FF]/15 px-4 py-2 font-mono text-xs font-bold text-[#c4bfff] transition-colors hover:bg-[#8279FF]/25"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Explain
          </button>
        ) : null}
      </div>

      {open ? (
        query.isLoading ? (
          <div className="flex items-center gap-2 font-mono text-xs text-[#98A6BB]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Asking the engine…
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            <span>{errorMessage(query.error)}</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex items-center gap-1 font-mono font-bold text-rose-100 hover:underline"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : query.data ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed whitespace-pre-line text-[#e2e8f0]">
              {query.data.text}
            </p>
            <p className="font-mono text-[10px] text-[#98A6BB]">
              Source:{" "}
              {query.data.source === "llm"
                ? "AI rephrasing of the engine's facts"
                : "engine template"}
            </p>
          </div>
        ) : null
      ) : null}
    </div>
  );
}
