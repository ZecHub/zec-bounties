import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Getting started | ZEC Bounties Docs",
  description:
    "Sign in, set a shielded payout address, and start using ZEC Bounties.",
};

export default function GettingStartedPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Getting started
        </h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Three steps to use the platform.
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
              authentication and profile basics.
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
            <p className="font-medium">Use the platform</p>
            <p className="text-sm text-muted-foreground mt-1">
              <Link
                href="/docs/contributors"
                className="text-primary hover:underline"
              >
                Contributors
              </Link>
              : browse and apply to bounties.{" "}
              <Link
                href="/docs/creators"
                className="text-primary hover:underline"
              >
                Creators
              </Link>
              : propose tasks and pay out in ZEC.
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