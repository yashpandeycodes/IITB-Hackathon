import { FlaskConical, Layers, Ticket, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { formatDay } from "@/lib/format";
import { DAYS } from "@/lib/contracts/enums";
import { cn } from "@/lib/utils";

type Block = {
  day: number;
  from: number;
  span?: number;
  className: string;
  children: ReactNode;
};

const BLOCKS: Block[] = [
  {
    day: 1,
    from: 1,
    className:
      "border-kind-lecture bg-kind-lecture-subtle text-kind-lecture-foreground",
    children: "MA101 · L",
  },
  {
    day: 1,
    from: 2,
    span: 3,
    className: "border-kind-lab bg-kind-lab-subtle text-kind-lab-foreground",
    children: (
      <>
        <FlaskConical className="size-3" /> PH191 · P
      </>
    ),
  },
  {
    day: 2,
    from: 2,
    className:
      "border-kind-tutorial bg-kind-tutorial-subtle text-kind-tutorial-foreground",
    children: "MA101 · T",
  },
  {
    day: 2,
    from: 4,
    className:
      "border-kind-lecture bg-kind-lecture-subtle text-kind-lecture-foreground",
    children: "CS202 · L",
  },
  {
    day: 3,
    from: 1,
    span: 2,
    className:
      "border border-dashed border-override bg-override-subtle text-override-foreground",
    children: (
      <>
        <Zap className="size-3" /> Week 7 only
      </>
    ),
  },
  {
    day: 3,
    from: 4,
    className:
      "border-kind-basket bg-kind-basket-subtle text-kind-basket-foreground",
    children: (
      <>
        <Layers className="size-3" /> OEB-1
      </>
    ),
  },
  {
    day: 4,
    from: 3,
    span: 3,
    className:
      "border-booking bg-booking-subtle bg-hatch text-booking-foreground",
    children: (
      <>
        <Ticket className="size-3" /> Spectra
      </>
    ),
  },
  {
    day: 5,
    from: 1,
    className:
      "border-kind-lecture bg-kind-lecture-subtle text-kind-lecture-foreground",
    children: "EE201 · L",
  },
  {
    day: 5,
    from: 3,
    className:
      "border-kind-tutorial bg-kind-tutorial-subtle text-kind-tutorial-foreground",
    children: "CS202 · T",
  },
];

/** Decorative mini week grid for the login brand panel, drawn with the semantic tokens. */
export function WeekPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-card/60 rounded-xl border p-3 shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      <div className="text-muted-foreground grid grid-cols-5 gap-1.5 pb-1.5 text-center text-[11px] font-medium">
        {DAYS.map((day) => (
          <span key={day}>{formatDay(day)}</span>
        ))}
      </div>
      <div className="grid grid-cols-5 grid-rows-[repeat(5,1.75rem)] gap-1.5">
        {BLOCKS.map((block) => (
          <div
            key={`${block.day}-${block.from}`}
            style={{
              gridColumn: block.day,
              gridRow: `${block.from} / span ${block.span ?? 1}`,
            }}
            className={cn(
              "flex min-w-0 items-start gap-1 truncate rounded-md border-l-[3px] px-1.5 py-1 font-mono text-[10px] leading-tight font-semibold",
              block.className,
            )}
          >
            {block.children}
          </div>
        ))}
      </div>
    </div>
  );
}
