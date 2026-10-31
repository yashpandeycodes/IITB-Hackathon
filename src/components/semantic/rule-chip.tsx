import { Badge } from "@/components/ui/badge";
import { getRuleSeverity, RULE_SEVERITY_META } from "@/config/semantics";
import { cn } from "@/lib/utils";

/**
 * Rule code chip (`H4`, `B2`, `S3`). Hard rules get the octagon icon and red
 * tokens, soft penalties the triangle and amber; the severity is also spoken.
 */
export function RuleChip({
  code,
  label,
  className,
}: {
  code: string;
  /** Optional short text after the code, e.g. "room double-booked". */
  label?: string;
  className?: string;
}) {
  const meta = RULE_SEVERITY_META[getRuleSeverity(code)];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      <Icon aria-hidden="true" />
      <span className="sr-only">{meta.label} </span>
      <span className="font-mono font-semibold">{code}</span>
      {label ? <span className="font-normal">· {label}</span> : null}
    </Badge>
  );
}
