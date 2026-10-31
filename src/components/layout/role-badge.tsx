import { Badge } from "@/components/ui/badge";
import { ROLE_META } from "@/config/roles";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/utils";

export function RoleBadge({
  role,
  compactOnPhone = false,
  className,
}: {
  role: Role;
  /** Below 640 px show only the icon; the label stays available to screen readers. */
  compactOnPhone?: boolean;
  className?: string;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-7 gap-1.5 px-2.5 [&>svg]:size-3.5!",
        compactOnPhone && "max-sm:size-7 max-sm:px-0",
        meta.tone,
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <span className={cn(compactOnPhone && "max-sm:sr-only")}>
        <span className="sr-only">Role: </span>
        {meta.label}
      </span>
    </Badge>
  );
}
