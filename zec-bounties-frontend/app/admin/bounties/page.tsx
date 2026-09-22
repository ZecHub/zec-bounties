"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { DUMMY_BOUNTIES } from "@/lib/data";
import { BountyCard } from "@/components/bounty-card";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Grid3X3,
  Plus,
  Filter,
  ArrowRight,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AdminBountyModal } from "@/components/admin-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import { formatStatus } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Input } from "@/components/ui/input";
import { WalletGuard } from "@/components/settings/wallet-guard";

const STATUS_DOT: Record<BountyStatus, string> = {
  TO_DO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  IN_REVIEW: "bg-yellow-500",
  DONE: "bg-green-500",
  CANCELLED: "bg-red-500",
};

const MARKETPLACE_STATUS_FILTERS: {
  status: BountyStatus | "all";
  label: string;
}[] = [
  { status: "all", label: "All" },
  { status: "TO_DO", label: "Todo" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "IN_REVIEW", label: "In Review" },
  { status: "DONE", label: "Done" },
  { status: "CANCELLED", label: "Cancelled" },
];

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

export default function MarketplacePage() {
  const {
    bounties,
    bountiesLoading,
    hasMoreBounties,
    loadMoreBounties,
    loadAllBounties,
    currentUser,
    categories,
    createCategory,
    fetchBountyById,
  } = useBounty();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "defrag">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BountyStatus | "all">("all");
  const [isAdminBountyModalOpen, setIsAdminBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [defragListOpen, setDefragListOpen] = useState(false);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");

  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMoreBounties || viewMode === "defrag") return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !bountiesLoading) {
          loadMoreBounties();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreBounties, bountiesLoading, loadMoreBounties, viewMode]);

  const openBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setIsDetailModalOpen(true);
    router.push(`${pathname}?bounty=${bounty.id}`, { scroll: false });
  };

  const closeBounty = () => {
    setIsDetailModalOpen(false);
    router.push(pathname, { scroll: false });
  };

  const handleAddCategory = async () => {
    if (newCategoryName.trim() === "") return;

    if (categories.some((cat) => cat.name === newCategoryName.trim())) {
      setCategoryError("Category already exists!");
      return;
    }

    try {
      await createCategory(newCategoryName.trim());
      setNewCategoryName("");
      setIsAddingCategory(false);
      setCategoryError("");
    } catch (error) {
      console.error("Failed to create category:", error);
      setCategoryError(
        error instanceof Error ? error.message : "Failed to create category",
      );
    }
  };

  const handleCancelAddCategory = () => {
    setNewCategoryName("");
    setIsAddingCategory(false);
    setCategoryError("");
  };

  const displayCategories = ["All", ...categories.map((cat) => cat.name)];

  const categorySearchFilteredBounties = useMemo(() => {
    let filtered = bounties;

    if (activeCategory !== "All") {
      filtered = filtered.filter(
        (bounty) => bounty.categoryId === activeCategory,
      );
    }

    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bounty) =>
          bounty.title.toLowerCase().includes(searchLower) ||
          bounty.description.toLowerCase().includes(searchLower) ||
          bounty.createdByUser?.name?.toLowerCase().includes(searchLower),
      );
    }

    return filtered;
  }, [bounties, activeCategory, searchQuery]);

  const statusCountFor = (status: BountyStatus | "all") =>
    status === "all"
      ? categorySearchFilteredBounties.length
      : categorySearchFilteredBounties.filter((b) => b.status === status)
          .length;

  const filteredBounties = useMemo(() => {
    let filtered = bounties;

    if (activeCategory !== "All") {
      filtered = filtered.filter(
        (bounty) => bounty.categoryId === activeCategory,
      );
    }

    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bounty) =>
          bounty.title.toLowerCase().includes(searchLower) ||
          bounty.description.toLowerCase().includes(searchLower) ||
          bounty.createdByUser?.name?.toLowerCase().includes(searchLower),
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((bounty) => bounty.status === statusFilter);
    }

    return filtered.sort(
      (a, b) =>
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [bounties, searchQuery, activeCategory, statusFilter]);

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

  const getCategoryCount = (categoryName: string) => {
    if (categoryName === "All") {
      return bounties.length;
    }
    return bounties.filter((bounty) => bounty.categoryId === categoryName)
      .length;
  };

  useEffect(() => {
    const bountyId = searchParams.get("bounty");
    if (!bountyId) return;

    const inMemory = bounties.find((b) => b.id === bountyId);
    if (inMemory) {
      setSelectedBounty(inMemory);
      setIsDetailModalOpen(true);
      return;
    }

    fetchBountyById(bountyId).then((bounty) => {
      if (bounty) {
        setSelectedBounty(bounty);
        setIsDetailModalOpen(true);
      }
    });
  }, [searchParams, bounties, fetchBountyById]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AdminNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="imd:container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold">Admin Console</h1>
            <p className="text-muted-foreground">
              Platform-wide overview and management
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              className="rounded-full shadow-lg shadow-primary/20"
              onClick={() => setIsAdminBountyModalOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> New Bounty
            </Button>
          </div>
        </div>

        <AdminBountyModal
          open={isAdminBountyModalOpen}
          onOpenChange={setIsAdminBountyModalOpen}
        />

        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={(open) =>
            open ? setIsDetailModalOpen(true) : closeBounty()
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Categories
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsAddingCategory(!isAddingCategory)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </h3>

              {isAddingCategory && (
                <div className="mb-3 p-2 border rounded-lg bg-card/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      type="text"
                      placeholder="New category..."
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        setCategoryError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddCategory();
                        } else if (e.key === "Escape") {
                          handleCancelAddCategory();
                        }
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={handleAddCategory}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleCancelAddCategory}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {categoryError && (
                    <p className="text-xs text-red-500 mt-1">{categoryError}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                {displayCategories.map((cat) => (
                  <Button
                    key={cat}
                    variant={activeCategory === cat ? "secondary" : "ghost"}
                    onClick={() => setActiveCategory(cat)}
                    className={`justify-start px-3 h-9 ${
                      activeCategory === cat
                        ? "font-bold text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }`}
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

          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b">
              <h2 className="text-xl font-bold">
                {activeCategory === "All"
                  ? "All Bounties"
                  : `${activeCategory} Bounties`}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("list")}
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
              </div>
            </div>

            <div
              className="-mx-1 mb-4 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {MARKETPLACE_STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.status;
                return (
                  <button
                    key={f.status}
                    onClick={() => setStatusFilter(f.status)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {f.status !== "all" && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[f.status]}`}
                      />
                    )}
                    {f.label}
                    <span className="tabular-nums opacity-60">
                      {statusCountFor(f.status)}
                    </span>
                  </button>
                );
              })}
            </div>

            {viewMode === "defrag" ? (
              filteredBounties.length === 0 ? (
                <div className="text-center py-20 border rounded-xl bg-muted/20">
                  <p className="text-muted-foreground">
                    No bounties found
                    {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                    {searchQuery ? " matching your search" : ""}.
                  </p>
                </div>
              ) : (
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
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[11px] opacity-70">
                        {filteredBounties.length} bounties · click a block to
                        open
                      </span>
                      <Sheet
                        open={defragListOpen}
                        onOpenChange={setDefragListOpen}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 gap-1.5 px-2.5 text-xs"
                          disabled={bountiesLoading}
                          onClick={async () => {
                            setDefragListOpen(true);
                            await loadAllBounties();
                          }}
                        >
                          {bountiesLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <List className="h-3.5 w-3.5" />
                          )}
                          List all
                        </Button>
                        <SheetContent
                          side="right"
                          className="flex w-full flex-col sm:max-w-md"
                        >
                          <SheetHeader>
                            <SheetTitle>
                              {activeCategory === "All"
                                ? "All bounties"
                                : `${activeCategory} bounties`}
                            </SheetTitle>
                            <SheetDescription>
                              {defragBounties.length} on the defrag map
                              {hasMoreBounties ? " · loading the rest…" : ""}
                            </SheetDescription>
                          </SheetHeader>
                          <div className="mt-4 flex-1 overflow-y-auto pr-1">
                            <ul className="space-y-1">
                              {defragBounties.map((bounty) => {
                                const color =
                                  DEFRAG_STATUS_COLORS[bounty.status] ??
                                  "bg-zinc-600";
                                return (
                                  <li key={bounty.id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDefragListOpen(false);
                                        openBounty(bounty);
                                      }}
                                      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                                    >
                                      <span
                                        className={`mt-1 inline-block h-3 w-3 shrink-0 border border-black/80 ${color}`}
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">
                                          {bounty.title}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                          {formatStatus(bounty.status)}
                                          {typeof bounty.bountyAmount ===
                                          "number"
                                            ? ` · ${bounty.bountyAmount} ZEC`
                                            : ""}
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>
                  </div>
                  <div
                    className="rounded border border-border bg-black p-1.5 overflow-hidden"
                    style={{ imageRendering: "pixelated" }}
                  >
                    <div
                      className="grid gap-px"
                      style={{
                        gridTemplateColumns: "repeat(auto-fill, 14px)",
                        justifyContent: "start",
                      }}
                    >
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
                              relative h-[14px] w-[14px]
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
                  {(hasMoreBounties || bountiesLoading) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading remaining bounties…
                    </div>
                  )}
                </div>
              )
            ) : filteredBounties.length > 0 ? (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                    : "flex flex-col gap-4"
                }
              >
                {filteredBounties.map((bounty) => (
                  <BountyCard
                    key={bounty.id}
                    bounty={bounty}
                    viewMode={viewMode}
                    onClick={() => openBounty(bounty)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground">
                  No bounties found
                  {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                  {searchQuery ? " matching your search" : ""}.
                </p>
              </div>
            )}

            {hasMoreBounties && viewMode !== "defrag" && (
              <div
                ref={loadMoreSentinelRef}
                className="pt-8 flex justify-center text-xs text-muted-foreground"
              >
                {bountiesLoading && (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading more…
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
