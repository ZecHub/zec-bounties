import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Teams | ZEC Bounties Docs",
  description:
    "Team role — members, shared wallet, media, verification, and posting bounties.",
};

export default function TeamsDocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Teams</h1>
        <p className="mt-3 text-muted-foreground text-lg">
          Team is the organization role. Post bounties. Build with your crew.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Who this is for</h2>
        <p className="text-sm text-muted-foreground">
          Pick <strong>Team</strong> at onboarding if you represent a group that
          will fund work. You can still keep a personal payout UA on your
          profile.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">After you seal as Team</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Open{" "}
            <Link href="/teams" className="text-primary hover:underline">
              /teams
            </Link>
          </li>
          <li>
            Create a team (name, description, Twitter and Discord are required)
          </li>
          <li>
            Invite members as OWNER, ADMIN, or MEMBER
          </li>
          <li>Optionally attach a funded team wallet for payouts</li>
          <li>
            Upload a logo and banner from Settings (PNG, JPEG, WEBP, or SVG;
            logo 5 MB, banner 15 MB)
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Team roles</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong>OWNER</strong> — full control, including delete and wallet
          </li>
          <li>
            <strong>ADMIN</strong> — edit team, members, media, and team bounties
          </li>
          <li>
            <strong>MEMBER</strong> — participate; cannot change settings or
            verify the team
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Platform Admin is separate. Team OWNER is not a platform admin.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Verification</h2>
        <p className="text-sm text-muted-foreground">
          A team is verified after three different platform admins stamp it.
          Creating a team does not verify it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Bounties and payouts</h2>
        <p className="text-sm text-muted-foreground">
          Team-posted bounties follow{" "}
          <Link href="/docs/creators" className="text-primary hover:underline">
            Creators
          </Link>
          . Payouts can use the team wallet. Assignees are paid to{" "}
          <em>their</em> registered UA, not the team address.
        </p>
      </section>

      <p className="text-sm text-muted-foreground border-t pt-6">
        Next:{" "}
        <Link href="/docs/creators" className="text-primary hover:underline">
          Creators →
        </Link>{" "}
        ·{" "}
        <Link href="/docs/hunters" className="text-primary hover:underline">
          Hunters →
        </Link>
      </p>
    </div>
  );
}
