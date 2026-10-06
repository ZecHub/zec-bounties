import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Glossary | ZEC Bounties Docs",
  description:
    "Account roles, team roles, bounty statuses, and payment flags.",
};

export default function GlossaryPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Glossary</h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Names in the code that the other docs leave undefined. Values come
          from <code>prisma/schema.prisma</code> and the routes that write
          them.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Account roles</h2>
        <p className="text-sm text-muted-foreground">
          Stored on <code>User.role</code>. New accounts start as{" "}
          <code>CLIENT</code>. Onboarding picks Hunter or Team once. Admin is
          not a signup choice.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <code>CLIENT</code> — default before onboarding. Not a role you
            choose on the board.
          </li>
          <li>
            <code>HUNTER</code> — individual account. Apply, get assigned,
            submit work, receive a shielded payout.
          </li>
          <li>
            <code>TEAM</code> — posts work with a team and a shared wallet.
          </li>
          <li>
            <code>ADMIN</code> — operator. Can approve bounties, change
            approval, and authorize payment.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Team membership</h2>
        <p className="text-sm text-muted-foreground">
          <code>TeamMember.role</code> is a string, not an account role.
          Values: <code>OWNER</code>, <code>ADMIN</code>, <code>MEMBER</code>{" "}
          (default). A team role does not change <code>User.role</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Creator</h2>
        <p className="text-sm text-muted-foreground">
          Not a role. It is the user in <code>Bounty.createdBy</code>. A Hunter
          who creates a bounty is stored as its creator, is auto-assigned, and
          the bounty is saved with <code>isApproved</code> false. Only an Admin
          can create a bounty that is already approved.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Bounty status</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <code>TO_DO</code> — default. Treated as not approved.
          </li>
          <li>
            <code>IN_PROGRESS</code> — someone is assigned, or an admin
            approval moved it here. A rejected submission, or one that needs
            revision, returns the bounty here when no other submission is
            approved.
          </li>
          <li>
            <code>IN_REVIEW</code> — an assignee submitted work.
          </li>
          <li>
            <code>DONE</code> — work was accepted, or an admin set this
            status. Several assignees require a winner first.
          </li>
          <li>
            <code>CANCELLED</code> — no assignees left, or an admin cleared
            approval. Treated as not approved.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Applications and submissions use their own strings. Applications
          default to <code>pending</code>. Submission review accepts{" "}
          <code>approved</code>, <code>rejected</code>, or{" "}
          <code>needs_revision</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Flags</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <code>isApproved</code> — submit work fails while this is false.
            Setting it true moves status to <code>IN_PROGRESS</code>. Setting
            it false moves status to <code>CANCELLED</code>.
          </li>
          <li>
            <code>isPaid</code> — a payout was recorded. A <code>DONE</code>{" "}
            bounty with this flag false is still unpaid.
          </li>
          <li>
            <code>paymentAuthorized</code> — an admin authorized payout. A
            successful send also sets it true.
          </li>
          <li>
            <code>paymentInFlight</code> — a send has claimed this bounty so a
            second send cannot start. Cleared when the send is recorded or
            marked failed.
          </li>
          <li>
            <code>paymentScheduled</code> — optional schedule. It does not by
            itself pay the bounty.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Transaction status</h2>
        <p className="text-sm text-muted-foreground">
          On the payment record, not on the bounty. <code>PENDING</code> means
          claimed and not yet sent. <code>BROADCAST</code> means a txid was
          seen and the bounty is marked paid. <code>FAILED</code> means the
          wallet reported an error before sending. <code>UNKNOWN</code> means
          the outcome is unclear and a human has to resolve it.
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
