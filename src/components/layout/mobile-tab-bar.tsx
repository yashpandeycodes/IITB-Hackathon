"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { formatNavCount, type NavCounts } from "@/components/layout/nav-count";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getMobileNavForRole, isNavItemActive } from "@/config/nav";
import { siteConfig } from "@/config/site";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/utils";

const tabClass =
  "group flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:font-semibold aria-[current=page]:text-foreground data-[state=open]:text-foreground";

function TabIcon({
  icon: Icon,
  active,
  count,
}: {
  icon: LucideIcon;
  active: boolean;
  count?: number;
}) {
  return (
    <span
      className={cn(
        "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
        active ? "bg-primary/15 text-primary" : "group-hover:bg-muted",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {count ? (
        <span className="bg-brand text-brand-foreground absolute -top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
          {formatNavCount(count)}
          <span className="sr-only"> pending</span>
        </span>
      ) : null}
    </span>
  );
}

/** Phone (< 640 px) bottom navigation: primary destinations plus a "More" sheet. */
export function MobileTabBar({
  role,
  counts,
}: {
  role: Role;
  counts?: NavCounts;
}) {
  const pathname = usePathname();
  const { primary, more } = getMobileNavForRole(role);
  const moreActive = more.some((item) => isNavItemActive(item.href, pathname));
  const columns = primary.length + (more.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label="Main"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {primary.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={tabClass}
              >
                <TabIcon
                  icon={item.icon}
                  active={active}
                  count={counts?.[item.href]}
                />
                <span className="max-w-full truncate px-1">
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
        {more.length > 0 ? (
          <li>
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    tabClass,
                    moreActive && "text-foreground font-semibold",
                  )}
                >
                  <TabIcon icon={Ellipsis} active={moreActive} />
                  <span>More</span>
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[85dvh] gap-0 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              >
                <SheetHeader className="pb-2">
                  <SheetTitle>More</SheetTitle>
                  <SheetDescription>
                    Everything else in {siteConfig.name}.
                  </SheetDescription>
                </SheetHeader>
                <ul className="flex flex-col gap-1 overflow-y-auto px-2">
                  {more.map((item) => (
                    <li key={item.href}>
                      <MoreLink
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        active={isNavItemActive(item.href, pathname)}
                        count={counts?.[item.href]}
                      />
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function MoreLink({
  href,
  icon: Icon,
  label,
  description,
  active,
  count,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  active: boolean;
  count?: number;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "hover:bg-muted focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none focus-visible:ring-3",
          active && "bg-muted",
        )}
      >
        <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn("text-sm font-medium", active && "font-semibold")}
          >
            {label}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {description}
          </span>
        </span>
        {count ? (
          <span className="bg-brand text-brand-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
            {formatNavCount(count)}
            <span className="sr-only"> pending</span>
          </span>
        ) : null}
      </Link>
    </SheetClose>
  );
}
