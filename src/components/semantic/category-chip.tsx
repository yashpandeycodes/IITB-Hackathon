import { ArrowDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CATEGORY_META } from "@/config/semantics";
import type { Category } from "@/lib/contracts/enums";
import { cn } from "@/lib/utils";

/**
 * Priority category chip. When the requester claimed a higher category than
 * their role allows, pass `claimed`: a "capped" badge appears next to the
 * effective category, with the original claim in a tooltip (and in the text
 * for screen readers).
 */
export function CategoryChip({
  category,
  claimed,
  className,
}: {
  category: Category;
  claimed?: Category;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const chip = (
    <Badge variant="outline" className={cn(meta.className, className)}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
  if (claimed === undefined || claimed === category) return chip;

  const claimedLabel = CATEGORY_META[claimed].label;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {chip}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge asChild variant="outline" className="cursor-help">
            <button type="button">
              <ArrowDown aria-hidden="true" />
              capped
              <span className="sr-only">, requested as {claimedLabel}</span>
            </button>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Requested as {claimedLabel}; capped to {meta.label} by the
          requester&apos;s role.
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
