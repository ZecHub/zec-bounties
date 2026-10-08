import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Coins,
  DollarSign,
  ListChecks,
  RefreshCw,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Bounty amounts | ZEC Bounties Docs",
  description:
    "Guide for suggesting bounty rewards. The form takes ZEC only; use implicit USD intervals to pick a fair amount.",
};

const INTERVALS = [
  {
    band: "XS",
    usd: "$15–$25",
    work: "Newsletter edition, broken-link fix, small copy edit",
    card: "border-emerald-300/80 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/40",
    badge: "bg-emerald-500 text-white",
    usdColor: "text-emerald-700 dark:text-emerald-300",
  },
  {
    band: "S",
    usd: "$25–$50",
    work: "New short wiki page, accepted translation, small docs PR",
    card: "border-sky-300/80 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/40",
    badge: "bg-sky-500 text-white",
    usdColor: "text-sky-700 dark:text-sky-300",
  },
  {
    band: "M",
    usd: "$50–$120",
    work: "Substantial wiki or tutorial (video), medium application change",
    card: "border-amber-300/80 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40",
    badge: "bg-amber-500 text-white",
    usdColor: "text-amber-700 dark:text-amber-300",
  },
  {
    band: "L",
    usd: "$120–$250",
    work: "Multi-file feature, wallet/tooling work, longer research",
    card: "border-orange-300/80 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-950/40",
    badge: "bg-orange-500 text-white",
    usdColor: "text-orange-700 dark:text-orange-300",
  },
  {
    band: "XL",
    usd: "$250–$400",
    work: "Large approved PR or multi-day engineering task",
    card: "border-violet-300/80 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-950/40",
    badge: "bg-violet-500 text-white",
    usdColor: "text-violet-700 dark:text-violet-300",
  },
];

export default function BountyAmountsPage() {
  return (
    <div className="space-y-10">
      <div>
        <Badge
          variant="outline"
          className="mb-4 border-yellow-400/50 bg-yellow-50 text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-950/50 dark:text-yellow-200"
        >
          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
          Suggestion guide
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Bounty amounts
        </h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Guide for anyone creating or suggesting a bounty. The form only asks
          for a ZEC reward. There is no USD field.
        </p>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Use a USD interval when you pick that ZEC number so the reward stays
          fair as the rate moves. Payouts are always shielded ZEC. USD is only
          a planning unit.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-yellow-400/70 bg-gradient-to-br from-yellow-100 to-yellow-300 p-4 dark:border-yellow-400/40 dark:from-yellow-900/40 dark:to-yellow-700/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-yellow-950 dark:text-yellow-100">
            <Coins className="h-4 w-4" />
            What you enter
          </p>
          <p className="mt-1 text-sm text-yellow-900/90 dark:text-yellow-100/80">
            Reward (ZEC) — the only amount field on the form.
          </p>
        </div>
        <div className="rounded-xl border border-yellow-300/70 bg-gradient-to-br from-yellow-50 to-amber-100 p-4 dark:border-yellow-500/30 dark:from-yellow-950/50 dark:to-amber-950/30">
          <p className="flex items-center gap-2 text-sm font-semibold text-yellow-900 dark:text-yellow-200">
            <DollarSign className="h-4 w-4" />
            What you use to choose it
          </p>
          <p className="mt-1 text-sm text-yellow-800/90 dark:text-yellow-200/80">
            Implicit USD band ÷ current ZEC/USD spot.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Suggesting an amount</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Match the work to an interval below.</li>
          <li>Pick a USD target inside that band — not automatically the top.</li>
          <li>
            Look up a public ZEC/USD spot (CoinGecko, Coinbase, Kraken, or
            Binance).
          </li>
          <li>
            Convert with{" "}
            <code className="text-foreground">usd_target / zec_usd_spot</code>.
          </li>
          <li>
            Type that ZEC value into <strong>Reward (ZEC)</strong>. Round to 4
            decimal places.
          </li>
          <li>
            Optional but useful: mention the USD band and the spot you used in
            the description so reviewers can check the conversion.
          </li>
        </ol>
        <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-sky-500/10 to-violet-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Example
          </p>
          <p className="mt-2 text-sm text-foreground">
            Short wiki page, S band, $40 target, spot $800 / ZEC → enter{" "}
            <strong>0.05 ZEC</strong>.
          </p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you only remember old frozen tips (0.05 ZEC newsletter, 0.08 ZEC
          wiki), those were snapshots at an older rate. Convert from the USD
          interval instead.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Suggested intervals</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These are what you should propose. Admins can still adjust before the
          bounty goes live.
        </p>
        <div className="grid gap-3">
          {INTERVALS.map((row) => (
            <div
              key={row.band}
              className={`rounded-xl border p-4 ${row.card}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-7 min-w-10 items-center justify-center rounded-full px-2 text-xs font-bold ${row.badge}`}
                >
                  {row.band}
                </span>
                <span className={`text-lg font-extrabold ${row.usdColor}`}>
                  {row.usd}
                </span>
                <span className="text-xs text-muted-foreground">
                  implicit USD
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground/80">{row.work}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Stay inside the band. Do not treat the top as the default.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Before a suggestion is submitted, an advisory pre-check compares its
          reward with these bands using a current ZEC/USD rate and looks for
          possible duplicates, clear completion criteria, and Zcash relevance.
          The check may be imprecise; it never blocks submission, and reviewers
          see the same result. For hunter suggestions, the suggestion and
          the full text and status of all public and private bounty records
          are sent to configured AI providers. Match details are not shown; only a
          generic submitted/completed label and similarity score are returned.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The form only stores ZEC</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          zec-bounties does not price in dollars and does not refresh the
          reward by itself. Whatever you enter in Reward (ZEC) is what the
          board shows and what a payout sends.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If the dollar rate has moved a lot between listing and pay, edit the
          ZEC field before authorizing payment so the implicit USD value is
          still in the same band.
        </p>
        <div className="rounded-xl border border-orange-300/80 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-950/30">
          <p className="flex items-center gap-2 font-semibold text-orange-900 dark:text-orange-200">
            <RefreshCw className="h-4 w-4" />
            Recompute the ZEC you entered when any of these is true
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-orange-950/80 dark:text-orange-100/80">
            <li>
              Spot has moved <strong>≥ 20%</strong> from the rate you used
            </li>
            <li>
              More than <strong>7 days</strong> since you set the amount
            </li>
            <li>Payment is about to run</li>
          </ul>
        </div>
        <div className="rounded-xl border border-sky-300/70 bg-sky-50 p-4 text-sm dark:border-sky-500/40 dark:bg-sky-950/30">
          <p className="font-semibold text-sky-900 dark:text-sky-200">
            Worked example
          </p>
          <p className="mt-2 text-sky-950/80 dark:text-sky-100/80">
            Suggested $40 (S) at $500 / ZEC → listed 0.0800 ZEC. Payout week
            spot $800 / ZEC → change the reward to 0.0500 ZEC. Same implied
            dollar value; different ZEC quantity.
          </p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If ZEC falls, the ZEC number should go up. Fund the paying wallet for
          that case. Do not change the implied USD band after assignment unless
          scope changed.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Rounding</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Enter ZEC to <strong>4 decimal places</strong>.
          </li>
          <li>
            Prefer rounding so the implied USD value does not sit more than
            about <strong>$1</strong> under the target you chose.
          </li>
          <li>Do not post dust below 0.0001 ZEC.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Hunters</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You will see a ZEC amount on the card, not a dollar amount. That ZEC
          number was chosen with the intervals above. If the listing looks off
          relative to the work, ask the creator or an admin which band they
          meant.
        </p>
      </section>

      <p className="flex flex-wrap items-center gap-2 border-t pt-6 text-sm text-muted-foreground">
        Next
        <Link
          href="/docs/creators"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Creators
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/docs/faq"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          FAQ
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
