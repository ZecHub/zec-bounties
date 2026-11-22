"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { RevisedBountyCard } from "@/components/revised-bounty-card";
import { Button } from "@/components/ui/button";
import {
  List,
  Grid3X3,
  Filter,
  ArrowRight,
  Loader2,
  ChevronsDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { RepoFilter } from "@/components/repo-filter";
import { FilterChip } from "@/components/filter-panel";
import { bountyRepo, type RepoId } from "@/lib/repos";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import { formatStatus } from "@/lib/utils";

type StatusView =
  | "open"
  | "assigned"
  | "in_review"
  | "done"
  | "cancelled"
  | "all";

const STATUS_VIEWS: {
  value: StatusView;
  label: string;
  status: BountyStatus | null; // null = every status
}[] = [
  { value: "open", label: "Open", status: "TO_DO" },
  { value: "assigned", label: "In progress", status: "IN_PROGRESS" },
  { value: "in_review", label: "In review", status: "IN_REVIEW" },
  { value: "done", label: "Done", status: "DONE" },
  { value: "cancelled", label: "Cancelled", status: "CANCELLED" },
  { value: "all", label: "All", status: null },
];

// Windows 98-style defrag map colors
const DEFRAG_STATUS_COLORS: Record<BountyStatus, string> = {
  TO_DO: "bg-cyan-400",
  IN_PROGRESS: "bg-blue-800",
  IN_REVIEW: "bg-red-500",
  DONE: "bg-blue-500",
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

const STATUS_ORDER: BountyStatus[] = [
  "TO_DO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

export default function RootPage() {
  const {
    bounties,
    currentUser,
    categories,
    bountiesLoading,
    isLoading,
    loadMoreBounties,
    loadAllBounties,
    hasMoreBounties,
    fetchBountyById,
  } = useBounty();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeCategory, setActiveCategory] = useState("All");
  const [activeRepo, setActiveRepo] = useState<RepoId | "all" | "untagged">(
    "all",
  );
  const [statusView, setStatusView] = useState<StatusView>("open"); // default: open
  const [viewMode, setViewMode] = useState<"list" | "defrag">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadAllStarted = useRef(false);

  const activeStatus = STATUS_VIEWS.find((v) => v.value === statusView)!;
  const statusLabel = statusView === "all" ? "All" : activeStatus.label;

  // Redirect logged-in users to the page for their role
  useEffect(() => {
    if (isLoading || !currentUser) return;

    switch (currentUser.role) {
      case "CLIENT":
        router.replace("/onboarding"); // legacy role — push through onboarding to become HUNTER
        break;
      case "HUNTER":
        router.replace("/home");
        break;
      case "TEAM":
        router.replace("/teams");
        break;
      case "ADMIN":
        router.replace("/admin");
        break;
      default:
        // Unknown/future role — don't leave the user on a blank page
        router.replace("/home");
        break;
    }
  }, [currentUser, isLoading, router]);

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

  // Statuses other than "open" can sit on later pages, so load everything
  useEffect(() => {
    if (statusView === "open") {
      loadAllStarted.current = false;
      return;
    }
    if (!hasMoreBounties || bountiesLoading || loadAllStarted.current) return;
    loadAllStarted.current = true;
    void loadAllBounties();
  }, [statusView, hasMoreBounties, bountiesLoading, loadAllBounties]);

  const displayCategories = ["All", ...categories.map((c) => c.name)];

  // 1. Status first (default: open)
  const statusBounties = useMemo(
    () =>
      activeStatus.status === null
        ? bounties
        : bounties.filter((b) => b.status === activeStatus.status),
    [bounties, activeStatus],
  );

  // 2. Category + search
  const categoryFilteredBounties = useMemo(() => {
    let filtered = statusBounties;
    if (activeCategory !== "All")
      filtered = filtered.filter((b) => b.categoryId === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.createdByUser?.name?.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [statusBounties, searchQuery, activeCategory]);

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

  // 3. Repo + newest first
  const filteredBounties = useMemo(() => {
    const filtered =
      activeRepo === "all"
        ? categoryFilteredBounties
        : categoryFilteredBounties.filter((bounty) =>
            activeRepo === "untagged"
              ? bountyRepo(bounty) == null
              : bountyRepo(bounty) === activeRepo,
          );
    return [...filtered].sort(
      (a, b) =>
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [categoryFilteredBounties, activeRepo]);

  // Same-status blocks grouped into contiguous runs, newest first within a status
  const defragBounties = useMemo(
    () =>
      [...filteredBounties].sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return ai - bi;
        return (
          new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
        );
      }),
    [filteredBounties],
  );

  // Open a bounty and reflect it in the URL
  const openBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setIsDetailModalOpen(true);
    router.push(`${pathname}?bounty=${bounty.id}`, { scroll: false });
  };

  const closeBounty = () => {
    setIsDetailModalOpen(false);
    router.push(pathname, { scroll: false }); // strips the query param
  };

  const getCategoryCount = (name: string) =>
    name === "All"
      ? statusBounties.length
      : statusBounties.filter((b) => b.categoryId === name).length;

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      await loadMoreBounties();
    } finally {
      setIsLoadingMore(false);
    }
  };

  // While auth or bounties are loading, show spinner (but not during load-more)
  if (isLoading || (bountiesLoading && bounties.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Logged-in users are being redirected, render nothing
  if (currentUser) return null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight">
              Browse Bounties
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Explore available bounties. Sign in to apply and start earning
              ZEC.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-full bg-transparent"
              onClick={() => router.push("/login?redirect=/home")}
            >
              Sign In <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={(open) =>
            open ? setIsDetailModalOpen(true) : closeBounty()
          }
        />

        <div className="imd:flex imd:flex-row gap-8 min-w-0 grid grid-cols-1">
          <aside className="space-y-8 flex-shrink-0">
            <div className="imd:w-64">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Filter className="h-4 w-4" /> Categories
              </h3>
              <div className="flex flex-col gap-1">
                {displayCategories.map((cat) => (
                  <Button
                    key={cat}
                    variant={activeCategory === cat ? "secondary" : "ghost"}
                    onClick={() => setActiveCategory(cat)}
                    className={`justify-start px-3 h-9 ${activeCategory === cat ? "font-bold text-primary" : "text-muted-foreground hover:text-primary"}`}
                  >
                    {cat}
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {getCategoryCount(cat)}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          </aside>

          <div className="lg:col-span-3 space-y-6 min-w-0 flex-1">
            <RepoFilter
              value={activeRepo}
              onChange={setActiveRepo}
              counts={repoCounts}
            />
            <div className="flex items-center justify-between pb-4 border-b">
              <h2 className="text-xl font-bold">
                {activeCategory === "All"
                  ? `${statusLabel} Bounties`
                  : `${statusLabel} ${activeCategory} Bounties`}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("list")}
                  aria-label="Show bounties in list view"
                  aria-pressed={viewMode === "list"}
                  title="List view"
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={viewMode === "defrag" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("defrag")}
                  aria-label="Show bounties in defrag map view"
                  aria-pressed={viewMode === "defrag"}
                  title="Defrag map view"
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden="true" />
                </Button>
                {hasMoreBounties &&
                  statusView === "open" &&
                  !searchQuery &&
                  activeCategory === "All" && (
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore || bountiesLoading}
                        aria-label={
                          isLoadingMore || bountiesLoading
                            ? "Loading more bounties"
                            : "Load more bounties"
                        }
                      >
                        {isLoadingMore || bountiesLoading ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronsDown
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                      </Button>
                      <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                        Load more
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Status filter — defaults to Open */}
            <div
              role="group"
              aria-label="Bounty status"
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {STATUS_VIEWS.map((v) => (
                <FilterChip
                  key={v.value}
                  active={statusView === v.value}
                  onClick={() => setStatusView(v.value)}
                >
                  {v.label}
                </FilterChip>
              ))}
            </div>

            {filteredBounties.length === 0 ? (
              <div className="text-center py-20 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground">
                  No {statusLabel.toLowerCase()} bounties found
                  {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                  {searchQuery ? " matching your search" : ""}.
                </p>
              </div>
            ) : viewMode === "defrag" ? (
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
                  style={{ imageRendering: "pixelated" }}
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
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredBounties.map((bounty) => (
                  <RevisedBountyCard
                    key={bounty.id}
                    bounty={bounty}
                    onClick={() => openBounty(bounty)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
