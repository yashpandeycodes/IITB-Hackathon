import { ClipboardCheck, GitPullRequestArrow } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Approvals",
};

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review proposed timetable changes and lab bookings before they go live."
      />
      <EmptyState
        icon={ClipboardCheck}
        title="No pending approvals"
        description="Change proposals and department lab bookings that need a decision will appear here, each with a before-and-after view."
        cta={{
          label: "View changes",
          href: "/changes",
          icon: GitPullRequestArrow,
        }}
      />
    </>
  );
}
