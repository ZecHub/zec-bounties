export const REPO_IDS = [
  "zechub",
  "zechub-wiki",
  "zec-bounties",
  "namada",
] as const;

export type RepoId = (typeof REPO_IDS)[number];

export interface RepoMeta {
  id: RepoId;
  label: string;
  short: string;
  icon: string;
  patterns: RegExp[];
}

export const REPOS: readonly RepoMeta[] = [
  {
    id: "zechub",
    label: "ZecHub",
    short: "ZecHub",
    icon: "/Contribute-13.png",
    patterns: [/github\.com\/ZecHub\/zechub(?!-)/i],
  },
  {
    id: "zechub-wiki",
    label: "ZecHub Wiki",
    short: "Wiki",
    icon: "/zechub-wiki.svg",
    patterns: [
      /github\.com\/ZecHub\/zechub-wiki\b/i,
      /zechub\.wiki\//i,
    ],
  },
  {
    id: "zec-bounties",
    label: "ZEC Bounties",
    short: "Bounties",
    icon: "/ZecHubBlue.png",
    patterns: [/github\.com\/ZecHub\/zec-bounties\b/i],
  },
  {
    id: "namada",
    label: "Namada",
    short: "Namada",
    icon: "/namada-logo.png",
    patterns: [
      /github\.com\/ZecHub\/Namada\b/i,
      /github\.com\/namada-net\/namada\b/i,
    ],
  },
];

const BY_ID = new Map(REPOS.map((repo) => [repo.id, repo]));

export function isRepoId(value: string | null | undefined): value is RepoId {
  return !!value && BY_ID.has(value as RepoId);
}

export function repoMeta(id: RepoId): RepoMeta {
  return BY_ID.get(id)!;
}

export function bountyRepo(bounty: {
  targetRepo?: string | null;
  title?: string;
  description?: string;
}): RepoId | null {
  if (isRepoId(bounty.targetRepo)) return bounty.targetRepo;
  const text = `${bounty.title ?? ""}\n${bounty.description ?? ""}`;
  for (const repo of REPOS) {
    if (repo.patterns.some((pattern) => pattern.test(text))) return repo.id;
  }
  return null;
}
