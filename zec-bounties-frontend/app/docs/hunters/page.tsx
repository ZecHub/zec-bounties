import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hunters | ZEC Bounties Docs",
  description:
    "Hunter role — take on bounties, submit work, and get paid in shielded ZEC.",
};

export default function HuntersDocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Hunters</h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Hunter is the individual contributor role. Take on bounties. Get paid
          in ZEC.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Who this is for</h2>
        <p className="text-sm text-muted-foreground">
          Pick <strong>Hunter</strong> at onboarding if you will apply to
          bounties yourself. You do not need a team or a shared wallet.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">After you seal as Hunter</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>You land on the main board.</li>
          <li>
            Add a payout UA in Profile if you skipped it — see{" "}
            <Link
              href="/docs/addresses"
              className="text-primary hover:underline"
            >
              Addresses
            </Link>
            .
          </li>
          <li>Browse open bounties and apply.</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          The apply → assign → submit → payout loop is documented under{" "}
          <Link
            href="/docs/contributors"
            className="text-primary hover:underline"
          >
            Contributors
          </Link>
          . Hunter is that workflow.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What hunters do</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>Browse open bounties across communities</li>
          <li>Apply with a short note (timeline, links, skills)</li>
          <li>Submit the deliverable after assignment</li>
          <li>Receive a shielded payout to the UA on your profile</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What hunters do not do</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Create or fund platform bounties as a group — that is{" "}
            <Link href="/docs/teams" className="text-primary hover:underline">
              Teams
            </Link>
          </li>
          <li>Approve other people&apos;s work unless they created the bounty</li>
          <li>Switch to Team later on a normal account — role select is one-time</li>
        </ul>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link
          href="/docs/contributors"
          className="text-primary hover:underline"
        >
          Contributors →
        </Link>{" "}
        ·{" "}
        <Link href="/docs/teams" className="text-primary hover:underline">
          Teams →
        </Link>
      </p>
    </div>
  );
}
