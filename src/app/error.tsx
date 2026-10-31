"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";

export default function RootError({
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
    <main className="flex min-h-dvh items-center justify-center p-4">
      <ErrorState
        title="Something went wrong"
        message="The page hit an unexpected error. Try again, or start over from the sign-in page."
        onRetry={retry}
        reference={digest}
        headingLevel="h1"
        className="w-full max-w-lg"
      >
        <Button asChild variant="outline" size="lg">
          <Link href="/login">
            <LogIn aria-hidden="true" />
            Sign in
          </Link>
        </Button>
      </ErrorState>
    </main>
  );
}
