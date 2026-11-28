"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const INTERVALS = [
  {
    band: "XS",
    usd: "$3–$6",
    work: "Typos, links, trivial fixes",
    row: "bg-emerald-500/15 text-emerald-200",
    pip: "bg-emerald-400",
  },
  {
    band: "S",
    usd: "$6–$12",
    work: "Short wiki, small PR",
    row: "bg-sky-500/15 text-sky-200",
    pip: "bg-sky-400",
  },
  {
    band: "M",
    usd: "$12–$25",
    work: "Medium change + tests",
    row: "bg-amber-500/15 text-amber-200",
    pip: "bg-amber-400",
  },
  {
    band: "L",
    usd: "$50–$120",
    work: "Multi-file feature",
    row: "bg-orange-500/15 text-orange-200",
    pip: "bg-orange-400",
  },
  {
    band: "XL",
    usd: "$120–$220",
    work: "Large PR / multi-day",
    row: "bg-violet-500/15 text-violet-200",
    pip: "bg-violet-400",
  },
];

export function RewardAmountHint() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-5 sm:w-5"
          aria-label="Suggested bounty amount intervals"
        >
          <CircleHelp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="z-[80] w-[min(26rem,calc(100vw-1.5rem))] border-border/60 bg-zinc-950 p-4 text-zinc-100 shadow-xl"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-100">
              Suggest ZEC from a USD band
            </p>
            <p className="text-xs leading-relaxed text-zinc-400">
              This field stores ZEC only. Pick a band, then enter{" "}
              <span className="font-mono text-zinc-200">USD / spot</span>.
              Prefer the lower half.
            </p>
          </div>
          <div className="space-y-1.5">
            {INTERVALS.map((row) => (
              <div
                key={row.band}
                className={`grid grid-cols-[auto_2rem_minmax(5.5rem,auto)_1fr] items-center gap-x-2 rounded-md px-2.5 py-1.5 text-xs ${row.row}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${row.pip}`} />
                <span className="font-bold">{row.band}</span>
                <span className="whitespace-nowrap font-semibold">
                  {row.usd}
                </span>
                <span className="min-w-0 leading-snug opacity-90">
                  {row.work}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/docs/bounty-amounts"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-xs font-medium text-yellow-300 hover:text-yellow-200 hover:underline"
          >
            Amount guide →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
