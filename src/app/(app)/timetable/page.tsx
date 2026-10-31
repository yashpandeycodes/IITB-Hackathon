import { CalendarDays, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Timetables",
};

export default function TimetablePage() {
  return (
    <>
      <PageHeader
        title="Timetables"
        description="Weekly grids for any student group, faculty member or room, with Regular, Spectra and Exam week views."
      />
      <EmptyState
        icon={CalendarDays}
        title="No timetable to show yet"
        description="Once a timetable is generated, pick a group, faculty member or room to see its week. Labs span three periods and Week 7 overrides are marked."
        cta={{ label: "Generate timetable", href: "/admin", icon: Sparkles }}
      />
    </>
  );
}
