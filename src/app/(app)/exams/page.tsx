import { CalendarDays, NotebookPen } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ExamDay } from "@/lib/contracts/enums";
import { formatDay, formatExamSession } from "@/lib/format";

export const metadata: Metadata = {
  title: "Exams",
};

export default function ExamsPage() {
  const days = ExamDay.options;
  const firstDay = formatDay(days[0], "long");
  const lastDay = formatDay(days[days.length - 1], "long");

  return (
    <>
      <PageHeader
        title="Exams"
        description={`Exam week grid with morning (${formatExamSession("AM")}) and afternoon (${formatExamSession("PM")}) slots.`}
      />
      <EmptyState
        icon={NotebookPen}
        title="No exam schedule yet"
        description={`Once exams are scheduled, each slot from ${firstDay} to ${lastDay} lists its papers, groups and rooms, with at most one exam per group per day.`}
        cta={{
          label: "View timetables",
          href: "/timetable",
          icon: CalendarDays,
        }}
      />
    </>
  );
}
