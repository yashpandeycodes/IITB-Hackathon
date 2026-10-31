"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/lib/contracts/user";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error("useSessionUser must be used within a SessionProvider");
  }
  return user;
}

export function useOptionalSessionUser(): SessionUser | null {
  return useContext(SessionContext);
}

