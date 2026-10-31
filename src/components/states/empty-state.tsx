import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Primary call to action rendered as a link button. */
  cta?: { label: string; href: string; icon?: LucideIcon };
  /** Extra actions or content below the description. */
  children?: ReactNode;
  /** Heading level for the title; pages already own the `h1`. */
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
};

/** Icon, one sentence and one CTA (docs/frontend.md §7). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  children,
  headingLevel: Heading = "h2",
  className,
}: EmptyStateProps) {
  const CtaIcon = cta?.icon;
  return (
    <div
      className={cn(
        "bg-card flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      ) : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <Heading className="text-base font-semibold text-balance">
          {title}
        </Heading>
        {description ? (
          <p className="text-muted-foreground text-sm text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {cta ? (
        <Button asChild size="lg">
          <Link href={cta.href}>
            {CtaIcon ? <CtaIcon aria-hidden="true" /> : null}
            {cta.label}
          </Link>
        </Button>
      ) : null}
      {children}
    </div>
  );
}
