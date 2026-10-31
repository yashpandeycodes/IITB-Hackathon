"use client";

import { Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { CITLogo } from "@/components/brand/logo";
import { BrandMark } from "@/components/layout/brand-mark";
import { formatNavCount, type NavCounts } from "@/components/layout/nav-count";
import { useMediaQuery } from "@/components/layout/use-media-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNavForRole, isNavItemActive, type NavItem } from "@/config/nav";
import { siteConfig } from "@/config/site";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/utils";

/** Tailwind `sm` up to (not including) `lg`: the icon-rail range. */
const RAIL_QUERY = "(min-width: 40rem) and (max-width: 63.98rem)";

/**
 * Desktop navigation. ≥ 1024 px: full-width sidebar with labels.
 * 640–1023 px: icon rail with tooltips. Hidden on phones (bottom tab bar instead).
 */
export function AppSidebar({
  role,
  counts,
}: {
  role: Role;
  counts?: NavCounts;
}) {
  const pathname = usePathname();
  const isRail = useMediaQuery(RAIL_QUERY);
  const items = getNavForRole(role);

  return (
    <div className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r sm:flex lg:w-64">
      <div className="border-sidebar-border flex h-14 shrink-0 items-center border-b px-4 max-lg:justify-center max-lg:px-0">
        <Link
          href="/dashboard"
          className="focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3"
        >
          <BrandMark className="lg:hidden" />
          <span className="hidden lg:block" aria-hidden="true">
            <CITLogo size="sm" showSubtitle={false} />
          </span>
          <span className="sr-only">{siteConfig.name}</span>
        </Link>
      </div>

      <nav
        aria-label="Main"
        className="flex-1 overflow-y-auto px-2 py-3 lg:px-3"
      >
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const link = (
              <SidebarLink
                item={item}
                active={isNavItemActive(item.href, pathname)}
                count={counts?.[item.href]}
              />
            );
            return (
              <li key={item.href}>
                {isRail ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-sidebar-border hidden shrink-0 border-t p-3 lg:block">
        <div className="border-override/30 bg-override/10 text-override-foreground flex items-start gap-2.5 rounded-lg border p-3">
          <Zap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-relaxed">
            <span className="font-semibold">
              Week 7 · {siteConfig.festWeek}
            </span>
            <br />
            Classes, events and exams share every room. Zero clashes.
          </p>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  count,
  ...props
}: {
  item: NavItem;
  active: boolean;
  count?: number;
} & Omit<ComponentProps<typeof Link>, "href">) {
  const Icon = item.icon;
  return (
    <Link
      // Tooltip trigger props (aria-describedby, handlers) arrive via `props` in rail mode.
      {...props}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none",
        "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-3",
        "max-lg:justify-center max-lg:px-0",
        active &&
          "bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary font-semibold before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only lg:truncate">{item.label}</span>
      {count ? (
        <span className="bg-brand text-brand-foreground ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums max-lg:absolute max-lg:top-0.5 max-lg:right-0.5 max-lg:h-4 max-lg:min-w-4 max-lg:px-1 max-lg:text-[10px]">
          {formatNavCount(count)}
          <span className="sr-only"> pending</span>
        </span>
      ) : null}
    </Link>
  );
}
