import { CalendarDays, DoorOpen, PartyPopper } from "lucide-react";
import type { Metadata } from "next";

import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { DEMO_ACCOUNTS } from "@/config/demo-accounts";
import { siteConfig } from "@/config/site";
import { getBundledDataset } from "@/lib/dataset";

import { DemoAccountCard } from "./_components/demo-account-card";
import { EmailSignIn } from "./_components/email-sign-in";
import { WeekPreview } from "./_components/week-preview";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  const dataset = getBundledDataset();
  const stats = [
    { icon: CalendarDays, value: dataset.sessions.length, label: "sessions" },
    { icon: DoorOpen, value: dataset.rooms.length, label: "rooms" },
    {
      icon: PartyPopper,
      value: dataset.booking_requests.length,
      label: "Spectra requests",
    },
  ];

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-1">
      {/* Brand panel: always dark, using the dark token set. */}
      <section
        aria-labelledby="login-title"
        className="dark bg-background text-foreground relative isolate flex flex-col gap-5 overflow-hidden px-5 py-6 sm:gap-8 sm:px-10 sm:py-10 lg:min-h-dvh lg:justify-between lg:px-12 lg:py-12"
      >
        <div
          aria-hidden="true"
          className="bg-brand/40 pointer-events-none absolute -top-32 -left-24 -z-10 size-96 rounded-full blur-3xl"
        />
        <div
          aria-hidden="true"
          className="bg-booking/25 pointer-events-none absolute -right-24 -bottom-40 -z-10 size-96 rounded-full blur-3xl"
        />

        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <div className="flex flex-col leading-tight">
            <span className="font-semibold">{siteConfig.name}</span>
            <span className="text-muted-foreground text-sm">
              {siteConfig.institute}
            </span>
          </div>
          <ThemeToggle className="-mr-2 ml-auto lg:hidden" />
        </div>

        <div className="flex max-w-xl flex-col gap-4 sm:gap-5">
          <p className="border-override/40 bg-override-subtle text-override-foreground inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            Week 7 · {siteConfig.festWeek}
          </p>
          <h1
            id="login-title"
            className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
          >
            <span className="from-kind-lecture-foreground via-override-foreground to-booking-foreground bg-linear-to-r bg-clip-text text-transparent">
              {siteConfig.themeLead}
            </span>
            {siteConfig.themeLine.slice(siteConfig.themeLead.length)}
          </h1>
          <p className="text-muted-foreground hidden max-w-lg text-base text-pretty sm:block">
            Classes, labs, Spectra events and exams share the same rooms in Week
            7. Plan them together, book venues in plain language and approve
            changes with a clear before and after.
          </p>
          <ul aria-label="Dataset at a glance" className="flex flex-wrap gap-2">
            {stats.map(({ icon: Icon, value, label }) => (
              <li
                key={label}
                className="bg-muted/60 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              >
                <Icon
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
                <span className="font-semibold tabular-nums">{value}</span>
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <WeekPreview className="hidden max-w-md lg:block" />
      </section>

      <section
        aria-labelledby="login-accounts-title"
        className="relative flex flex-col items-center justify-start px-4 py-6 sm:px-8 sm:py-8 lg:justify-center lg:px-12"
      >
        <ThemeToggle className="absolute top-4 right-4 hidden lg:inline-flex" />
        <div className="flex w-full max-w-xl flex-col gap-5 sm:gap-6">
          <div className="flex flex-col gap-1.5 lg:pr-10">
            <h2
              id="login-accounts-title"
              className="text-2xl font-semibold tracking-tight"
            >
              Sign in
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              Pick a demo account. Each role sees its own slice of the platform.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.id}>
                <DemoAccountCard account={account} />
              </li>
            ))}
          </ul>

          <EmailSignIn />
        </div>
      </section>
    </main>
  );
}
