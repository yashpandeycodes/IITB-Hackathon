"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { generateExams, isApiClientError } from "@/lib/api-client";
import type { ExamSchedule } from "@/lib/contracts/exam-schedule";

import { errorMessage } from "./facts";

/** `details` of `422 INFEASIBLE` from `POST /api/exams/generate`. */
type InfeasibleDetails = {
  unplaced?: string[];
  unplaced_total?: number;
  violations?: Array<{ rule: string; detail: string }>;
  violations_total?: number;
};

function infeasibleDetails(error: unknown): InfeasibleDetails | null {
  if (!isApiClientError(error) || error.code !== "INFEASIBLE") return null;
  const d = error.details;
  return d && typeof d === "object" ? (d as InfeasibleDetails) : {};
}

function failureText(error: unknown): string {
  if (isApiClientError(error)) {
    if (error.code === "INFEASIBLE") return error.message;
    if (error.status === 409)
      return `Another run holds the lock: ${error.message}`;
    if (error.status === 429) return `Too many runs. ${error.message}`;
  }
  return errorMessage(error, "Exam generation failed.");
}

/**
 * Admin action: `POST /api/exams/generate` (schedules and activates the midsem exams), then
 * refreshes the exam and dashboard queries. Shows the outcome inline.
 */
export function GenerateExamsButton({
  onGenerated,
  label = "Generate exam schedule",
  className = "",
}: {
  onGenerated?: (schedule: ExamSchedule) => void;
  label?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => generateExams(),
    onSuccess: (schedule) => {
      toast.success(
        `Exam schedule ${schedule.id} is active: ${schedule.exams.length} exams placed, penalty ${schedule.penalty}.`,
      );
      queryClient.setQueryData(["exams"], schedule);
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["validate"] });
      void queryClient.invalidateQueries({ queryKey: ["export"] });
      onGenerated?.(schedule);
    },
    onError: (error) => toast.error(failureText(error)),
  });

  const infeasible = mutation.isError
    ? infeasibleDetails(mutation.error)
    : null;

  return (
    <div className={`space-y-3 ${className}`}>
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-[#66E3F0] px-4 py-2.5 font-mono text-xs font-bold text-[#070A12] shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <GraduationCap
          className={`h-4 w-4 ${mutation.isPending ? "animate-pulse" : ""}`}
          aria-hidden="true"
        />
        {mutation.isPending ? "Scheduling exams…" : label}
      </button>

      {mutation.isSuccess ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3 font-mono text-[11px] text-emerald-200"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
          <span>
            {mutation.data.id} is active: {mutation.data.exams.length} exams
            placed, exam penalty {mutation.data.penalty}
            {mutation.data.solver_meta
              ? ` (${mutation.data.solver_meta.algorithm}, ${mutation.data.solver_meta.ms} ms)`
              : ""}
            .
          </span>
        </div>
      ) : null}

      {mutation.isError ? (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-950/20 p-3 font-mono text-[11px] text-rose-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
              aria-hidden="true"
            />
            <span>{failureText(mutation.error)}</span>
          </div>
          {infeasible?.unplaced && infeasible.unplaced.length > 0 ? (
            <div className="pl-6">
              Unplaced (
              {infeasible.unplaced_total ?? infeasible.unplaced.length}
              ): {infeasible.unplaced.join(", ")}
            </div>
          ) : null}
          {infeasible?.violations && infeasible.violations.length > 0 ? (
            <ul className="space-y-0.5 pl-6">
              {infeasible.violations.slice(0, 10).map((v, i) => (
                <li key={i}>
                  <strong className="text-white">{v.rule}</strong> {v.detail}
                </li>
              ))}
              {(infeasible.violations_total ?? infeasible.violations.length) >
              10 ? (
                <li className="text-rose-300/70">
                  …and{" "}
                  {(infeasible.violations_total ??
                    infeasible.violations.length) - 10}{" "}
                  more.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
