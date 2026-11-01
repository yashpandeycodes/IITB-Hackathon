"use client";

import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Lightbulb, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";

import { explain, isApiClientError } from "@/lib/api-client";
import type {
  ExplainRequest,
  ExplainResult,
  ExplainSubject,
} from "@/lib/contracts/explain";

import {
  BookingFactsView,
  SessionFactsView,
  TextSourcePill,
  errorMessage,
} from "./facts";

/** Statuses that a retry won't fix. */
const NO_RETRY = new Set([400, 401, 403, 404, 429]);

/**
 * `POST /api/explain` for one subject, fetched only once `enabled` (an explicit click), cached
 * per subject and id. The explanation is read-only, so a query (not a mutation) fits.
 */
export function useExplanation(body: ExplainRequest, enabled: boolean) {
  return useQuery({
    queryKey: ["explain", body.subject, body.id],
    queryFn: ({ signal }) => explain(body, { signal }),
    enabled: enabled && body.id.length > 0,
    staleTime: 60_000,
    retry: (count, error) =>
      !(isApiClientError(error) && NO_RETRY.has(error.status)) && count < 1,
  });
}

function explainErrorText(error: unknown, subject: ExplainSubject): string {
  if (isApiClientError(error)) {
    if (error.status === 404) {
      return subject === "booking"
        ? "This decision's explanation isn't visible to you (dataset requests are explained to admins only)."
        : "Nothing to explain: it isn't in the active data, or you can't see it.";
    }
    if (error.status === 429) {
      return "Too many explanation requests. Try again in a few minutes.";
    }
  }
  return errorMessage(error, "Couldn't load the explanation.");
}

function ExplanationBody({ result }: { result: ExplainResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed text-white">{result.text}</p>
        <span className="shrink-0">
          <TextSourcePill source={result.source} />
        </span>
      </div>
      {result.subject === "session" ? (
        <SessionFactsView facts={result.facts} />
      ) : result.subject === "booking" ? (
        <BookingFactsView facts={result.facts} />
      ) : null}
    </div>
  );
}

/**
 * A "Why …?" toggle that loads `POST /api/explain` on first open and shows the text plus a
 * compact view of the facts. `autoLoad` opens it straight away.
 */
export function ExplanationPanel({
  subject,
  id,
  label,
  autoLoad = false,
}: {
  subject: ExplainSubject;
  id: string;
  label: string;
  autoLoad?: boolean;
}) {
  const [open, setOpen] = useState(autoLoad);
  const query = useExplanation({ subject, id }, open);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#66E3F0]/30 bg-[#132035] px-3 py-2.5 font-mono text-xs font-bold text-[#66E3F0] transition-colors hover:bg-[#1a2b47]"
      >
        <span className="flex items-center gap-2 text-left">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {label}
        </span>
        <span className="shrink-0">{open ? "▲ Hide" : "▼ Explain"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#070A12] p-3.5">
          {query.isPending ? (
            <div
              role="status"
              className="flex items-center gap-2 py-3 font-mono text-[11px] text-[#98A6BB]"
            >
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin text-[#66E3F0]"
                aria-hidden="true"
              />
              Asking the engine…
            </div>
          ) : query.isError ? (
            <div role="alert" className="space-y-2 text-[11px] text-rose-300">
              <p>{explainErrorText(query.error, subject)}</p>
              {!(
                isApiClientError(query.error) &&
                NO_RETRY.has(query.error.status)
              ) ? (
                <button
                  type="button"
                  onClick={() => query.refetch()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 font-mono text-[11px] text-rose-200 hover:bg-rose-500/25"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-[#34d399] uppercase">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                From the scheduling engine
              </div>
              <ExplanationBody result={query.data} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
