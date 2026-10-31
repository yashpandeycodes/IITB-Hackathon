import { cn } from "@/lib/utils";

/**
 * Icon-only CIT Nexus mark for compact spots (rail sidebar, phone topbar). Same geometry
 * as the mark in `components/brand/logo.tsx`. Decorative: pair it with visible or sr-only text.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      className={cn("size-8 shrink-0", className)}
    >
      <circle
        cx="24"
        cy="24"
        r="21"
        stroke="rgba(102, 227, 240, 0.2)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <path
        d="M24 10L36 17V31L24 38L12 31V17L24 10Z"
        stroke="rgba(130, 121, 255, 0.4)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M24 10V24M36 17L24 24M36 31L24 24M24 38V24M12 31L24 24M12 17L24 24"
        stroke="rgba(102, 227, 240, 0.45)"
        strokeWidth="1.2"
      />
      <circle cx="24" cy="24" r="5" fill="#66E3F0" />
      <circle cx="24" cy="24" r="2.5" fill="#070A12" />
      <circle cx="24" cy="10" r="2.5" fill="#8279FF" />
      <circle cx="36" cy="17" r="2.5" fill="#66E3F0" />
      <circle cx="36" cy="31" r="2.5" fill="#8279FF" />
      <circle cx="24" cy="38" r="2.5" fill="#66E3F0" />
      <circle cx="12" cy="31" r="2.5" fill="#8279FF" />
      <circle cx="12" cy="17" r="2.5" fill="#66E3F0" />
    </svg>
  );
}
