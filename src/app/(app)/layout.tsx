import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers/providers";
import { getDemoAccount } from "@/config/demo-accounts";
import { siteConfig } from "@/config/site";
import type { Role } from "@/lib/contracts/enums";

export const metadata: Metadata = {
  title: { template: `%s · ${siteConfig.name}`, default: siteConfig.name },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  // Until auth lands, everyone sees the admin shell. Replace with the session's user and role.
  const role: Role = "admin";
  const account = getDemoAccount(role);

  return (
    <Providers>
      <AppShell role={role} user={{ name: account.name, email: account.email }}>
        {children}
      </AppShell>
    </Providers>
  );
}
