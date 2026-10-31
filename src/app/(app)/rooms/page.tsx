import { CalendarDays, DoorOpen } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { DAYS } from "@/lib/contracts/enums";
import { DEFAULT_PERIODS, formatDay, formatPeriod } from "@/lib/format";

export const metadata: Metadata = {
  title: "Find a room",
};

export default function RoomsPage() {
  const firstDay = formatDay(DAYS[0], "long");
  const lastDay = formatDay(DAYS[DAYS.length - 1], "long");
  const firstPeriod = formatPeriod(DEFAULT_PERIODS[0].id);
  const lastPeriod = formatPeriod(
    DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1].id,
  );

  return (
    <>
      <PageHeader
        title="Find a room"
        description="Search free rooms by day, time, capacity and facilities, then book one in a tap."
      />
      <EmptyState
        icon={DoorOpen}
        title="Free rooms appear here"
        description={`Filter by day (${firstDay} to ${lastDay}), periods ${firstPeriod}–${lastPeriod}, capacity and needs such as a projector, PA system or step-free access. Each room shows Free or Busy with the reason.`}
        cta={{
          label: "View timetables",
          href: "/timetable",
          icon: CalendarDays,
        }}
      />
    </>
  );
}
