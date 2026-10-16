import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Task statuses | ZEC Bounties Docs",
  description:
    "What To Do, In Progress, In Review, Done, and Cancelled mean, what moves a bounty between them, and what a Suggested task is.",
};

const FLOW = `To Do
  │ approved, or
  │ an assignee is added
  ▼
In Progress ◄─────────────┐
  │ assignee submits work │ rejected /
  ▼                       │ needs revision
In Review ────────────────┘
  │ submission approved
  ▼
Done
  │ admin authorizes payment
  ▼
Paid (txid recorded)

Cancelled ◄── approval removed, or
              all assignees removed`;

export default function TaskStatusesPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Task statuses
        </h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Every bounty has one of five statuses. Here is what each one means
          and what moves a bounty to the next.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">The five statuses</h2>

        <Status name="To Do">
          Every new bounty starts here. Bounties created by a platform admin,
          and team bounties created by a team user (not a hunter), are approved
          on creation. Everything else starts with approval pending, and nobody
          can submit work until it is approved (activated).
        </Status>
        <Status name="In Progress">
          The bounty is live and someone is working on it. It moves here when
          it is approved, or when an application is accepted or an
          assignee is added.
        </Status>
        <Status name="In Review">
          An assignee has submitted work: a description of what was done,
          usually with a deliverable link (PR, doc, design, repo). The
          submission waits for review.
        </Status>
        <Status name="Done">
          The submission was approved. If it is rejected or sent back for
          revision instead, the bounty returns to In Progress.
        </Status>
        <Status name="Cancelled">
          The bounty is closed without a payout. This happens when an admin
          removes its approval, a suggestion is declined, or all assignees are
          removed. Adding an assignee
          again moves it back to In Progress.
        </Status>

        <p className="text-sm text-muted-foreground">
          Platform admins can change any status. For team bounties, the
          team&apos;s OWNER and ADMIN members can too.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Flow</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
          {FLOW}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Done is not the same as paid</h2>
        <p className="text-sm text-muted-foreground">
          After Done, payouts are batched and usually go out the following
          Sunday to the payout UA set in Profile. The hunter has nothing else
          to do. Payment is still a separate step: an admin authorizes a
          shielded payment to the assignee&apos;s registered UA, and the
          transaction ID is recorded on the bounty. Until then a Done bounty is
          approved but unpaid. See{" "}
          <Link
            href="/docs/privacy-payments"
            className="text-primary hover:underline"
          >
            Privacy &amp; payments
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Suggested is not a status</h2>
        <p className="text-sm text-muted-foreground">
          <strong>Suggested</strong> is a label for a bounty created by a user
          with the Hunter role. It can be in any of the five statuses.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            The card shows a lock and reads{" "}
            <strong>Invite Only / No other applicants</strong>.
          </li>
          <li>The apply button is hidden. Other users cannot apply.</li>
          <li>
            The hunter who suggested it is assigned to it from the start.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Who reviews it: a suggestion aimed at a team is reviewed by that
          team&apos;s OWNER or ADMIN members. They can approve it, edit it while
          it stays pending, or decline it. A declined suggestion is closed and
          can&apos;t be delivered or paid. Suggestions not aimed at a team are
          reviewed by platform admins.
        </p>
        <p className="text-sm text-muted-foreground">
          Why: the bounty fund is limited, so reviewers approve the suggestions
          that are most useful to the community. An approved suggestion stays
          with the hunter who proposed it. See{" "}
          <a
            href="https://github.com/ZecHub/zec-bounties/blob/main/docs/bounty-suggestions.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Team bounty suggestions
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">New bounties</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>New bounties are usually posted on Mondays.</li>
          <li>
            Suggest a bounty only for work that is not already listed. Check
            the board first.
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

function Status({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-primary pl-4">
      <p className="font-medium">{name}</p>
      <p className="text-sm text-muted-foreground mt-1">{children}</p>
    </div>
  );
}
