import { PartyPopper, Ticket } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { siteConfig } from "@/config/site";
import { DAYS } from "@/lib/contracts/enums";
import { DEFAULT_PERIODS, formatDay, formatPeriod } from "@/lib/format";

export const metadata: Metadata = {
  title: "Spectra week",
};

export default function SpectraPage() {
  const firstDay = formatDay(DAYS[0], "long");
  const lastDay = formatDay(DAYS[DAYS.length - 1], "long");
  const firstPeriod = formatPeriod(DEFAULT_PERIODS[0].id);
  const lastPeriod = formatPeriod(
    DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1].id,
  );

  return (
    <>
      <PageHeader
        title="Spectra week"
        description={`Every Week 7 (${siteConfig.festWeek}) event decision: approved, alternative offered or rejected, with the reason.`}
      />
      <EmptyState
        icon={PartyPopper}
        title="No Spectra decisions yet"
        description={`Once requests are decided, this board lists every ${siteConfig.festWeek} request by priority, with a room timeline from ${firstDay} to ${lastDay}, ${firstPeriod}–${lastPeriod}.`}
        cta={{ label: "Book a venue", href: "/bookings", icon: Ticket }}
      />
    </>
  );
}
