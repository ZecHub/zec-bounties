"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { BountyCard } from "@/components/bounty-card";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Grid3X3,
  Plus,
  ArrowRight,
  Loader2,
  ChevronsDown,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { RepoFilter } from "@/components/repo-filter";
import { bountyRepo } from "@/lib/repos";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import {
  DEFAULT_BOUNTY_BOARD_FILTERS,
  filterAndSortBounties,
  readBountyBoardFilters,
  writeBountyBoardFilters,
  type BountyBoardFilters,
} from "@/lib/bounty-filters";
import { formatStatus } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { FavoriteTeamsSidebar } from "@/components/favorite-teams-sidebar";
import { HeroCarousel } from "@/components/hero-carousel";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
// import { useRoleGuard } from "@/hooks/use-role-guard";

const KANBAN_COLUMNS: {
  status: BountyStatus;
  label: string;
  color: string;
  dotColor: string;
}[] = [
  {
    status: "TO_DO",
    label: "Todo",
    color: "border-t-slate-400",
    dotColor: "bg-slate-400",
  },
  {
    status: "IN_PROGRESS",
    label: "In Progress",
    color: "border-t-blue-500",
    dotColor: "bg-blue-500",
  },
  {
    status: "IN_REVIEW",
    label: "In Review",
    color: "border-t-yellow-500",
    dotColor: "bg-yellow-500",
  },
  {
    status: "DONE",
    label: "Done",
    color: "border-t-green-500",
    dotColor: "bg-green-500",
  },
];

// Windows 98-style defrag map colors (inspired by classic Disk Defragmenter)
const DEFRAG_STATUS_COLORS: Record<BountyStatus, string> = {
  TO_DO: "bg-cyan-400", // free / pending
  IN_PROGRESS: "bg-blue-800", // allocated / in use
  IN_REVIEW: "bg-red-500", // fragmented / needs attention
  DONE: "bg-blue-500", // contiguous / completed
  CANCELLED: "bg-zinc-700",
};

const DEFRAG_LEGEND: { status: BountyStatus; label: string; color: string }[] =
  [
    { status: "TO_DO", label: "Todo", color: "bg-cyan-400" },
    { status: "IN_PROGRESS", label: "In Progress", color: "bg-blue-800" },
    { status: "IN_REVIEW", label: "In Review", color: "bg-red-500" },
    { status: "DONE", label: "Done", color: "bg-blue-500" },
    { status: "CANCELLED", label: "Cancelled", color: "bg-zinc-700" },
  ];

// Order for defrag map so same-status blocks form contiguous runs (classic look)
const STATUS_ORDER: BountyStatus[] = [
  "TO_DO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

function HomeContent() {
  const {
    bounties,
    currentUser,
    categories,
    communities,
    bountiesLoading,
    loadMoreBounties,
    loadAllBounties,
    hasMoreBounties,
    fetchBountyById,
  } = useBounty();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<BountyBoardFilters>(() =>
    readBountyBoardFilters(searchParams),
  );
  const [filterLoadError, setFilterLoadError] = useState(false);
  const [filterLoadRetry, setFilterLoadRetry] = useState(0);
  const filterLoadStarted = useRef(false);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "defrag">("grid");
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isTeamsSheetOpen, setIsTeamsSheetOpen] = useState(false);

  const {
    category: activeCategory,
    repo: activeRepo,
    teamId: activeTeamId,
    query: searchQuery,
  } = filters;

  const updateFilter = <K extends keyof BountyBoardFilters>(
    key: K,
    value: BountyBoardFilters[K],
  ) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    const params = writeBountyBoardFilters(
      new URLSearchParams(window.location.search),
      nextFilters,
    );
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  };

  const searchParamString = searchParams.toString();
  useEffect(() => {
    setFilters(readBountyBoardFilters(new URLSearchParams(searchParamString)));
  }, [searchParamString]);

  // currentUser is guaranteed non-null here — ProtectedRoute handles the gate
  const displayCategories = ["All", ...categories.map((c) => c.name)];
  const filterTeams = useMemo(() => {
    const byId = new Map(communities.map((team) => [team.id, team]));
    for (const bounty of bounties) {
      if (bounty.teamId && bounty.team && !byId.has(bounty.teamId)) {
        byId.set(bounty.teamId, {
          id: bounty.teamId,
          name: bounty.team.name,
          description: null,
          memberCount: 0,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [communities, bounties]);

  const categoryFilteredBounties = useMemo(() => {
    return filterAndSortBounties(bounties, {
      ...filters,
      repo: "all",
      sort: "newest",
    });
  }, [bounties, filters]);

  const repoCounts = useMemo(() => {
    const counts = {
      namada: 0,
      zechub: 0,
      "zechub-wiki": 0,
      "zec-bounties": 0,
      untagged: 0,
    };
    for (const bounty of categoryFilteredBounties) {
      const repo = bountyRepo(bounty);
      if (repo) counts[repo] += 1;
      else counts.untagged += 1;
    }
    return counts;
  }, [categoryFilteredBounties]);

  const filteredBounties = useMemo(
    () => filterAndSortBounties(bounties, filters),
    [bounties, filters],
  );

  const kanbanGroups = useMemo(
    () =>
      KANBAN_COLUMNS.map((col) => ({
        ...col,
        bounties: filteredBounties.filter((b) => b.status === col.status),
      })),
    [filteredBounties],
  );

  const defragBounties = useMemo(() => {
    return [...filteredBounties].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return (
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
      );
    });
  }, [filteredBounties]);

  const missingUA = !currentUser?.UA_address;
  const taskCreationBlocked = currentUser?.canCreateTasks === false;

  // Open a bounty and reflect it in the URL
  const openBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setIsDetailModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("bounty", bounty.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeBounty = () => {
    setIsDetailModalOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bounty");
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const getCategoryCount = (name: string) =>
    name === "All"
      ? bounties.length
      : bounties.filter((b) => b.categoryId === name).length;

  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      await loadMoreBounties();
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadMoreBounties]);

  const handleNewBounty = () => {
    if (taskCreationBlocked) {
      toast.error("Task creation disabled", {
        description: "An admin has blocked your account from creating tasks.",
      });
      return;
    }
    if (!currentUser?.UA_address) {
      toast.warning("Unified Address required", {
        description: "Add a UA to your profile before creating a bounty.",
        action: {
          label: "Go to profile",
          onClick: () => router.push("/profile"),
        },
        duration: 5000,
      });
      return;
    }
    setIsNewBountyModalOpen(true);
  };

  const requiresCompleteResults =
    filters.query.trim() !== "" ||
    filters.category !== "All" ||
    filters.repo !== "all" ||
    filters.teamId !== "" ||
    filters.minReward != null ||
    filters.maxReward != null ||
    filters.deadline !== "" ||
    filters.status !== "" ||
    filters.sort !== "newest";

  useEffect(() => {
    if (!requiresCompleteResults) {
      filterLoadStarted.current = false;
      setFilterLoadError(false);
      return;
    }
    if (!hasMoreBounties || bountiesLoading || filterLoadStarted.current)
      return;

    filterLoadStarted.current = true;
    setFilterLoadError(false);
    void loadAllBounties().then((loaded) => {
      if (!loaded) setFilterLoadError(true);
    });
  }, [
    requiresCompleteResults,
    hasMoreBounties,
    bountiesLoading,
    loadAllBounties,
    filterLoadRetry,
  ]);

  const canLoadMore = hasMoreBounties && !requiresCompleteResults;

  useEffect(() => {
    if (!canLoadMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !bountiesLoading) {
          handleLoadMore();
        }
      },
      { rootMargin: "400px" }, // start loading a bit before it's fully in view
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, isLoadingMore, bountiesLoading, handleLoadMore]);

  // On load / when the URL param changes, open the matching bounty
  useEffect(() => {
    const bountyId = searchParams.get("bounty");
    if (!bountyId) return;

    // Prefer the copy already in the list (avoids a flash of stale data)
    const inMemory = bounties.find((b) => b.id === bountyId);
    if (inMemory) {
      setSelectedBounty(inMemory);
      setIsDetailModalOpen(true);
      return;
    }

    // Fall back to a direct fetch — handles deep links before bounties load,
    // or bounties the current filtered list doesn't include
    fetchBountyById(bountyId).then((bounty) => {
      if (bounty) {
        setSelectedBounty(bounty);
        setIsDetailModalOpen(true);
      }
    });
  }, [searchParams, bounties, fetchBountyById]);

  return (
    <main className="min-h-screen bg-background text-foregroun pb-20 md:pb-0">
      <Sheet open={isTeamsSheetOpen} onOpenChange={setIsTeamsSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[70vh] overflow-y-auto p-4 py-6"
        >
          <SheetHeader>
            <SheetTitle>Favorite Teams</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <FavoriteTeamsSidebar
              activeTeamId={activeTeamId}
              onSelectTeam={(id) => {
                  updateFilter("teamId", id ?? "");
                setIsTeamsSheetOpen(false); // close after picking, feels more native
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <BottomTabBar
        onNewBounty={handleNewBounty}
        newBountyBlocked={taskCreationBlocked}
        onOpenTeams={() => setIsTeamsSheetOpen(true)}
        teamsActive={!!activeTeamId}
      />
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={(value) => updateFilter("query", value)}
      />

      <div className="xl:container xl:mx-auto px-3 imd:px-4 py-6 imd:py-8">
        <HeroCarousel onNewBounty={handleNewBounty} />

        {/* {taskCreationBlocked && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                You can't create tasks
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                An admin has disabled task creation for your account. You can
                still browse bounties, apply, and submit work.
              </p>
            </div>
          </div>
        )} */}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 mb-8 imd:mb-12">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
              Welcome!
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl">
              Complete tasks to earn ZEC. You could also create yours and get
              ZEC for it.
            </p>
          </div>
          <div className="hidden imd:grid imd:grid-cols-2 gap-2 imd:gap-3 shrink-0">
            <Button
              title={
                taskCreationBlocked
                  ? "An admin has disabled task creation for your account"
                  : undefined
              }
              className={`w-full sm:w-auto rounded-full shadow-lg shadow-primary/20 ${
                taskCreationBlocked ? "opacity-50" : ""
              }`}
              onClick={handleNewBounty}
            >
              {taskCreationBlocked ? (
                <Ban className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}{" "}
              New Bounty
            </Button>
            <Link href="/my-bounties" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto rounded-full bg-transparent"
              >
                My Bounties <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <NewBountyModal
          open={isNewBountyModalOpen}
          onOpenChange={setIsNewBountyModalOpen}
          onSuccess={() => setIsNewBountyModalOpen(false)}
          onCancel={() => setIsNewBountyModalOpen(false)}
        />
        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={(open) =>
            open ? setIsDetailModalOpen(true) : closeBounty()
          }
        />

        <div className="flex flex-col imd:flex-row gap-6 imd:gap-8 min-w-0">
          <aside className="hidden imd:block imd:w-auto shrink-0">
            <FavoriteTeamsSidebar
              activeTeamId={activeTeamId}
              onSelectTeam={(id) => updateFilter("teamId", id ?? "")}
            />
          </aside>

          <div className="space-y-6 min-w-0 flex-1">
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {displayCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => updateFilter("category", cat)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 h-9 text-sm transition ${
                    activeCategory === cat
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                  }`}
                >
                  {cat}
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-4 px-1.5 leading-none"
                  >
                    {getCategoryCount(cat)}
                  </Badge>
                </button>
              ))}
            </div>

            <RepoFilter
              value={activeRepo}
              onChange={(repo) => updateFilter("repo", repo)}
              counts={repoCounts}
            />

            <section
              aria-label="Filter and sort bounties"
              className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/10 p-3 sm:grid-cols-3 lg:grid-cols-5"
            >
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Minimum reward (ZEC)
                <input
                  aria-label="Minimum reward"
                  type="number"
                  min="0"
                  step="any"
                  value={filters.minReward ?? ""}
                  onChange={(event) =>
                    updateFilter(
                      "minReward",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Maximum reward (ZEC)
                <input
                  aria-label="Maximum reward"
                  type="number"
                  min="0"
                  step="any"
                  value={filters.maxReward ?? ""}
                  onChange={(event) =>
                    updateFilter(
                      "maxReward",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Deadline (on or before)
                <input
                  aria-label="Deadline on or before"
                  type="date"
                  value={filters.deadline}
                  onChange={(event) =>
                    updateFilter("deadline", event.target.value)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Status
                <select
                  aria-label="Status"
                  value={filters.status}
                  onChange={(event) =>
                    updateFilter(
                      "status",
                      event.target.value as BountyBoardFilters["status"],
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_review">In review</option>
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Team
                <select
                  aria-label="Team"
                  value={filters.teamId}
                  onChange={(event) =>
                    updateFilter("teamId", event.target.value)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">All teams</option>
                  {filterTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-1">
                Sort by
                <select
                  aria-label="Sort bounties"
                  value={filters.sort}
                  onChange={(event) =>
                    updateFilter(
                      "sort",
                      event.target.value as BountyBoardFilters["sort"],
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="newest">Newest</option>
                  <option value="highest_reward">Highest reward</option>
                  <option value="soonest_deadline">Soonest deadline</option>
                </select>
              </label>
              {requiresCompleteResults && (
                <div className="col-span-2 flex items-end justify-between gap-2 text-xs text-muted-foreground sm:col-span-3 lg:col-span-5">
                  <span aria-live="polite">
                    {bountiesLoading && hasMoreBounties
                      ? "Loading all bounties for complete filter results…"
                      : filterLoadError
                        ? "Could not load all bounties. Showing the results currently available."
                        : `${filteredBounties.length} matching bounties`}
                  </span>
                  {filterLoadError && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        filterLoadStarted.current = false;
                        setFilterLoadRetry((attempt) => attempt + 1);
                        setFilterLoadError(false);
                      }}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const nextFilters = { ...DEFAULT_BOUNTY_BOARD_FILTERS };
                      setFilters(nextFilters);
                      const params = writeBountyBoardFilters(
                        new URLSearchParams(window.location.search),
                        nextFilters,
                      );
                      const query = params.toString();
                      window.history.replaceState(
                        null,
                        "",
                        `${pathname}${query ? `?${query}` : ""}`,
                      );
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </section>

            <div className="space-y-6 min-w-0 flex-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-3 sm:pb-4 border-b">
                <h2 className="truncate text-base sm:text-xl font-bold">
                  {activeTeamId
                    ? `${communities.find((c) => c.id === activeTeamId)?.name ?? "Team"} Bounties`
                    : activeCategory === "All"
                      ? "All Bounties"
                      : `${activeCategory} Bounties`}
                </h2>

                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("grid")}
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("list")}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "defrag" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("defrag")}
                    title="Defrag map view"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  {canLoadMore && (
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore || bountiesLoading}
                      >
                        {isLoadingMore || bountiesLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronsDown className="h-4 w-4" />
                        )}
                      </Button>
                      <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                        Load more
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {bountiesLoading && bounties.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Loading bounties...</p>
                </div>
              ) : filteredBounties.length === 0 ? (
                <div className="text-center py-12 sm:py-20 px-4 border rounded-xl bg-muted/20">
                  <p className="text-muted-foreground">
                    No bounties found
                    {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                    {searchQuery ? " matching your search" : ""}.
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="overflow-x-auto pb-4 -mx-1 px-1">
                  <div className="flex gap-3 sm:gap-4 items-start min-w-max snap-x snap-mandatory">
                    {kanbanGroups.map((col) => (
                      <div
                        key={col.status}
                        className="snap-start flex flex-col gap-3 w-[80vw] max-w-72 sm:w-72 flex-shrink-0"
                      >
                        <div
                          className={`rounded-lg border border-t-2 bg-muted/30 px-3 py-2 flex items-center justify-between ${col.color}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${col.dotColor}`}
                            />
                            <span className="text-sm font-semibold">
                              {col.label}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {col.bounties.length}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-3">
                          {col.bounties.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/10 py-8 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground">
                                No bounties
                              </p>
                            </div>
                          ) : (
                            col.bounties.map((bounty) => (
                              <BountyCard
                                key={bounty.id}
                                bounty={bounty}
                                viewMode="kanban"
                                onClick={() => openBounty(bounty)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : viewMode === "list" ? (
                <div className="space-y-8">
                  {kanbanGroups
                    .filter((col) => col.bounties.length > 0)
                    .map((col) => (
                      <div key={col.status} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${col.dotColor}`}
                          />
                          <h3 className="text-sm font-semibold">{col.label}</h3>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {col.bounties.length}
                          </Badge>
                          <div className="flex-1 border-t border-border/50 ml-1" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {col.bounties.map((bounty) => (
                            <BountyCard
                              key={bounty.id}
                              bounty={bounty}
                              viewMode="list"
                              onClick={() => openBounty(bounty)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                // defrag view
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {DEFRAG_LEGEND.map((item) => (
                      <div
                        key={item.status}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className={`inline-block h-3 w-3 border border-black/80 ${item.color}`}
                        />
                        <span>{item.label}</span>
                      </div>
                    ))}
                    <span className="w-full sm:w-auto sm:ml-auto text-[11px] opacity-70">
                      {filteredBounties.length} bounties · click a block to open
                    </span>
                  </div>
                  <div
                    className="rounded border border-border bg-black p-1.5 overflow-hidden"
                    style={{
                      // Classic dense map look
                      imageRendering: "pixelated",
                    }}
                  >
                    <div className="grid gap-px [grid-template-columns:repeat(auto-fill,10px)] sm:[grid-template-columns:repeat(auto-fill,14px)] justify-start">
                      {defragBounties.map((bounty) => {
                        const color =
                          DEFRAG_STATUS_COLORS[bounty.status] ?? "bg-zinc-600";
                        return (
                          <button
                            key={bounty.id}
                            type="button"
                            title={`${bounty.title} — ${formatStatus(bounty.status)}`}
                            onClick={() => openBounty(bounty)}
                            className={`
                              relative h-[10px] w-[10px] sm:h-[14px] sm:w-[14px]
                              border border-black/90 ${color}
                              hover:z-10 hover:scale-[1.8] hover:border-white
                              focus:outline-none focus:ring-1 focus:ring-white
                              transition-transform duration-75
                              cursor-pointer
                            `}
                          >
                            {/* center "data" pixel for Done / In Progress (classic map look) */}
                            {(bounty.status === "DONE" ||
                              bounty.status === "IN_PROGRESS") && (
                              <span className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-white/80 pointer-events-none" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {canLoadMore && <div ref={sentinelRef} className="h-4" />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function HomePage() {
  // useRoleGuard("CLIENT");
  return (
    <ProtectedRoute blockAdmin blockTeam>
      <HomeContent />
    </ProtectedRoute>
  );
}
