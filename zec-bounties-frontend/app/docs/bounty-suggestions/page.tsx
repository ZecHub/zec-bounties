import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bounty suggestions | ZEC Bounties Docs",
  description:
    "How hunters suggest bounties, and how platform admins control who can suggest.",
};

export default function BountySuggestionsDocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Bounty suggestions
        </h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Hunters can propose a bounty. Platform admins control who is allowed
          to suggest.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Who can suggest</h2>
        <p className="text-sm text-muted-foreground">
          Admins set this under Admin → Settings → Suggestion settings. Three
          modes:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong>Closed</strong> — no hunter suggestions are accepted. The
            New Bounty button is disabled.
          </li>
          <li>
            <strong>Open</strong> — any onboarded hunter may suggest, still
            subject to the weekly limit and any per-user block.
          </li>
          <li>
            <strong>Threshold</strong> — a hunter must have completed at least X
            bounties (DONE as assignee) before they can suggest. X is set by
            admins; the default is 5.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Changes take effect immediately. No restart is required.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How a suggestion works</h2>
        <p className="text-sm text-muted-foreground">
          If suggestions are enabled for you:
        </p>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>An eligible hunter opens New Bounty</li>
          <li>
            The suggestion counts toward the hunter’s weekly creation limit and
            stays assigned to them.
          </li>
          <li>
            Admins can approve, edit while leaving it pending, or decline.
            Every decision needs a reason of at most 500 characters.
          </li>
          <li>
            Approval activates the normal workflow. The hunter submits work;
            the team reviews and pays through the usual treasury flow. Declined
            suggestions are closed and cannot be delivered or paid.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Related</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <Link href="/docs/hunters" className="text-primary hover:underline">
              Hunters
            </Link>{" "}
            — the individual role
          </li>
          <li>
            <Link href="/docs/teams" className="text-primary hover:underline">
              Teams
            </Link>{" "}
            — reviewing and paying suggestions
          </li>
          <li>
            <Link
              href="/docs/task-statuses"
              className="text-primary hover:underline"
            >
              Task statuses
            </Link>{" "}
            — what Suggested means
          </li>
        </ul>
      </section>
    </div>
  );
}