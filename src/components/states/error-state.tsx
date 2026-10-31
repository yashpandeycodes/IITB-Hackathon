import { RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorStateProps = {
  title?: string;
  message?: ReactNode;
  /** Shows a Retry button when provided (client components only). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Server error digest, shown small so it can be matched with logs. */
  reference?: string;
  /** Extra actions next to Retry. */
  children?: ReactNode;
  /** Use "h1" when the error replaces a whole page. */
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this. Try again in a moment.",
  onRetry,
  retryLabel = "Retry",
  reference,
  children,
  headingLevel: Heading = "h2",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-hard/30 bg-card flex flex-col items-center justify-center gap-4 rounded-xl border px-6 py-12 text-center",
        className,
      )}
    >
      <div className="bg-hard-subtle text-hard-foreground flex size-12 items-center justify-center rounded-full">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <Heading className="text-base font-semibold text-balance">
          {title}
        </Heading>
        <p className="text-muted-foreground text-sm text-pretty">{message}</p>
        {reference ? (
          <p className="text-muted-foreground font-mono text-xs">
            Reference: {reference}
          </p>
        ) : null}
      </div>
      {onRetry || children ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button size="lg" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              {retryLabel}
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
