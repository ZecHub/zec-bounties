import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ArrowRight, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Docs | ZEC Bounties",
  description:
    "User guide for ZEC Bounties — privacy-first bounties with shielded ZEC payouts.",
};

const LINKS = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    desc: "Sign in, set a payout address, choose Hunter or Team",
  },
  {
    href: "/docs/addresses",
    title: "Addresses",
    desc: "UA, Ironwood, Sapling — what is accepted and recommended",
  },
  {
    href: "/docs/hunters",
    title: "Hunters",
    desc: "Individual role — apply, submit, get paid",
  },
  {
    href: "/docs/teams",
    title: "Teams",
    desc: "Organization role — members, wallet, verification",
  },
  {
    href: "/docs/contributors",
    title: "Contributors",
    desc: "Browse, apply, submit work, receive ZEC",
  },
  {
    href: "/docs/creators",
    title: "Creators",
    desc: "Propose bounties, review work, pay out",
  },
  {
    href: "/docs/badges",
    title: "Badges",
    desc: "Task stars and specialty role badges",
  },
];

export default function DocsOverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Documentation
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          ZEC Bounties
        </h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Privacy-first bounty platform with native shielded ZEC payments.
          Post tasks, apply, submit work, and get paid without collecting
          addresses by hand.
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Shielded payouts only</p>
          <p className="text-muted-foreground mt-1">
            Register a Unified Address that includes a shielded receiver.
            Transparent-only addresses are rejected. Mixed UAs (shielded +
            transparent) are allowed with a warning.{" "}
            <Link href="/docs/addresses" className="text-primary hover:underline">
              Address rules →
            </Link>
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Start here</h2>
        <ul className="space-y-2">
          {LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex items-start justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
              >
                <div>
                  <p className="font-medium group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="text-sm text-muted-foreground border-t pt-6">
        <p>
          Full markdown docs also live in the{" "}
          <a
            href="https://github.com/ZecHub/zec-bounties/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub repo
          </a>
          .
        </p>
      </section>
    </div>
  );
}
