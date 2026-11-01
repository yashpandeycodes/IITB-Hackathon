import { CircleDashed, Gavel, Hourglass, Send } from "lucide-react";

import { StatusBadge } from "@/components/semantic/badges";
import type { DecisionStatus, RequestState } from "@/lib/contracts";

/** The engine's decision for a request, or "No decision yet". */
export function DecisionBadge({
  status,
}: {
  status: DecisionStatus | null | undefined;
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-300">
        <CircleDashed className="h-3 w-3" aria-hidden="true" />
        No decision yet
      </span>
    );
  }
  return (
    <StatusBadge
      status={status === "alternative_offered" ? "alternative" : status}
      className="whitespace-nowrap"
    />
  );
}

/** Where a request is in its life: submitted, awaiting approval, decided or cancelled. */
export function RequestStateBadge({ state }: { state: RequestState }) {
  switch (state) {
    case "cancelled":
      return <StatusBadge status="cancelled" className="whitespace-nowrap" />;
    case "pending_approval":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-300">
          <Hourglass className="h-3 w-3" aria-hidden="true" />
          Awaiting approval
        </span>
      );
    case "decided":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[#cbd5e1]">
          <Gavel className="h-3 w-3" aria-hidden="true" />
          Decided
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-sky-300">
          <Send className="h-3 w-3" aria-hidden="true" />
          {state === "draft" ? "Draft" : "Submitted"}
        </span>
      );
  }
}
