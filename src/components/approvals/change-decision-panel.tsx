"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  OctagonAlert,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";

import { useSessionUser } from "@/components/providers/session-provider";
import { RuleChip } from "@/components/semantic/rule-chip";
import {
  approveChange,
  isApiClientError,
  rejectChange,
} from "@/lib/api-client";
import type { ChangeRequest } from "@/lib/contracts";

import {
  AFTER_CHANGE_KEYS,
  errorMessage,
  formatDateTime,
  isSelfApproval,
  ruleLabel,
} from "./approval-utils";

type Problem = {
  title: string;
  message: string;
  violations?: { rule: string; detail: string }[];
};

/** `HARD_CONSTRAINT` details: the validator's violations (first 50). */
function violationsOf(details: unknown): { rule: string; detail: string }[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((v: unknown) =>
    typeof v === "object" &&
    v !== null &&
    "rule" in v &&
    "detail" in v &&
    typeof v.rule === "string" &&
    typeof v.detail === "string"
      ? [{ rule: v.rule, detail: v.detail }]
      : [],
  );
}

export function changeDetailKey(id: string) {
  return ["changes", "detail", id] as const;
}

/**
 * Approve & apply / Reject (admin), Withdraw (the requester), or the recorded decision once the
 * request is closed. The server enforces every rule; the UI only explains them up front.
 */
export function ChangeDecisionPanel({ change }: { change: ChangeRequest }) {
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const isAdmin = user.role === "admin";
  const isRequester = change.requested_by === user.id;
  const selfBlocked = isSelfApproval(change, user.id);
  const isOpen = change.status === "pending" || change.status === "infeasible";
  const canApprove = isAdmin && change.status === "pending" && !selfBlocked;
  const canReject = isOpen && (isAdmin || isRequester);
  const withdraw = isRequester;

  const refresh = () => {
    for (const key of AFTER_CHANGE_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const approve = useMutation({
    mutationFn: () =>
      approveChange(change.id, { comment: comment.trim() || undefined }),
    onSuccess: (result) => {
      queryClient.setQueryData(changeDetailKey(change.id), result.change);
      setConfirm(null);
      setProblem(null);
      setComment("");
      toast.success(
        `${result.change.id} applied. ${result.version_id} is now the active timetable.`,
        {
          description:
            result.superseded.length > 0
              ? `Superseded and rejected: ${result.superseded.join(", ")}.`
              : undefined,
        },
      );
      refresh();
    },
    onError: (error) => {
      const message = errorMessage(error);
      toast.error(message);
      setConfirm(null);
      if (!isApiClientError(error)) {
        setProblem({ title: "Couldn't approve", message });
        return;
      }
      switch (error.code) {
        case "SELF_APPROVAL":
          setProblem({ title: "You can't approve your own request", message });
          break;
        case "FORBIDDEN":
          setProblem({
            title: "Only an admin can approve timetable changes",
            message,
          });
          break;
        case "STALE_VERSION":
          setProblem({
            title: "The timetable changed since this proposal. Re-propose.",
            message,
          });
          refresh();
          break;
        case "HARD_CONSTRAINT":
          setProblem({
            title: "This proposal no longer holds (it stays pending)",
            message,
            violations: violationsOf(error.details),
          });
          break;
        case "CONFLICT":
        case "NOT_FOUND":
          setProblem({ title: "Couldn't apply this change", message });
          refresh();
          break;
        default:
          setProblem({ title: "Couldn't approve", message });
      }
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectChange(change.id, { comment: comment.trim() || undefined }),
    onSuccess: (updated) => {
      queryClient.setQueryData(changeDetailKey(change.id), updated);
      setConfirm(null);
      setProblem(null);
      setComment("");
      toast.success(
        withdraw
          ? `${updated.id} withdrawn.`
          : `${updated.id} rejected. Nothing changed in the timetable.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      const message = errorMessage(error);
      toast.error(message);
      setConfirm(null);
      setProblem({
        title: withdraw ? "Couldn't withdraw" : "Couldn't reject",
        message,
      });
      if (
        isApiClientError(error) &&
        (error.code === "CONFLICT" || error.code === "NOT_FOUND")
      ) {
        void queryClient.invalidateQueries({ queryKey: ["changes"] });
      }
    },
  });

  const busy = approve.isPending || reject.isPending;

  const problemBox = problem ? (
    <div
      role="alert"
      className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100"
    >
      <div className="flex items-center gap-1.5 font-mono font-bold">
        <OctagonAlert className="h-3.5 w-3.5" aria-hidden="true" />
        {problem.title}
      </div>
      <p>{problem.message}</p>
      {problem.violations && problem.violations.length > 0 ? (
        <ul className="space-y-1">
          {problem.violations.slice(0, 10).map((v, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <RuleChip code={v.rule} label={ruleLabel(v.rule)} />
              <span>{v.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  // Closed: show the recorded decision.
  if (!isOpen) {
    const applied = change.status === "applied";
    return (
      <div
        className={`space-y-2 rounded-3xl border p-5 ${
          applied
            ? "border-emerald-500/30 bg-emerald-950/20"
            : "border-white/10 bg-[#0B1220]"
        }`}
      >
        {problemBox}
        <h2 className="font-mono text-sm font-bold text-white uppercase">
          Decision
        </h2>
        <p className="text-sm text-[#e2e8f0]">
          {applied
            ? `Approved by ${change.approved_by ?? change.decided_by ?? "an admin"} and applied: ${change.proposed_version ?? "the proposed timetable"} became the active timetable.`
            : change.decided_by === "system"
              ? "Rejected automatically by the system."
              : change.decided_by === change.requested_by
                ? `Withdrawn by the requester (${change.decided_by}).`
                : `Rejected by ${change.decided_by ?? "an admin"}.`}
        </p>
        {change.comment ? (
          <p className="rounded-xl border border-white/10 bg-[#101A2B] px-3 py-2 text-xs text-[#cbd5e1]">
            “{change.comment}”
          </p>
        ) : null}
        <p className="font-mono text-[11px] text-[#98A6BB]">
          {formatDateTime(change.decided_at)}
        </p>
      </div>
    );
  }

  const readOnlyNote = !isAdmin
    ? isRequester
      ? "An admin reviews and approves this change. You can withdraw it while it waits."
      : "Only an admin approves timetable changes. You can review the proposal here."
    : selfBlocked
      ? "You filed this request, so another admin has to approve it. You can still withdraw it."
      : change.status === "infeasible"
        ? "There is no valid fix to apply. Reject it so the requester can file a different change."
        : null;

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[#0B1220] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-sm font-bold text-white uppercase">
          Approval
        </h2>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#98A6BB]">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Nothing changes until an admin approves
        </span>
      </div>

      {readOnlyNote ? (
        <p className="rounded-xl border border-white/10 bg-[#101A2B] px-3 py-2 text-xs text-[#cbd5e1]">
          {readOnlyNote}
        </p>
      ) : null}

      {problemBox}

      {canApprove || canReject ? (
        <>
          <div>
            <label
              htmlFor="decision-comment"
              className="font-mono text-[10px] text-[#98A6BB] uppercase"
            >
              Comment (optional)
            </label>
            <textarea
              id="decision-comment"
              value={comment}
              maxLength={1000}
              rows={2}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                withdraw
                  ? "Why you're withdrawing it"
                  : "e.g. Approved for the rest of the semester"
              }
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-[#101A2B] px-3 py-2 text-sm text-white outline-none focus:border-[#66E3F0]"
            />
          </div>

          {confirm ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#8279FF]/40 bg-[#8279FF]/10 p-3 text-xs text-[#e2e8f0] sm:flex-row sm:items-center sm:justify-between">
              <span>
                {confirm === "approve"
                  ? `Apply ${change.id}? ${change.proposed_version ?? "The proposed timetable"} becomes the active timetable for everyone, and other pending proposals built on ${change.base_version} are rejected as superseded.`
                  : withdraw
                    ? `Withdraw ${change.id}? Its draft timetable is deleted.`
                    : `Reject ${change.id}? Its draft timetable is deleted and nothing changes.`}
              </span>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono font-bold text-[#cbd5e1] hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    confirm === "approve" ? approve.mutate() : reject.mutate()
                  }
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-mono font-bold disabled:opacity-60 ${
                    confirm === "approve"
                      ? "bg-emerald-500 text-black hover:bg-emerald-400"
                      : "bg-rose-500 text-white hover:bg-rose-400"
                  }`}
                >
                  {busy ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {confirm === "approve"
                    ? "Yes, apply"
                    : withdraw
                      ? "Yes, withdraw"
                      : "Yes, reject"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {canReject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm("reject")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 font-mono text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
                >
                  {withdraw ? (
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  {withdraw ? "Withdraw request" : "Reject"}
                </button>
              ) : null}
              {isAdmin && change.status === "pending" ? (
                <button
                  type="button"
                  disabled={busy || !canApprove}
                  onClick={() => setConfirm("approve")}
                  title={
                    selfBlocked
                      ? "You can't approve your own request"
                      : undefined
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 font-mono text-xs font-bold text-black shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Approve &amp; apply
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
