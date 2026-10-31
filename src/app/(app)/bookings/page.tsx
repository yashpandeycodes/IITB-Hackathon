import { DoorOpen, Ticket } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Bookings",
};

export default function BookingsPage() {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Request a venue in plain language or with the form, and follow every request to a decision."
      />
      <EmptyState
        icon={Ticket}
        title="No requests yet"
        description="Your venue requests will appear here with their status, room, time and the reason for each decision."
        cta={{ label: "Find a room", href: "/rooms", icon: DoorOpen }}
      />
    </>
  );
}
