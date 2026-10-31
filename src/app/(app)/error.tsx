"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  return (
    <ErrorState
      title="Couldn't load this page"
      message="Something went wrong on our side. Try again, or head back to the dashboard."
      onRetry={retry}
      reference={digest}
      headingLevel="h1"
      className="my-6"
    >
      <Button asChild variant="outline" size="lg">
        <Link href="/dashboard">
          <LayoutDashboard aria-hidden="true" />
          Dashboard
        </Link>
      </Button>
    </ErrorState>
  );
}
