import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Flag, Lock, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "API | ZEC Bounties Docs",
  description:
    "How to call the ZEC Bounties API, which methods are public, and which privacy rules the responses actually enforce.",
};

const METHOD: Record<string, string> = {
  GET: "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  POST: "border-sky-600/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  PATCH: "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  DELETE: "border-rose-600/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
};

const AUTH_ROWS = [
  ["GET", "/auth/github", "Public", "Start GitHub login"],
  ["GET", "/auth/github/callback", "Public", "OAuth callback"],
  ["GET", "/auth/discord", "Public", "Start Discord connect"],
  ["DELETE", "/auth/discord", "Signed in", "Disconnect Discord"],
  ["GET", "/auth/me", "Session", "Current user"],
  ["PATCH", "/auth/update-nickname", "Signed in", "Set nickname"],
  ["PATCH", "/auth/select-role", "Signed in", "Hunter or team"],
  ["PATCH", "/auth/update-ua-address", "Signed in", "Register payout UA"],
  ["POST", "/auth/verify-uaddress", "Signed in", "Check a UA before saving"],
];

const FLAGS = [
  ["showDisplayName", true, "Anonymous contributor; name and nickname omitted"],
  ["showAvatar", true, "avatar omitted"],
  ["showCompleted", false, "completed and submitted counts omitted"],
  ["showEarnings", false, "totalEarned omitted"],
  ["showCreated", false, "created count omitted"],
  ["showCompletionRate", false, "rate omitted"],
  ["showRecentBounties", false, "recent bounty lists omitted"],
  ["showBio", false, "bio omitted"],
  ["showBadges", false, "badges omitted"],
  ["showRole", false, "role omitted"],
  ["showGithub", false, "GitHub id omitted"],
  ["showAddressType", false, "address type omitted"],
  ["showMemberSince", false, "join date omitted"],
] as const;

function Method({ name }: { name: string }) {
  return (
    <span
      className={`inline-flex min-w-[3.25rem] justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide ${METHOD[name] ?? "border-border bg-muted"}`}
    >
      {name}
    </span>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="space-y-10">
      <div>
        <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
          Reference
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          API
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          The site talks to a separate backend. These are the methods a hunter,
          creator, or integrator needs. Admin wallet and payout routes exist,
          but they are not a public integration surface.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Production
          </p>
          <p className="mt-1 font-mono text-sm">https://zechub.zone</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Local
          </p>
          <p className="mt-1 font-mono text-sm">http://localhost:9000</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How to call it</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Send JSON. Authenticated methods take{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            {"Authorization: Bearer <jwt>"}
          </code>
          . The GitHub login flow sets that token. Do not put it in a query
          string.
        </p>
        <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
{`curl -sS "https://zechub.zone/api/leaderboard?limit=25"
curl -sS "https://zechub.zone/api/users/<id-or-nickname>/public"
curl -sS "https://zechub.zone/api/bounties"

curl -sS -X POST "https://zechub.zone/api/bounties/apply" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"bountyId":"<id>","message":"I can take this."}'`}
        </pre>
        <p className="rounded-lg border border-l-2 border-l-primary bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Chain values are <code>MAIN</code>, <code>TEST</code>, and{" "}
          <code>ALL</code>. Non-MAIN on the public leaderboard returns 403
          unless the caller is an admin.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Auth</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Mounted at <code>/auth</code>, not <code>/api</code>.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Access</th>
                <th className="px-3 py-2 font-medium">Use</th>
              </tr>
            </thead>
            <tbody>
              {AUTH_ROWS.map((row) => (
                <tr key={row[1]} className="border-t">
                  <td className="px-3 py-2">
                    <Method name={row[0]} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row[1]}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row[2]}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Never send a seed phrase or spending key. Payouts use the registered
          receive address only. See{" "}
          <Link
            href="/docs/privacy-payments"
            className="text-primary underline underline-offset-4"
          >
            Privacy & payments
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Public reads</h2>
        <div className="divide-y overflow-hidden rounded-lg border">
          {[
            ["GET", "/api/leaderboard", "Optional auth. timeRange=all|30d|90d, chain, limit (max 100)."],
            ["GET", "/api/users/:idOrNickname/public", "Privacy-filtered profile. Owner or admin may pass ?full=1."],
            ["GET", "/api/bounties", "Optional auth. Private team bounties are filtered for non-admins."],
            ["GET", "/api/bounties/categories", "No auth."],
            ["GET", "/api/teams/:teamId/overview", "Optional auth."],
          ].map((row) => (
            <div key={row[1]} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <Method name={row[0]} />
              <code className="font-mono text-xs">{row[1]}</code>
              <span className="text-sm text-muted-foreground sm:ml-auto">{row[2]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Profile visibility</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <code>GET /api/users/:idOrNickname/public</code> is the privacy
          boundary. Missing keys are off, except avatar and display name.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Flag</th>
                <th className="px-3 py-2 font-medium">Default</th>
                <th className="px-3 py-2 font-medium">When hidden</th>
              </tr>
            </thead>
            <tbody>
              {FLAGS.map((row) => (
                <tr key={row[0]} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{row[0]}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row[1]
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground"
                      }
                    >
                      {row[1] ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Signed-in methods</h2>
        <div className="divide-y overflow-hidden rounded-lg border">
          {[
            ["POST", "/api/bounties/apply", "Apply to a bounty"],
            ["GET", "/api/bounties/my-applications", "Your applications"],
            ["POST", "/api/bounties/:id/submit", "Submit work"],
            ["GET", "/api/bounties/my-submissions", "Your submissions"],
            ["POST", "/api/bounties", "Create a bounty"],
            ["GET", "/api/users/me/profile-settings", "Your visibility flags"],
            ["PATCH", "/api/users/me/profile", "Bio and profileVisibility"],
            ["GET", "/api/kpis/top-contributors", "KPI board. rankBy=completed|earned"],
            ["POST", "/api/notifications/push/subscribe", "Register a push endpoint"],
          ].map((row) => (
            <div key={row[1]} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <Method name={row[0]} />
              <code className="font-mono text-xs">{row[1]}</code>
              <span className="text-sm text-muted-foreground sm:ml-auto">{row[2]}</span>
            </div>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Team membership, team wallet, and verification routes are under{" "}
          <code>/api/teams</code> and require a token. Approval, payment,
          rescan, and full user export routes are admin-only.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Security to consider</h2>
        <div className="rounded-lg border border-l-2 border-l-primary bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" />
            One visibility contract for every page
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            A blurred name or a Hidden Hunter label is not the control. Every
            response that names a user applies the same{" "}
            <code>profileVisibility</code> flags as{" "}
            <code>GET /api/users/:idOrNickname/public</code>. The owner and an
            admin still see their own full fields.
          </p>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Public profile, the leaderboard, the KPI board, bounty cards, team
            overviews, and websocket payloads all follow that contract. A field
            omitted on the public profile is omitted everywhere else for that
            user.
          </li>
          <li>
            <code>GET /api/leaderboard</code> is public. Name and nickname
            require <code>showDisplayName</code>. Avatar requires{" "}
            <code>showAvatar</code>. Completed count requires{" "}
            <code>showCompleted</code>. <code>earned</code> and{" "}
            <code>points</code> require <code>showEarnings</code>, because
            points are derived from earnings. Rank stays. Redaction happens
            before the 60-second cache write. Non-MAIN queries stay admin-only.
          </li>
          <li>
            <code>GET /api/kpis/top-contributors</code> is authenticated and
            uses the same flags. Name and nickname require{" "}
            <code>showDisplayName</code>. Avatar requires{" "}
            <code>showAvatar</code>. Completed count requires{" "}
            <code>showCompleted</code>. <code>totalEarned</code> is null unless{" "}
            <code>showEarnings</code> is on. Payout addresses are never returned
            to non-admins. Rank stays.
          </li>
          <li>
            Bounty and team pages show an assignee or member only to the level
            that user allowed. A hidden display name is an anonymous label. A
            hidden earnings flag strips amounts from that user's rows, not
            only from the profile page.
          </li>
          <li>
            Websocket events use the same filter and go only to the intended
            audience. A socket payload is not a second, wider copy of the user.
          </li>
          <li>
            <Lock className="mr-1 inline h-3.5 w-3.5" />
            Do not paste a bearer token into a third-party site. Never send a
            seed phrase. Wallet import and pay routes can move funds and stay
            on an authenticated session you control.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Reporting bugs and concerns</h2>
        <div className="rounded-lg border border-l-2 border-l-primary bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Flag className="h-4 w-4 text-primary" />
            File it against the route, not the page that renders it
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            A privacy miss is a response that includes a field the public
            profile omits for that user. Include the method, path, and which
            flag was ignored. Do not paste tokens, seeds, or another
            person's hidden values.
          </p>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Bugs and privacy concerns:{" "}
            <Link
              href="https://github.com/ZecHub/zec-bounties/issues"
              className="text-primary underline underline-offset-4"
            >
              GitHub issues
            </Link>
            . A short request and response shape is enough. Redact names,
            earnings, and addresses before you attach it.
          </li>
          <li>
            Questions that are not a defect: ZecHub Discord, or{" "}
            <Link
              href="https://x.com/ZecHub"
              className="text-primary underline underline-offset-4"
            >
              @ZecHub
            </Link>
            .
          </li>
          <li>
            Payment and address problems belong on{" "}
            <Link
              href="/docs/privacy-payments"
              className="text-primary underline underline-offset-4"
            >
              Privacy & payments
            </Link>
            . Do not send a seed phrase to any of these channels.
          </li>
        </ul>
      </section>

      <p className="flex flex-wrap items-center gap-2 border-t pt-6 text-sm text-muted-foreground">
        Next
        <Link
          href="/docs/privacy-payments"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Privacy & payments
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/docs/faq"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          FAQ
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
