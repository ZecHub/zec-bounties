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
  Filter,
  ArrowRight,
  Loader2,
  ChevronsDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
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
    hasMoreBounties,
    fetchBountyById,
  } = useBounty();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "defrag">("grid");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isTeamsSheetOpen, setIsTeamsSheetOpen] = useState(false);

  // currentUser is guaranteed non-null here — ProtectedRoute handles the gate
  const displayCategories = ["All", ...categories.map((c) => c.name)];

  const filteredBounties = useMemo(() => {
    let filtered = bounties;
    if (activeTeamId) {
      filtered = filtered.filter((b) => b.teamId === activeTeamId);
    }
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
    return filtered.sort(
      (a, b) =>
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [bounties, searchQuery, activeCategory, activeTeamId]);

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

  const canLoadMore =
    hasMoreBounties &&
    !searchQuery &&
    activeCategory === "All" &&
    !activeTeamId;

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
                setActiveTeamId(id);
                setIsTeamsSheetOpen(false); // close after picking, feels more native
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <BottomTabBar
        onNewBounty={handleNewBounty}
        onOpenTeams={() => setIsTeamsSheetOpen(true)}
        teamsActive={!!activeTeamId}
      />
      <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-3 imd:px-4 py-6 imd:py-8">
        <HeroCarousel onNewBounty={handleNewBounty} />

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
              className="w-full sm:w-auto rounded-full shadow-lg shadow-primary/20"
              onClick={handleNewBounty}
            >
              <Plus className="mr-2 h-4 w-4" /> New Bounty
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
              onSelectTeam={setActiveTeamId}
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
                  onClick={() => setActiveCategory(cat)}
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
