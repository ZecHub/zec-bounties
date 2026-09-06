import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Getting started | ZEC Bounties Docs",
  description:
    "Sign in, set a shielded payout address, choose Hunter or Team, and start using ZEC Bounties.",
};

export default function GettingStartedPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Getting started
        </h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Four steps to use the platform.
        </p>
      </div>

      <ol className="space-y-6">
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            1
          </span>
          <div>
            <p className="font-medium">Sign in with GitHub</p>
            <p className="text-sm text-muted-foreground mt-1">
              Open{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              and authorize the app. Your GitHub identity is used for
              authentication and profile basics. New accounts start as{" "}
              <strong>Client</strong>.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            2
          </span>
          <div>
            <p className="font-medium">Register a payout address</p>
            <p className="text-sm text-muted-foreground mt-1">
              Provide a Unified Address that includes a shielded receiver
              (Ironwood / Sapling). Transparent-only addresses are rejected. A
              UA that also has a transparent receiver is allowed, but prefer
              shielded-only when you can. See{" "}
              <Link
                href="/docs/addresses"
                className="text-primary hover:underline"
              >
                Addresses
              </Link>
              .
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            3
          </span>
          <div>
            <p className="font-medium">Choose how you work the board</p>
            <p className="text-sm text-muted-foreground mt-1">
              Onboarding asks you to pick <strong>one</strong> role. Normal
              accounts cannot change it later.{" "}
              <Link
                href="/docs/hunters"
                className="text-primary hover:underline"
              >
                Hunter
              </Link>
              : take on bounties and get paid.{" "}
              <Link href="/docs/teams" className="text-primary hover:underline">
                Team
              </Link>
              : post and fund work as a group. Admin is granted separately.
            </p>
          </div>
        </li>

        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            4
          </span>
          <div>
            <p className="font-medium">Use the platform</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hunters start on the board. Teams open{" "}
              <Link href="/teams" className="text-primary hover:underline">
                /teams
              </Link>
              . Posting work follows{" "}
              <Link
                href="/docs/creators"
                className="text-primary hover:underline"
              >
                Creators
              </Link>
              .
            </p>
          </div>
        </li>
      </ol>

      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Mainnet</p>
        <p>
          The live site uses mainnet ZEC. Treat addresses and amounts carefully.
        </p>
      </div>
    </div>
  );
}
