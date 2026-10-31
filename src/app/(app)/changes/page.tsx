import { GitPullRequestArrow, Plus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Changes",
};

export default function ChangesPage() {
  return (
    <>
      <PageHeader
        title="Changes"
        description="Faculty leave, room closures and session changes, from request to approved fix."
      />
      <EmptyState
        icon={GitPullRequestArrow}
        title="No change requests yet"
        description="Report a disruption such as faculty leave or a room closure, or upload a change file. The system proposes the smallest fix with zero hard clashes."
        cta={{ label: "Report a disruption", href: "/changes", icon: Plus }}
      />
    </>
  );
}
