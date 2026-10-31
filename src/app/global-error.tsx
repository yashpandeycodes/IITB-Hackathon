"use client";

import { LogIn } from "lucide-react";
import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

import "./globals.css";

/** Replaces the root layout when it fails, so it brings its own document and styles. */
export default function GlobalError({
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
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh font-sans antialiased">
        <title>{`Something went wrong · ${siteConfig.name}`}</title>
        <main className="flex min-h-dvh items-center justify-center p-4">
          <ErrorState
            title="Something went wrong"
            message={`${siteConfig.name} hit an unexpected error. Try again, or reload from the sign-in page.`}
            onRetry={retry}
            reference={digest}
            headingLevel="h1"
            className="w-full max-w-lg"
          >
            {/* A full page load, since the app shell itself failed. */}
            <a
              href="/login"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <LogIn aria-hidden="true" />
              Sign in
            </a>
          </ErrorState>
        </main>
      </body>
    </html>
  );
}
