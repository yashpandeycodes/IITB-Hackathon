import { Settings2, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Load data, generate timetables, run Spectra decisions, validate and export."
      />
      <EmptyState
        icon={Settings2}
        title="No timetable generated"
        description="Generate the timetable and exams, run Spectra decisions, validate every hard rule and export schedule.json."
      >
        <div className="flex flex-col items-center gap-2">
          <Button size="lg" disabled aria-describedby="generate-note">
            <Sparkles aria-hidden="true" />
            Generate timetable
          </Button>
          <p id="generate-note" className="text-muted-foreground text-xs">
            Available once the scheduling engine is connected.
          </p>
        </div>
      </EmptyState>
    </>
  );
}
