import type { ReactNode } from "react";
import { bountyRepo, REPOS, type RepoId } from "@/lib/repos";

export function RepoIcon({
  repo,
  className = "h-4 w-4",
}: {
  repo: RepoId;
  className?: string;
}) {
  const meta = REPOS.find((item) => item.id === repo)!;
  return (
    <img
      src={meta.icon}
      alt=""
      className={`${className} shrink-0 rounded-sm object-contain`}
    />
  );
}

export function RepoMark({
  repo,
  compact = false,
}: {
  repo: RepoId;
  compact?: boolean;
}) {
  const meta = REPOS.find((item) => item.id === repo)!;
  if (compact) {
    return (
      <span title={meta.label} className="inline-flex">
        <RepoIcon repo={repo} className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      title={meta.label}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 h-5 text-[10px] font-medium text-foreground/80"
    >
      <RepoIcon repo={repo} className="h-3.5 w-3.5" />
      <span className="leading-none">{meta.short}</span>
    </span>
  );
}

export function BountyRepoMark({
  bounty,
}: {
  bounty: { targetRepo?: string | null; title?: string; description?: string };
}) {
  const repo = bountyRepo(bounty);
  if (!repo) return null;
  return <RepoMark repo={repo} compact />;
}

export function RepoMenuLabel({ repoId }: { repoId: RepoId }) {
  const meta = REPOS.find((item) => item.id === repoId)!;
  return (
    <span className="flex items-center gap-2">
      <RepoIcon repo={repoId} className="h-4 w-4" />
      {meta.label}
    </span>
  );
}

export function RepoFilter({
  value,
  onChange,
  counts,
}: {
  value: RepoId | "all" | "untagged";
  onChange: (next: RepoId | "all" | "untagged") => void;
  counts: Record<RepoId | "untagged", number>;
}) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      role="tablist"
      aria-label="Filter bounties by repository"
    >
      <FilterButton
        active={value === "all"}
        label="All repos"
        count={REPOS.reduce((sum, repo) => sum + counts[repo.id], counts.untagged)}
        onClick={() => onChange("all")}
      >
        <span className="text-[11px] font-semibold leading-none">All</span>
      </FilterButton>
      {REPOS.map((repo) => (
        <FilterButton
          key={repo.id}
          active={value === repo.id}
          label={repo.label}
          count={counts[repo.id]}
          onClick={() => onChange(repo.id)}
        >
          <RepoIcon repo={repo.id} className="h-12 w-12" />
        </FilterButton>
      ))}
      <FilterButton
        active={value === "untagged"}
        label="Untagged"
        count={counts.untagged}
        onClick={() => onChange("untagged")}
      >
        <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r="22"
            fill="none"
            stroke="#F5C542"
            strokeWidth="3.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        </svg>
      </FilterButton>
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`${label}, ${count}`}
      title={`${label} (${count})`}
      onClick={onClick}
      className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
      }`}
    >
      {children}
      <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-background px-1 text-[10px] leading-4 tabular-nums text-muted-foreground ring-1 ring-border">
        {count}
      </span>
    </button>
  );
}
