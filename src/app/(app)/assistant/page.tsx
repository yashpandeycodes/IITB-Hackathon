import { Bot, GitPullRequestArrow } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "AI assistant",
};

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="AI assistant"
        description="Ask in plain words to move a class, find a free slot or explain a placement."
      />
      <EmptyState
        icon={Bot}
        title="No conversations yet"
        description="Ask things like “Move my Friday 3 PM lecture to Thursday morning”. Every option the assistant suggests is checked by the constraint engine first."
        cta={{
          label: "Request a change",
          href: "/changes",
          icon: GitPullRequestArrow,
        }}
      />
    </>
  );
}
