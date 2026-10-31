import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import type { NavCounts } from "@/components/layout/nav-count";
import type { ShellUser } from "@/components/layout/user-menu";
import type { Role } from "@/lib/contracts/enums";

export type AppShellProps = {
  role: Role;
  user: ShellUser;
  /** Optional nav badges, e.g. `{ "/approvals": 3 }`. */
  counts?: NavCounts;
  children: ReactNode;
};

/**
 * Authenticated layout: sidebar (≥ 640 px), sticky top bar, page content and the
 * phone bottom tab bar (< 640 px). Only plain data crosses into the client parts.
 */
export function AppShell({ role, user, counts, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="focus:bg-background focus:ring-ring/50 sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-3"
      >
        Skip to content
      </a>
      <AppSidebar role={role} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar role={role} user={user} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:pb-8 md:px-6 md:pt-6"
        >
          {children}
        </main>
      </div>
      <MobileTabBar role={role} counts={counts} />
    </div>
  );
}
