import { CalendarCheck2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Square logo tile. Decorative: pair it with visible or sr-only text. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "from-primary to-brand text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br shadow-sm",
        className,
      )}
    >
      <CalendarCheck2 className="size-[18px]" />
    </span>
  );
}
