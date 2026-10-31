import { ChevronDown, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Collapsible email/password form (native <details>, no client JS). Submitting is
 * disabled until the auth API ships; the helper text says so.
 */
export function EmailSignIn() {
  return (
    <details className="group bg-card rounded-xl border shadow-sm">
      <summary className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium outline-none select-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <KeyRound
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          Sign in with email and password
        </span>
        <ChevronDown
          className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <form className="grid gap-4 border-t px-4 pt-4 pb-5" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="admin@cit.demo"
            className="h-10"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-10"
          />
        </div>
        <Button type="submit" size="lg" disabled aria-describedby="login-note">
          Sign in
        </Button>
        <p
          id="login-note"
          className="text-muted-foreground text-xs text-pretty"
        >
          Email sign-in isn&apos;t switched on yet, so use a demo account above.
          Demo passwords are listed in the README.
        </p>
      </form>
    </details>
  );
}
