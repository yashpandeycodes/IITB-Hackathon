"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { RoleBadge } from "@/components/layout/role-badge";
import { SearchButton } from "@/components/layout/search-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu, type ShellUser } from "@/components/layout/user-menu";
import { findActiveNavItem } from "@/config/nav";
import { siteConfig } from "@/config/site";
import type { Role } from "@/lib/contracts/enums";

/** Sticky top bar: section breadcrumb, ⌘K search, role badge and the account menu. */
export function AppTopbar({ role, user }: { role: Role; user: ShellUser }) {
  const pathname = usePathname();
  const section = findActiveNavItem(pathname);

  return (
    <header className="bg-background/90 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm md:px-6">
      <Link
        href="/dashboard"
        className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-3 sm:hidden"
      >
        <BrandMark />
        <span className="sr-only">{siteConfig.name} dashboard</span>
      </Link>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <li className="text-muted-foreground hidden items-center gap-1.5 md:flex">
            <Link
              href="/dashboard"
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3"
            >
              {siteConfig.name}
            </Link>
            {section ? (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            ) : null}
          </li>
          {section ? (
            <li className="min-w-0 truncate font-semibold" aria-current="page">
              {section.label}
            </li>
          ) : null}
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <SearchButton />
        <NotificationBell />
        <RoleBadge role={role} compactOnPhone />
        <UserMenu user={user} role={role} />
      </div>
    </header>
  );
}
