import { Badge } from "@/components/ui/badge";
import { getStatusMeta, type StatusValue } from "@/config/semantics";
import { cn } from "@/lib/utils";

/** Booking decision, request state or change status: icon + label on its status colour. */
export function StatusBadge({
  status,
  className,
}: {
  status: StatusValue;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      <Icon aria-hidden="true" className={meta.iconClassName} />
      {meta.label}
    </Badge>
  );
}
