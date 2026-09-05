export const STAR_KEYS = [
  "1-task",
  "5-tasks",
  "10-tasks",
  "15-tasks",
  "25-tasks",
  "50-tasks",
] as const;

export type StarKey = (typeof STAR_KEYS)[number];

export const STAR_FILTERS: { key: StarKey; label: string }[] = [
  { key: "1-task", label: "1 Task" },
  { key: "5-tasks", label: "5 Tasks" },
  { key: "10-tasks", label: "10 Tasks" },
  { key: "15-tasks", label: "15 Tasks" },
  { key: "25-tasks", label: "25 Tasks" },
  { key: "50-tasks", label: "50 Tasks" },
];

export const SPECIALTY_FILTERS: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "dao-member", label: "DAO" },
  { key: "node-runner", label: "Node" },
  { key: "researcher", label: "Research" },
  { key: "designer", label: "Designer" },
  { key: "developer", label: "Developer" },
  { key: "translator", label: "Translator" },
  { key: "writer", label: "Writer" },
  { key: "hackathon-participant", label: "Hackathon" },
  { key: "hackathon-winner", label: "Winner" },
];

export const ASSIGNABLE_BADGES: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "dao-member", label: "DAO Member" },
  { key: "node-runner", label: "Node Runner" },
  { key: "researcher", label: "Researcher" },
  { key: "designer", label: "Designer" },
  { key: "developer", label: "Developer" },
  { key: "translator", label: "Translator" },
  { key: "writer", label: "Writer" },
  { key: "hackathon-participant", label: "Hackathon Participant" },
  { key: "hackathon-winner", label: "Hackathon Winner" },
];

export const BADGE_LABELS: Record<string, string> = {
  admin: "Admin",
  "dao-member": "DAO Member",
  "node-runner": "Node Runner",
  researcher: "Researcher",
  designer: "Designer",
  developer: "Developer",
  translator: "Translator",
  writer: "Writer",
  "hackathon-participant": "Hackathon Participant",
  "hackathon-winner": "Hackathon Winner",
  "1-task": "1 Task",
  "5-tasks": "5 Tasks",
  "10-tasks": "10 Tasks",
  "15-tasks": "15 Tasks",
  "25-tasks": "25 Tasks",
  "50-tasks": "50 Tasks",
  miner: "Miner",
};

const STAR_OVERRIDE: Record<string, StarKey> = {
  "avatar:1": "1-task",
  "avatar:5": "5-tasks",
  "avatar:10": "10-tasks",
  "avatar:15": "15-tasks",
  "avatar:25": "25-tasks",
  "avatar:50": "50-tasks",
};

export function effectiveStarKey(
  completed: number = 0,
  badges?: string[],
): StarKey {
  const list = Array.isArray(badges) ? badges : [];
  const override = list.find((b) => b.startsWith("avatar:"));
  if (override && STAR_OVERRIDE[override]) return STAR_OVERRIDE[override];
  if (completed >= 50) return "50-tasks";
  if (completed >= 25) return "25-tasks";
  if (completed >= 15) return "15-tasks";
  if (completed >= 10) return "10-tasks";
  if (completed >= 5) return "5-tasks";
  return "1-task";
}

export function specialtyBadgeKeys(
  badges?: string[],
  role?: string,
): string[] {
  const list = Array.isArray(badges) ? badges : [];
  const keys = [
    "admin",
    "dao-member",
    "node-runner",
    "researcher",
    "designer",
    "developer",
    "translator",
    "writer",
    "hackathon-participant",
    "hackathon-winner",
    "miner",
  ];
  return keys.filter(
    (key) => list.includes(key) || (key === "admin" && role === "ADMIN"),
  );
}

export function matchesBadgeFilter(
  filter: string[],
  user: { completed?: number; badges?: string[]; role?: string },
): boolean {
  if (!filter.length) return true;
  const badges = Array.isArray(user.badges) ? user.badges : [];
  const star = effectiveStarKey(user.completed || 0, badges);
  return filter.some((key) => {
    if ((STAR_KEYS as readonly string[]).includes(key)) return star === key;
    return badges.includes(key) || (key === "admin" && user.role === "ADMIN");
  });
}

export function getBadgeTooltip(badges?: string[]): string {
  const real = (badges || []).filter((b) => !b.startsWith("avatar:"));
  if (!real.length) return "Regular User";
  return real.map((b) => BADGE_LABELS[b] ?? b).join(" • ");
}

export function badgeAssetPath(folder: "Dark-Mode" | "Light-Mode", key: string) {
  return `/badges/${folder}/${key}.svg`;
}
