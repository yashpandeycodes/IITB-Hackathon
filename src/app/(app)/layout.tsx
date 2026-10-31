import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getDemoAccount } from "@/config/demo-accounts";
import type { Role } from "@/lib/contracts/enums";

export default function AppLayout({ children }: { children: ReactNode }) {
  // Until auth lands, everyone sees the admin shell. Replace with the session's user and role.
  const role: Role = "admin";
  const account = getDemoAccount(role);

  return (
    <AppShell role={role} user={{ name: account.name, email: account.email }}>
      {children}
    </AppShell>
  );
}
