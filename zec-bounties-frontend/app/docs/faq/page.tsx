import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ | ZEC Bounties Docs",
  description: "Common questions about ZEC Bounties, addresses, and payments.",
};

const FAQS = [
  {
    q: "Why was my transparent address rejected?",
    a: (
      <>
        Payouts are shielded-only. Provide a Unified Address with a shielded
        receiver (Ironwood / Sapling preferred). See{" "}
        <Link href="/docs/addresses" className="text-primary hover:underline">
          Addresses
        </Link>
        .
      </>
    ),
  },
  {
    q: "What address should I use?",
    a: (
      <>
        Preferred: a UA with <strong>shielded receivers only</strong> (Ironwood
        / Sapling). A UA that also includes a transparent receiver is{" "}
        <strong>allowed</strong>, with a warning — see{" "}
        <Link href="/docs/addresses" className="text-primary hover:underline">
          Addresses
        </Link>
        . Transparent-only addresses are rejected.
      </>
    ),
  },
  {
    q: "Can I use a UA that has both shielded and transparent receivers?",
    a: (
      <>
        Yes. It is accepted as long as a shielded receiver is present. Platform
        payouts use the shielded path. The transparent receiver can still
        receive public funds if used elsewhere — prefer shielded-only when your
        wallet allows it.
      </>
    ),
  },
  {
    q: "Can I change my payout address later?",
    a: (
      <>
        Yes. Update it in{" "}
        <Link href="/profile" className="text-primary hover:underline">
          Profile
        </Link>
        . Future payments use the address on file when the payment runs.
      </>
    ),
  },
  {
    q: "My work was approved but I have not been paid.",
    a: (
      <>
        Confirm the bounty is marked done / payment authorized. If it stays
        stuck, contact the bounty creator or ZecHub admins. Check that your
        registered UA is still valid.
      </>
    ),
  },
  {
    q: "Do I need to share my seed phrase?",
    a: (
      <>
        No. For normal use the platform only needs your receive address. Never
        paste a seed or spending key into the site.
      </>
    ),
  },
  {
    q: "Is this mainnet?",
    a: (
      <>
        Yes. Live payouts use mainnet ZEC. Treat amounts and addresses as real
        value.
      </>
    ),
  },
  {
    q: "Where do I get help?",
    a: (
      <>
        <a
          href="https://github.com/ZecHub/zec-bounties/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          GitHub issues
        </a>
        , ZecHub Discord / community channels, or{" "}
        <a
          href="https://x.com/ZecHub"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          @ZecHub
        </a>
        .
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">FAQ</h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Common questions about addresses, payouts, and using the platform.
        </p>
      </div>

      <div className="space-y-6">
        {FAQS.map((item) => (
          <div key={item.q} className="border-b pb-6 last:border-0">
            <h2 className="text-base font-semibold">{item.q}</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {item.a}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Back to{" "}
        <Link href="/docs" className="text-primary hover:underline">
          Overview
        </Link>
      </p>
    </div>
  );
}