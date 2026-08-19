import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Addresses | ZEC Bounties Docs",
  description:
    "Which Zcash addresses are accepted for payouts — Unified Addresses, Ironwood, Sapling, transparent.",
};

export default function AddressesPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Addresses</h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Payouts are shielded only. Your registered address must be able to
          receive shielded ZEC.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
          Preferred
        </p>
        <p className="text-sm text-foreground">
          A Unified Address with <strong>shielded receivers only</strong>{" "}
          (Ironwood and/or Sapling, no transparent receiver) is the best privacy
          match for this platform.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1">
          Allowed with caution
        </p>
        <p className="text-sm text-foreground">
          A UA that includes <strong>both shielded and transparent receivers</strong>{" "}
          is accepted for payouts, as long as a shielded receiver is present. Be
          aware: the transparent component can still receive public funds if
          someone sends to it. For bounty payouts on this platform, only the
          shielded path is used — but a mixed UA is not “shielded-only” in
          general wallet use.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Acceptance rules</h2>

        <div className="space-y-3">
          <Rule
            ok
            title="UA with shielded receivers only"
            detail="Ironwood and/or Sapling. No transparent component. Preferred."
          />
          <Rule
            ok
            title="UA with shielded and transparent receivers"
            detail="Allowed. Must include at least one shielded receiver. Transparent component is not used for platform payouts, but can still receive transparent funds outside this app — use with care."
          />
          <Rule
            ok={false}
            title="Transparent-only address (t1… / t3…)"
            detail="Rejected. The platform does not pay to transparent addresses."
          />
          <Rule
            ok={false}
            title="UA with only transparent receivers"
            detail="Rejected. A UA must include a shielded receiver to be valid for payouts."
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Receiver types</h2>
        <p className="text-sm text-muted-foreground">
          A Unified Address can embed one or more receivers. After NU6.3
          (Ironwood), the preferred shielded pool is Ironwood.
        </p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Receiver</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">For payouts</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 font-medium">Ironwood</td>
                <td className="px-3 py-2 text-muted-foreground">Shielded</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  Preferred
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Sapling</td>
                <td className="px-3 py-2 text-muted-foreground">Shielded</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  Accepted
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Transparent</td>
                <td className="px-3 py-2 text-muted-foreground">Public</td>
                <td className="px-3 py-2 text-amber-600 dark:text-amber-400">
                  Allowed in a UA only if a shielded receiver is also present
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground">
          Many modern wallets still show an Orchard-related receiver in the UA;
          after Ironwood activation, shielded receives are expected to land in
          the Ironwood pool. What matters for this platform is the presence of a
          shielded receiver — transparent-only addresses are not accepted.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How to register</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>Sign in with GitHub.</li>
          <li>
            Open{" "}
            <Link href="/profile" className="text-primary hover:underline">
              Profile
            </Link>{" "}
            (or the address prompt on first use).
          </li>
          <li>
            Paste a UA from a maintained wallet (Zashi, Zingo, YWallet, ZODL,
            etc.).
          </li>
          <li>
            Confirm the wallet can receive shielded funds. Prefer a UA without a
            transparent receiver when your wallet allows it.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Wallet / setup resources:{" "}
          <a
            href="https://zechub.wiki/developers"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            zechub.wiki/developers
          </a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Important
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Never paste a seed phrase or spending key into the platform. Only
            the address is needed for payouts.
          </li>
          <li>
            You can update your payout address later in Profile. Future payments
            use the address on file at payment time.
          </li>
          <li>
            Mainnet ZEC is real value. Double-check the address in your wallet
            before saving.
          </li>
          <li>
            A mixed UA (shielded + transparent) is valid here, but anything sent
            to the transparent receiver is public on-chain.
          </li>
        </ul>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link
          href="/docs/getting-started"
          className="text-primary hover:underline"
        >
          Getting started →
        </Link>
      </p>
    </div>
  );
}

function Rule({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className="mt-0.5">
        {ok ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <X className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{detail}</p>
      </div>
    </div>
  );
}