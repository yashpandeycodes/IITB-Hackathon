import { CalendarPlus, DoorOpen, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** KPI cards from docs/frontend.md §5.2; values arrive with GET /api/dashboard. */
const KPIS = [
  { label: "Sessions scheduled", hint: "of all sessions", href: "/timetable" },
  { label: "Hard violations", hint: "must stay at 0", href: "/admin" },
  { label: "Soft penalty", hint: "lower is better", href: "/admin" },
  { label: "Booking score", hint: "Spectra week", href: "/spectra" },
  {
    label: "Pending approvals",
    hint: "changes and bookings",
    href: "/approvals",
  },
  { label: "Room utilisation", hint: "teaching hours", href: "/rooms" },
] as const;

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow={`Week 7 · ${siteConfig.festWeek}`}
        title="Dashboard"
        description="Timetable health, Spectra bookings and approvals at a glance."
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/rooms">
                <DoorOpen aria-hidden="true" />
                Find a room
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/admin">
                <Sparkles aria-hidden="true" />
                Generate timetable
              </Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="kpi-heading" className="flex flex-col gap-6">
        <h2 id="kpi-heading" className="sr-only">
          Key numbers
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          {KPIS.map((kpi) => (
            <li key={kpi.label}>
              <Link
                href={kpi.href}
                className="group/kpi focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-3"
              >
                <Card
                  size="sm"
                  className="group-hover/kpi:ring-primary/30 h-full gap-1 shadow-sm transition-colors"
                >
                  <CardHeader className="gap-1">
                    <CardDescription className="text-xs font-medium">
                      {kpi.label}
                    </CardDescription>
                    <CardTitle className="text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">not available yet</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-xs">
                    {kpi.hint}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        <EmptyState
          icon={CalendarPlus}
          title="No timetable yet"
          description="Generate the Week 7 timetable to see clashes, room use and Spectra decisions here."
        />
      </section>
    </>
  );
}
