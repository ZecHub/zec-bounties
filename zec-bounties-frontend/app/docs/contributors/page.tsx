import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contributors | ZEC Bounties Docs",
  description:
    "How to browse bounties, apply, submit work, and receive shielded ZEC.",
};

export default function ContributorsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Contributors</h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Find open work, apply, deliver, and get paid in shielded ZEC.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Before you start</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            Sign in with GitHub — see{" "}
            <Link
              href="/docs/getting-started"
              className="text-primary hover:underline"
            >
              Getting started
            </Link>
          </li>
          <li>
            Register a valid payout address — see{" "}
            <Link
              href="/docs/addresses"
              className="text-primary hover:underline"
            >
              Addresses
            </Link>{" "}
            (UA with a shielded receiver required; mixed UA allowed with
            warning; transparent-only rejected)
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Workflow</h2>

        <Step n={1} title="Browse">
          Open bounties from the main board. Read the description, amount
          (ZEC), deadline, and requirements carefully.
        </Step>
        <Step n={2} title="Apply">
          Submit an application / express interest. Include anything the bounty
          asks for (timeline, relevant links, skill notes).
        </Step>
        <Step n={3} title="Get assigned">
          The creator or an admin selects assignee(s). You may get a
          notification when selected.
        </Step>
        <Step n={4} title="Submit work">
          Complete the task, then submit the deliverable (usually a link: PR,
          doc, design, repo, etc.). Status moves to review.
        </Step>
        <Step n={5} title="Approval & payment">
          After approval the bounty is marked done / ready for payout. Payment
          is a shielded transaction to your registered address. A transaction ID
          is recorded for verification.
        </Step>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tips</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Match scope and quality to the description — unclear submissions
            slow review.
          </li>
          <li>
            Keep your payout UA up to date in Profile before payment runs.
          </li>
          <li>
            Prefer a UA with shielded receivers only (Ironwood / Sapling). Mixed
            UAs (shielded + transparent) are allowed with a warning — see{" "}
            <Link
              href="/docs/addresses"
              className="text-primary hover:underline"
            >
              Addresses
            </Link>
            .
          </li>
        </ul>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link href="/docs/creators" className="text-primary hover:underline">
          Creators →
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