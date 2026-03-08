"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { BountyCard } from "@/components/bounty-card";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Plus,
  Filter,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useRoleGuard } from "@/hooks/use-role-guard";

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

function HomeContent() {
  const { bounties, currentUser, categories, bountiesLoading } = useBounty();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // currentUser is guaranteed non-null here — ProtectedRoute handles the gate
  const displayCategories = ["All", ...categories.map((c) => c.name)];

  const filteredBounties = useMemo(() => {
    let filtered = bounties;
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
  }, [bounties, searchQuery, activeCategory]);

  const kanbanGroups = useMemo(
    () =>
      KANBAN_COLUMNS.map((col) => ({
        ...col,
        bounties: filteredBounties.filter((b) => b.status === col.status),
      })),
    [filteredBounties],
  );

  const getCategoryCount = (name: string) =>
    name === "All"
      ? bounties.length
      : bounties.filter((b) => b.categoryId === name).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight">Welcome!</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Complete tasks to earn ZEC. You could also create yours and get
              ZEC for it.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              className="rounded-full shadow-lg shadow-primary/20"
              onClick={() => setIsNewBountyModalOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> New Bounty
            </Button>
            <Link href="/my-bounties">
              <Button variant="outline" className="rounded-full bg-transparent">
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
          onOpenChange={setIsDetailModalOpen}
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
              </div>
            </div>

            {bountiesLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading bounties...</p>
              </div>
            ) : viewMode === "grid" ? (
              filteredBounties.length === 0 ? (
                <div className="text-center py-20 border rounded-xl bg-muted/20">
                  <p className="text-muted-foreground">
                    No bounties found
                    {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                    {searchQuery ? " matching your search" : ""}.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4 -mx-1 px-1">
                  <div className="flex gap-4 items-start min-w-max">
                    {kanbanGroups.map((col) => (
                      <div
                        key={col.status}
                        className="flex flex-col gap-3 w-72 flex-shrink-0"
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
                                onClick={() => {
                                  setSelectedBounty(bounty);
                                  setIsDetailModalOpen(true);
                                }}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : filteredBounties.length > 0 ? (
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
                            onClick={() => {
                              setSelectedBounty(bounty);
                              setIsDetailModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </div>
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
          </div>
        </div>
      </div>
    </main>
  );
}

export default function HomePage() {
  useRoleGuard("CLIENT");
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
