import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DemoAccount } from "@/config/demo-accounts";
import { ROLE_META } from "@/config/roles";
import { cn } from "@/lib/utils";

/** One-click demo login card. Until auth lands, "Continue" goes straight to the dashboard. */
export function DemoAccountCard({ account }: { account: DemoAccount }) {
  const role = ROLE_META[account.role];
  const Icon = role.icon;
  const headingId = `demo-${account.id}`;

  return (
    <Card
      role="group"
      aria-labelledby={headingId}
      className="h-full shadow-sm transition-shadow hover:shadow-md"
    >
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
        <span
          aria-hidden="true"
          className={cn(
            "row-span-2 flex size-10 items-center justify-center rounded-lg",
            role.tone,
          )}
        >
          <Icon className="size-5" />
        </span>
        <CardTitle id={headingId} className="font-semibold">
          <h3>{account.title}</h3>
        </CardTitle>
        <CardDescription className="truncate">{account.name}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-muted-foreground hidden flex-1 text-sm text-pretty sm:block">
          {account.description}
        </p>
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Email: </span>
          <span className="truncate font-mono">{account.email}</span>
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/dashboard">
            Continue as {account.title}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
