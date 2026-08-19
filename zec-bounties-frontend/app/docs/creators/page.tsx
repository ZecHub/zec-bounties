import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Creators | ZEC Bounties Docs",
  description:
    "How to propose bounties, review submissions, and pay contributors in shielded ZEC.",
};

export default function CreatorsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Creators</h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Propose tasks, review work, and pay contributors with shielded ZEC.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Workflow</h2>

        <Step n={1} title="Propose a bounty">
          Create a bounty with a clear title, description, ZEC amount, and
          deadline. Spell out acceptance criteria so submissions are easy to
          judge.
        </Step>
        <Step n={2} title="Admin approval">
          New bounties typically need admin approval before they go live on the
          public board.
        </Step>
        <Step n={3} title="Review applications">
          Review applicants and assign the contributor(s) who should do the
          work.
        </Step>
        <Step n={4} title="Review submissions">
          When work is submitted, review the deliverable against the
          description. Request changes or approve.
        </Step>
        <Step n={5} title="Payout">
          After approval, payment can be triggered (one-click or batched by
          admins). Funds are sent as a shielded transaction to the assignee’s
          registered UA. A transaction ID is stored for transparency.
        </Step>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Writing a good bounty</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>Specific scope — what “done” looks like</li>
          <li>Fair ZEC amount for the effort</li>
          <li>Links to repos, designs, or prior art when relevant</li>
          <li>Realistic deadline</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Payment notes</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Assignees must have a UA with at least one shielded receiver.
            Transparent-only addresses cannot be paid. Mixed UAs (shielded +
            transparent) are allowed with a warning — see{" "}
            <Link
              href="/docs/addresses"
              className="text-primary hover:underline"
            >
              Addresses
            </Link>
            .
          </li>
          <li>
            Paying wallets (personal or team) must be funded and reachable for
            the send to succeed.
          </li>
          <li>Failed sends should not silently mark a bounty as paid.</li>
        </ul>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link
          href="/docs/privacy-payments"
          className="text-primary hover:underline"
        >
          Privacy & payments →
        </Link>
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{children}</p>
      </div>
    </div>
  );
}