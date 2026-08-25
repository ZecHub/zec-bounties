"use client";

import Link from "next/link";
import { useTheme } from "next-themes";

export const metadata: Metadata = {
  title: "Badges | ZEC Bounties Docs",
  description:
    "Task stars and specialty role badges on the ZEC Bounties leaderboard.",
};

const STAR_BADGES = [
  {
    key: "1-task",
    name: "1 Task",
    threshold: "1+ completed",
    meaning: "First contribution",
  },
  {
    key: "5-tasks",
    name: "5 Tasks",
    threshold: "5+ completed",
    meaning: "Consistent contributor",
  },
  {
    key: "10-tasks",
    name: "10 Tasks",
    threshold: "10+ completed",
    meaning: "Regular participant",
  },
  {
    key: "15-tasks",
    name: "15 Tasks",
    threshold: "15+ completed",
    meaning: "Strong track record",
  },
  {
    key: "25-tasks",
    name: "25 Tasks",
    threshold: "25+ completed",
    meaning: "Highly active",
  },
  {
    key: "50-tasks",
    name: "50 Tasks",
    threshold: "50+ completed",
    meaning: "Top-tier contributor",
  },
];

const SPECIALTY_BADGES = [
  {
    key: "admin",
    name: "Admin",
    how: "Platform administrator",
  },
  {
    key: "dao-member",
    name: "DAO Member",
    how: "Active ZecHub / Zcash DAO participant",
  },
  {
    key: "node-runner",
    name: "Node Runner",
    how: "Runs a Zcash full node that supports the ecosystem",
  },
  {
    key: "researcher",
    name: "Researcher",
    how: "Contributes research, analysis, or technical write-ups",
  },
  {
    key: "designer",
    name: "Designer",
    how: "Design, UX, or visual contributions",
  },
  {
    key: "developer",
    name: "Developer",
    how: "Code contributions (PRs, tools, integrations)",
  },
  {
    key: "translator",
    name: "Translator",
    how: "Localization and translation work",
  },
  {
    key: "writer",
    name: "Writer",
    how: "Content, documentation, or educational writing",
  },
  {
    key: "hackathon-participant",
    name: "Hackathon Participant",
    how: "Took part in a Zcash-related hackathon",
  },
  {
    key: "hackathon-winner",
    name: "Hackathon Winner",
    how: "Placed or won in a Zcash-related hackathon",
  },
];

export default function BadgesPage() {
  const { resolvedTheme } = useTheme();
  const folder = resolvedTheme === "dark" ? "Dark-Mode" : "Light-Mode";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Badges</h1>
        <p className="mt-3 text-muted-foreground text-lg leading-relaxed">
          Badges appear on the KPI leaderboard and on contributor profiles. They
          recognize both activity volume and specialized roles in the Zcash
          bounty ecosystem.
        </p>
      </div>

      {/* Task stars */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Task stars (automatic)</h2>
        <p className="text-sm text-muted-foreground">
          Stars are awarded automatically based on the number of bounties a
          contributor has completed. Admins can also manually override the star
          level for a user.
        </p>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left font-medium px-4 py-3 w-16">Badge</th>
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Threshold</th>
                <th className="text-left font-medium px-4 py-3">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {STAR_BADGES.map((b) => (
                <tr key={b.key} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <img
                      src={`/badges/${folder}/${b.key}.svg`}
                      alt={b.name}
                      className="w-6 h-6 object-contain"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.threshold}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.meaning}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Specialty badges */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Specialty badges (manual)</h2>
        <p className="text-sm text-muted-foreground">
          These are assigned by admins to recognize specific roles or
          achievements. A user can hold multiple specialty badges at the same
          time.
        </p>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left font-medium px-4 py-3 w-16">Badge</th>
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">
                  How it is earned
                </th>
              </tr>
            </thead>
            <tbody>
              {SPECIALTY_BADGES.map((b) => (
                <tr key={b.key} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <img
                      src={`/badges/${folder}/${b.key}.svg`}
                      alt={b.name}
                      className="w-6 h-6 object-contain"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Notes</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Stars update automatically when a bounty is marked completed.
          </li>
          <li>
            Specialty badges are granted by admins via the KPI dashboard
            (“Manage User Badges”).
          </li>
          <li>
            Light and dark variants of every badge exist; the site selects the
            correct set based on the current theme.
          </li>
        </ul>
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
