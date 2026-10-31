import { Compass, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { BrandMark } from "@/components/layout/brand-mark";
import { EmptyState } from "@/components/states/empty-state";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `Page not found · ${siteConfig.name}`,
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="text-sm font-semibold">{siteConfig.name}</span>
      </div>
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description={
          <>
            <span className="font-mono">404</span> · The link may be old or
            mistyped. Every timetable, room and request is reachable from the
            dashboard.
          </>
        }
        cta={{
          label: "Go to the dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
        }}
        headingLevel="h1"
        className="w-full max-w-lg"
      />
    </main>
  );
}
