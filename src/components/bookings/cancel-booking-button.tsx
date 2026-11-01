"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cancelBooking } from "@/lib/api-client";
import type { BookingView } from "@/lib/contracts";

import { errorText } from "./booking-utils";

/** Query keys whose data a booking write can change. */
export const BOOKING_QUERY_KEYS = [
  ["bookings"],
  ["dashboard"],
  ["spectra"],
  ["rooms"],
  ["timetable"],
] as const;

/** Two-step cancel (click, then confirm) for a live request. */
export function CancelBookingButton({
  requestId,
  onCancelled,
  className = "",
}: {
  requestId: string;
  onCancelled?: (view: BookingView) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => cancelBooking(requestId),
    onSuccess: (view) => {
      toast.success(
        `Cancelled ${view.request.id}. Its slot is free for other requests.`,
      );
      setConfirming(false);
      for (const queryKey of BOOKING_QUERY_KEYS)
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onCancelled?.(view);
    },
    onError: (error) => {
      toast.error(errorText(error, "Couldn't cancel this request."));
      setConfirming(false);
    },
  });

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20 ${className}`}
      >
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        Cancel request
      </button>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 font-mono text-xs font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {mutation.isPending ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={mutation.isPending}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-[#cbd5e1] hover:bg-white/10 disabled:opacity-60"
      >
        Keep
      </button>
    </span>
  );
}
