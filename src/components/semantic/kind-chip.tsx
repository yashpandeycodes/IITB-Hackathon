import { Badge } from "@/components/ui/badge";
import { KIND_META, type DisplayKind } from "@/config/semantics";
import { cn } from "@/lib/utils";

/**
 * Session kind chip. `display="code"` shows the grid shorthand (L, T, P, OEB)
 * and keeps the full label for screen readers.
 */
export function KindChip({
  kind,
  display = "label",
  className,
}: {
  kind: DisplayKind;
  display?: "label" | "code";
  className?: string;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      <Icon aria-hidden="true" />
      {display === "code" ? (
        <>
          <span aria-hidden="true" className="font-mono">
            {meta.code}
          </span>
          <span className="sr-only">{meta.label}</span>
        </>
      ) : (
        meta.label
      )}
    </Badge>
  );
}
