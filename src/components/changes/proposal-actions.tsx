"use client";

/**
 * Preview → Submit for every change form. "Preview" asks the rescheduler what the change would
 * do without storing anything (`POST /api/changes/preview`); "Submit for approval" files it
 * (`POST /api/changes`, or the form's own `submit`, e.g. `POST /api/manual/place`) and opens
 * the request's approval page. A preview belongs to the exact body it was computed for: editing
 * the form hides it until the next preview.
 */
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { previewChange, proposeChange } from "@/lib/api-client";
import type {
  ChangePreview,
  ChangeProposalRequestInput,
  ChangeRequest,
} from "@/lib/contracts";

import { errorIssues, errorMessage, type IssueLine } from "./api-errors";
import { IssueList } from "./change-ui";
import { ProposalView } from "./proposal-view";

export type ProposalActionsProps = {
  /** The request as it will be previewed (and filed, unless `submit` is given); null while incomplete. */
  body: ChangeProposalRequestInput | null;
  /** Why the form can't be previewed yet ("Choose a faculty member"). */
  blockedReason?: string | null;
  /** Files the request another way (manual placement); defaults to `proposeChange(body)`. */
  submit?: () => Promise<ChangeRequest>;
  /** Why submitting is blocked even with a preview. */
  submitBlockedReason?: string | null;
  /** Extra line shown above the buttons. */
  hint?: ReactNode;
};

export function ProposalActions({
  body,
  blockedReason,
  submit,
  submitBlockedReason,
  hint,
}: ProposalActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = body ? JSON.stringify(body) : null;
  const [preview, setPreview] = useState<{
    key: string;
    data: ChangePreview;
  } | null>(null);
  const [problems, setProblems] = useState<{
    key: string;
    title: string;
    lines: IssueLine[];
  } | null>(null);

  const previewMutation = useMutation({
    mutationFn: (vars: { body: ChangeProposalRequestInput; key: string }) =>
      previewChange(vars.body),
    onSuccess: (data, vars) => {
      setPreview({ key: vars.key, data });
      setProblems(null);
    },
    onError: (error, vars) => {
      setPreview(null);
      setProblems({
        key: vars.key,
        title: errorMessage(error, "The preview failed."),
        lines: errorIssues(error),
      });
      toast.error(errorMessage(error, "Couldn't preview this change."));
    },
  });

  const submitMutation = useMutation({
    mutationFn: (vars: { run: () => Promise<ChangeRequest>; key: string }) =>
      vars.run(),
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (change.status === "infeasible")
        toast.warning(
          `${change.id} filed. No valid fix exists, so it is stored as infeasible.`,
        );
      else
        toast.success(
          `${change.id} filed. It now waits for an admin's approval.`,
        );
      router.push(`/approvals/${encodeURIComponent(change.id)}`);
    },
    onError: (error, vars) => {
      setProblems({
        key: vars.key,
        title: errorMessage(error, "Filing the change failed."),
        lines: errorIssues(error),
      });
      toast.error(errorMessage(error, "Couldn't file this change."));
    },
  });

  const current = preview && preview.key === key ? preview.data : null;
  const currentProblems = problems && problems.key === key ? problems : null;
  // Stays busy after a successful submit while the approval page opens (no double filing).
  const busy =
    previewMutation.isPending ||
    submitMutation.isPending ||
    submitMutation.isSuccess;
  const canPreview = body !== null && !blockedReason && !busy;
  const submitReason = !current
    ? "Preview the change first to see exactly what moves."
    : (submitBlockedReason ?? null);
  const canSubmit = canPreview && current !== null && !submitBlockedReason;

  const onPreview = () => {
    if (!body || !key) return;
    previewMutation.mutate({ body, key });
  };
  const onSubmit = () => {
    if (!body || !key) return;
    const run = submit ?? (() => proposeChange(body));
    submitMutation.mutate({ run, key });
  };

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      {hint ? <div className="text-[11px] text-[#98A6BB]">{hint}</div> : null}

      {currentProblems ? (
        <IssueList
          title={currentProblems.title}
          issues={currentProblems.lines}
        />
      ) : null}
      {currentProblems && currentProblems.lines.length === 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {currentProblems.title}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#66E3F0]/40 bg-[#66E3F0]/10 py-3 font-mono text-xs font-bold text-[#66E3F0] transition-colors hover:bg-[#66E3F0]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          {previewMutation.isPending
            ? "Computing the fewest moves…"
            : "Preview"}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          title={submitReason ?? undefined}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#66E3F0] py-3 font-mono text-xs font-bold text-[#070A12] shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {current && !current.feasible
            ? "Submit anyway (stored as infeasible)"
            : "Submit for approval"}
        </button>
      </div>
      {blockedReason ? (
        <p className="text-center font-mono text-[11px] text-[#98A6BB]">
          {blockedReason}
        </p>
      ) : submitReason && !busy ? (
        <p className="text-center font-mono text-[11px] text-[#98A6BB]">
          {submitReason}
        </p>
      ) : null}

      {current ? (
        <section
          aria-label="Proposal preview"
          className="rounded-2xl border border-white/10 bg-[#070A12]/60 p-4"
        >
          <ProposalView proposal={current} baseVersion={current.base_version} />
        </section>
      ) : null}
    </div>
  );
}
