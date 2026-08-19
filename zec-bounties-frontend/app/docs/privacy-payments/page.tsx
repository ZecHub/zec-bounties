import type { Metadata } from "next";
import Link from "next/link";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy & payments | ZEC Bounties Docs",
  description:
    "How shielded payouts work on ZEC Bounties and what the platform does not collect.",
};

export default function PrivacyPaymentsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Privacy & payments
        </h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          The platform is built around shielded ZEC. Transparent-only payouts
          are not supported.
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Design goal</p>
          <p className="text-muted-foreground mt-1">
            Contributors receive value privately. Creators and the platform do
            not need transparent-only addresses to complete a payout.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we require</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            A Unified Address with at least one shielded receiver (Ironwood /
            Sapling preferred)
          </li>
          <li>
            <strong className="text-foreground">Preferred:</strong> UA with
            shielded receivers only
          </li>
          <li>
            <strong className="text-foreground">Allowed with caution:</strong>{" "}
            UA with both shielded and transparent receivers — payouts still use
            the shielded path; the transparent component is a general privacy
            risk outside this platform
          </li>
          <li>
            Full rules:{" "}
            <Link
              href="/docs/addresses"
              className="text-primary hover:underline"
            >
              Addresses
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we do not need</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>Your seed phrase or spending keys for normal use</li>
          <li>A transparent-only address for receiving bounty payments</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Never paste a seed into the site. Only the receive address is used for
          payouts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How a payout works</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>Work is approved and the bounty is marked ready for payment.</li>
          <li>
            The system resolves the assignee’s registered shielded address and
            the paying wallet (personal or team).
          </li>
          <li>
            A shielded send is constructed (amount in zatoshis, memo with bounty
            context where used).
          </li>
          <li>
            On success, payment state and transaction ID are stored so either
            party can verify on-chain.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Transparency vs privacy</h2>
        <p className="text-sm text-muted-foreground">
          Transaction IDs let you confirm that a payment occurred. Shielded
          transfers still protect address linkage and amounts according to
          Zcash’s protocol properties. The platform records the txid for
          operational verification — not to force transparent flows.
        </p>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link href="/docs/faq" className="text-primary hover:underline">
          FAQ →
        </Link>
      </p>
    </div>
  );
}