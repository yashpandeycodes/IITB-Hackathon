import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Six KPI cards, matching the dashboard row. */
export function KpiRowSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
        >
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Route-level loading placeholder: header, KPI row and two content panels. */
export function PageSkeleton({
  kpis = true,
  className,
}: {
  kpis?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex flex-col gap-6", className)}
    >
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      {kpis ? <KpiRowSkeleton /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
