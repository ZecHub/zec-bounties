"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { DUMMY_BOUNTIES } from "@/lib/data";
import { BountyCard } from "@/components/bounty-card";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Plus,
  Filter,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminBountyModal } from "@/components/admin-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Input } from "@/components/ui/input";
import { WalletGuard } from "@/components/settings/wallet-guard";

export default function MarketplacePage() {
  const { bounties, currentUser, categories, createCategory } = useBounty();
  const [activeCategory, setActiveCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BountyStatus | "all">("all");
  const [isAdminBountyModalOpen, setIsAdminBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // New states for category creation
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");

  const handleAddCategory = async () => {
    if (newCategoryName.trim() === "") return;

    // Check if category already exists
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

  // Convert categories to display format (add "All" option)
  const displayCategories = ["All", ...categories.map((cat) => cat.name)];

  const filteredBounties = useMemo(() => {
    let filtered = bounties;

    // Category filter
    if (activeCategory !== "All") {
      filtered = filtered.filter(
        (bounty) => bounty.categoryId === activeCategory,
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bounty) =>
          bounty.title.toLowerCase().includes(searchLower) ||
          bounty.description.toLowerCase().includes(searchLower) ||
          bounty.createdByUser?.name?.toLowerCase().includes(searchLower),
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((bounty) => bounty.status === statusFilter);
    }

    return filtered.sort(
      (a, b) =>
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [bounties, searchQuery, activeCategory, statusFilter]);

  // Get count for each category
  const getCategoryCount = (categoryName: string) => {
    if (categoryName === "All") {
      return bounties.length;
    }
    return bounties.filter((bounty) => bounty.categoryId === categoryName)
      .length;
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AdminNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="imd:container mx-auto px-4 py-8">
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
              onClick={() => setIsAdminBountyModalOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> New Bounty
            </Button>
            <Link href="/my-bounties">
              <Button variant="outline" className="rounded-full bg-transparent">
                My Submissions <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <AdminBountyModal
          open={isAdminBountyModalOpen}
          onOpenChange={setIsAdminBountyModalOpen}
        />

        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar filters */}
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

              {/* Category input form */}
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

            <div className="rounded-xl border bg-card/30 p-4 border-dashed hidden">
              <h4 className="font-semibold text-sm mb-2">Become a Partner</h4>
              <p className="text-xs text-muted-foreground mb-4">
                List your technical challenges and find top-tier developers.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs bg-transparent"
              >
                Integrations Console
              </Button>
            </div>
          </aside>

          {/* Main content */}
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
              </div>
            </div>

            {filteredBounties.length > 0 ? (
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
                    onClick={() => {
                      setSelectedBounty(bounty);
                      setIsDetailModalOpen(true);
                    }}
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

            <div className="pt-8 flex justify-center">
              <Button
                variant="outline"
                className="rounded-full px-8 bg-transparent"
              >
                Load More Bounties
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
