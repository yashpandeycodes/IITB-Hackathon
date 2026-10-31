import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_EXPIRED_PATH } from "@/lib/auth/server-session";
import { SessionProvider } from "@/components/providers/session-provider";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect(SESSION_EXPIRED_PATH);
  }

  return (
    <SessionProvider user={user}>
      {children}
    </SessionProvider>
  );
}

