import { bountyRepo, isRepoId, REPOS, type RepoId } from "@/lib/repos";
import type { Bounty } from "@/lib/types";

export type BountyBoardStatus = "" | "open" | "assigned" | "in_review";
export type BountyBoardSort = "newest" | "highest_reward" | "soonest_deadline";

export interface BountyBoardFilters {
  query: string;
  category: string;
  repo: RepoId | "all" | "untagged";
  teamId: string;
  minReward: number | null;
  maxReward: number | null;
  deadline: string;
  status: BountyBoardStatus;
  sort: BountyBoardSort;
}

export const DEFAULT_BOUNTY_BOARD_FILTERS: BountyBoardFilters = {
  query: "",
  category: "All",
  repo: "all",
  teamId: "",
  minReward: null,
  maxReward: null,
  deadline: "",
  status: "",
  sort: "newest",
};

const VALID_STATUSES = new Set<BountyBoardStatus>([
  "",
  "open",
  "assigned",
  "in_review",
]);
const VALID_SORTS = new Set<BountyBoardSort>([
  "newest",
  "highest_reward",
  "soonest_deadline",
]);

function finiteNonNegativeNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isValidDate(value: string | null): value is string {
  return (
    value != null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

export function readBountyBoardFilters(
  params: Pick<URLSearchParams, "get">,
): BountyBoardFilters {
  const requestedRepo = params.get("repo");
  const requestedStatus = params.get("status") as BountyBoardStatus | null;
  const requestedSort = params.get("sort") as BountyBoardSort | null;
  const deadline = params.get("due");

  return {
    query: params.get("q") ?? "",
    category: params.get("category") || "All",
    repo: isRepoId(requestedRepo)
      ? requestedRepo
      : requestedRepo === "untagged"
        ? "untagged"
        : "all",
    teamId: params.get("team") ?? "",
    minReward: finiteNonNegativeNumber(params.get("min")),
    maxReward: finiteNonNegativeNumber(params.get("max")),
    deadline: isValidDate(deadline) ? deadline : "",
    status:
      requestedStatus && VALID_STATUSES.has(requestedStatus)
        ? requestedStatus
        : "",
    sort:
      requestedSort && VALID_SORTS.has(requestedSort)
        ? requestedSort
        : "newest",
  };
}

export function writeBountyBoardFilters(
  params: URLSearchParams,
  filters: BountyBoardFilters,
): URLSearchParams {
  const values: Record<string, string> = {
    q: filters.query.trim(),
    category: filters.category === "All" ? "" : filters.category,
    repo:
      filters.repo === "all"
        ? ""
        : filters.repo,
    team: filters.teamId,
    min: filters.minReward == null ? "" : String(filters.minReward),
    max: filters.maxReward == null ? "" : String(filters.maxReward),
    due: filters.deadline,
    status: filters.status,
    sort: filters.sort === "newest" ? "" : filters.sort,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

function normalizeSearch(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function searchableText(bounty: Bounty): string {
  return [
    bounty.title,
    bounty.description,
    bounty.categoryId,
    bounty.category?.name,
    bounty.createdByUser?.name,
    bounty.createdByUser?.nickname,
    bounty.assigneeUser?.name,
    bounty.assigneeUser?.nickname,
    ...(bounty.assignees ?? []).flatMap(({ user }) => [
      user.name,
      user.nickname,
    ]),
    bounty.team?.name,
    bounty.targetRepo,
    bountyRepo(bounty),
    bounty.difficulty,
    bounty.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function createdAt(bounty: Bounty): number {
  return new Date(bounty.dateCreated).getTime();
}

function deadlineAt(bounty: Bounty): number {
  return new Date(bounty.timeToComplete).getTime();
}

export function filterAndSortBounties(
  bounties: Bounty[],
  filters: BountyBoardFilters,
): Bounty[] {
  const terms = normalizeSearch(filters.query);
  const maxDeadline = filters.deadline
    ? Date.parse(`${filters.deadline}T23:59:59.999Z`)
    : null;

  const results = bounties.filter((bounty) => {
    if (filters.teamId && bounty.teamId !== filters.teamId) return false;
    if (filters.category !== "All" && bounty.categoryId !== filters.category)
      return false;

    if (
      filters.repo !== "all" &&
      (filters.repo === "untagged"
        ? bountyRepo(bounty) != null
        : bountyRepo(bounty) !== filters.repo)
    ) {
      return false;
    }

    if (
      filters.minReward != null &&
      bounty.bountyAmount < filters.minReward
    ) {
      return false;
    }
    if (
      filters.maxReward != null &&
      bounty.bountyAmount > filters.maxReward
    ) {
      return false;
    }
    if (maxDeadline != null) {
      const bountyDeadline = deadlineAt(bounty);
      if (!Number.isFinite(bountyDeadline) || bountyDeadline > maxDeadline)
        return false;
    }

    if (filters.status === "open" && bounty.status !== "TO_DO") return false;
    if (
      filters.status === "assigned" &&
      bounty.status !== "IN_PROGRESS"
    ) {
      return false;
    }
    if (
      filters.status === "in_review" &&
      bounty.status !== "IN_REVIEW"
    ) {
      return false;
    }

    if (terms.length) {
      const text = searchableText(bounty);
      if (!terms.every((term) => text.includes(term))) return false;
    }

    return true;
  });

  return results.sort((a, b) => {
    if (filters.sort === "highest_reward") {
      return b.bountyAmount - a.bountyAmount || createdAt(b) - createdAt(a);
    }
    if (filters.sort === "soonest_deadline") {
      const aDeadline = deadlineAt(a);
      const bDeadline = deadlineAt(b);
      const aHasDeadline = Number.isFinite(aDeadline);
      const bHasDeadline = Number.isFinite(bDeadline);
      if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;
      return aDeadline - bDeadline || createdAt(b) - createdAt(a);
    }
    return createdAt(b) - createdAt(a);
  });
}
