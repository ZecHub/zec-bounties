"use client";

import {
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { useBounty } from "@/lib/bounty-context";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { useState, useMemo } from "react";
import { Bounty } from "@/lib/types";
import type { BountyStatus } from "@/lib/types";

const STATUS_COLUMNS: {
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

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type ViewMode = "bounties" | "earnings";

export default function MyBountiesPage() {
  const { myBounties, myBountiesLoading, fetchMyBounties, currentUser } =
    useBounty();
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("bounties");
  const [statusFilter, setStatusFilter] = useState<BountyStatus | "ALL">("ALL");
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);
  const [hasSeenEarnings, setHasSeenEarnings] = useState(false);

  const router = useRouter();

  const userBounties = myBounties;

  const visibleBounties = useMemo(
    () =>
      statusFilter === "ALL"
        ? userBounties
        : userBounties.filter((b) => b.status === statusFilter),
    [userBounties, statusFilter],
  );

  const groupedBounties = useMemo(
    () =>
      STATUS_COLUMNS.map((col) => ({
        ...col,
        bounties: visibleBounties.filter((b) => b.status === col.status),
      })),
    [visibleBounties],
  );

  const stats = useMemo(() => {
    const source = userBounties;
    const done = source.filter((b) => b.status === "DONE");
    return {
      totalRewards: done.reduce((sum, b) => sum + b.bountyAmount, 0),
      activeBounties: source.filter((b) => b.status === "IN_PROGRESS").length,
      completed: done.length,
      totalApplications: source.reduce(
        (sum, b) => sum + ((b as any).applications?.length || 0),
        0,
      ),
    };
  }, [userBounties]);

  const monthlyEarnings = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const mapAmount: Record<number, number> = {};
    const mapBounties: Record<number, Bounty[]> = {};
    const source = userBounties;
    source
      .filter((b) => b.status === "DONE")
      .forEach((b) => {
        const raw = (b as any).dateCreated ?? (b as any).createdAt ?? null;
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime()) || d.getFullYear() !== currentYear) return;
        const m = d.getMonth();
        mapAmount[m] = (mapAmount[m] || 0) + b.bountyAmount;
        mapBounties[m] = [...(mapBounties[m] || []), b];
      });
    return MONTH_LABELS.map((label, i) => ({
      label,
      amount: mapAmount[i] || 0,
      bounties: mapBounties[i] || [],
    }));
  }, [userBounties]);

  const maxEarning = Math.max(...monthlyEarnings.map((m) => m.amount), 1);
  const yearTotal = monthlyEarnings.reduce((s, m) => s + m.amount, 0);

  const totalEarnedAllTime = useMemo(() => {
    const source = userBounties;
    return source
      .filter((b) => b.status === "DONE")
      .reduce((s, b) => s + b.bountyAmount, 0);
  }, [userBounties]);

  const missingUA = !currentUser?.UA_address;

  const openBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setIsDetailModalOpen(true);
  };

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

  return (
    <ProtectedRoute blockAdmin>
      <main className="min-h-screen bg-background">
        <Navbar />

        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={(open) => {
            setIsDetailModalOpen(open);
            if (!open) fetchMyBounties();
          }}
        />

        <NewBountyModal
          open={isNewBountyModalOpen}
          onOpenChange={setIsNewBountyModalOpen}
          onSuccess={() => {
            setIsNewBountyModalOpen(false);
            fetchMyBounties();
          }}
          onCancel={() => setIsNewBountyModalOpen(false)}
        />

        <div className="max-w-7xl mx-auto px-3 sam:px-4 imd:px-6 lg:px-8 py-5 imd:py-8">
          {/* ── Header ── */}
          <div className="flex flex-col imd:flex-row imd:items-end justify-between gap-3 mb-5 imd:mb-8">
            <div>
              <h1 className="text-2xl sam:text-3xl font-extrabold mb-1">
                My Bounties
              </h1>
              <p className="text-sm text-muted-foreground">
                Track your active submissions, history, and earnings.
              </p>
            </div>
            <Button
              className="gap-2 rounded-full shadow-lg shadow-primary/20 shrink-0"
              onClick={handleNewBounty}
            >
              <Plus className="w-4 h-4" /> New Bounty
            </Button>
          </div>

          {/* ── Stats — 2-col on phones, 4-col on imd+ ── */}
          <div className="grid grid-cols-2 imd:grid-cols-4 gap-2 sam:gap-3 imd:gap-4 mb-5 imd:mb-8">
            {[
              {
                label: "Total Earned",
                Icon: TrendingUp,
                value: (
                  <>
                    {totalEarnedAllTime.toLocaleString()}{" "}
                    <span className="text-xs font-medium">ZEC</span>
                  </>
                ),
              },
              { label: "Active", Icon: Clock, value: stats.activeBounties },
              { label: "Completed", Icon: CheckCircle, value: stats.completed },
              {
                label: "Applications",
                Icon: AlertCircle,
                value: stats.totalApplications,
              },
            ].map(({ label, Icon, value }) => (
              <Card key={label} className="bg-card border-border">
                <CardContent className="pt-3 pb-3 px-3 sam:pt-4 sam:pb-4 sam:px-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-base sam:text-lg font-bold mt-0.5 truncate">
                        {value}
                      </p>
                    </div>
                    <Icon className="w-5 h-5 sam:w-6 sam:h-6 text-primary opacity-20 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Toolbar ── */}
          <div className="flex flex-col gap-2 sam:gap-3 pb-3 sam:pb-4 border-b mb-4 sam:mb-6">
            {/* Title row + earnings toggle */}

            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sam:text-lg imd:text-xl font-bold">
                All Bounties
              </h2>
              <div className="relative shrink-0">
                {!hasSeenEarnings && viewMode !== "earnings" && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                    <span className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                  </>
                )}
                <Button
                  variant={viewMode === "earnings" ? "secondary" : "ghost"}
                  size="icon"
                  className="relative h-8 w-8"
                  title="Monthly earnings"
                  onClick={() => {
                    setHasSeenEarnings(true);
                    setViewMode((v) =>
                      v === "earnings" ? "bounties" : "earnings",
                    );
                  }}
                >
                  <BarChart2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Status pills — horizontal scroll on phones, wraps on imd+ */}
            {viewMode === "bounties" && (
              <div className="overflow-x-auto -mx-3 px-3 sam:-mx-4 sam:px-4 imd:mx-0 imd:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-1 sam:gap-1.5 min-w-max imd:min-w-0 imd:flex-wrap">
                  <button
                    onClick={() => setStatusFilter("ALL")}
                    className={`flex items-center gap-1 sam:gap-1.5 px-2.5 sam:px-3 py-1.5 rounded-full border text-xs sam:text-sm transition-all whitespace-nowrap ${
                      statusFilter === "ALL"
                        ? "border-border bg-muted font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    All
                    <span className="text-[10px] sam:text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                      {userBounties.length}
                    </span>
                  </button>

                  {STATUS_COLUMNS.map((col) => {
                    const count = userBounties.filter(
                      (b) => b.status === col.status,
                    ).length;
                    const isActive = statusFilter === col.status;
                    return (
                      <button
                        key={col.status}
                        onClick={() => setStatusFilter(col.status)}
                        className={`flex items-center gap-1 sam:gap-1.5 px-2.5 sam:px-3 py-1.5 rounded-full border text-xs sam:text-sm transition-all whitespace-nowrap ${
                          isActive
                            ? "border-border bg-muted font-medium text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${col.dotColor}`}
                        />
                        {col.label}
                        <span className="text-[10px] sam:text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Bounties view ── */}
          {viewMode === "bounties" && (
            <>
              {myBountiesLoading && userBounties.length === 0 ? (
                <div className="flex items-center justify-center py-14 imd:py-20 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading your bounties…</span>
                </div>
              ) : userBounties.length === 0 ? (
                <EmptyState />
              ) : visibleBounties.length === 0 ? (
                <div className="text-center py-14 imd:py-20">
                  <p className="text-sm text-muted-foreground">
                    No bounties with this status.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {(statusFilter === "ALL"
                    ? STATUS_COLUMNS.flatMap(
                        (col) =>
                          groupedBounties.find((g) => g.status === col.status)
                            ?.bounties ?? [],
                      )
                    : visibleBounties
                  ).map((bounty) => {
                    const col = STATUS_COLUMNS.find(
                      (c) => c.status === bounty.status,
                    )!;
                    return (
                      <div
                        key={bounty.id}
                        onClick={() => openBounty(bounty)}
                        className="flex items-center gap-3 py-3 sam:py-3.5 cursor-pointer group"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${col.dotColor}`}
                        />
                        <p className="flex-1 min-w-0 text-sm text-foreground truncate group-hover:text-primary transition-colors">
                          {bounty.title}
                        </p>
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {bounty.bountyAmount.toLocaleString()} ZEC
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Monthly Earnings ── */}
          {viewMode === "earnings" && (
            <div className="space-y-4 imd:space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base sam:text-lg imd:text-xl font-bold">
                    Earnings Overview
                  </h2>
                  <p className="text-xs sam:text-sm text-muted-foreground mt-0.5">
                    {new Date().getFullYear()} — tap a month for details
                  </p>
                </div>
                {!myBountiesLoading && yearTotal > 0 && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Year total</p>
                    <p className="text-lg sam:text-xl imd:text-2xl font-bold">
                      {yearTotal.toLocaleString()} ZEC
                    </p>
                  </div>
                )}
              </div>

              {myBountiesLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading earnings…</span>
                </div>
              ) : yearTotal === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border rounded-xl bg-muted/10 gap-2">
                  <CheckCircle className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No completed bounties this year yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 imd:gap-6 items-start">
                  {/* Left: bar chart + month list */}
                  <div className="lg:col-span-3 space-y-3 imd:space-y-4">
                    <Card className="bg-card border-border">
                      <CardContent className="pt-4 pb-3 px-2 sam:px-3 imd:px-4">
                        {/* Bar chart */}
                        <div className="flex items-end gap-0.5 sam:gap-1 imd:gap-1.5 h-28 sam:h-36 imd:h-48">
                          {monthlyEarnings.map((m, i) => {
                            const heightPct =
                              maxEarning > 0
                                ? (m.amount / maxEarning) * 100
                                : 0;
                            const isSelected = selectedMonthIdx === i;
                            const hasData = m.amount > 0;
                            return (
                              <div
                                key={m.label}
                                className={`flex flex-col flex-1 items-center h-full justify-end ${hasData ? "cursor-pointer" : "cursor-default"}`}
                                onClick={() =>
                                  hasData &&
                                  setSelectedMonthIdx(isSelected ? null : i)
                                }
                              >
                                <div className="w-full flex flex-col justify-end h-24 sam:h-32 imd:h-44 relative group">
                                  {hasData && (
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                      <div className="bg-foreground text-background text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap">
                                        {m.amount} ZEC
                                      </div>
                                    </div>
                                  )}
                                  <div className="w-full rounded-sm imd:rounded-md overflow-hidden bg-muted h-24 sam:h-32 imd:h-44 relative">
                                    <div
                                      className={`absolute bottom-0 left-0 right-0 rounded-sm imd:rounded-md transition-all duration-500 ease-out ${
                                        isSelected
                                          ? "bg-primary"
                                          : hasData
                                            ? "bg-primary/40 group-hover:bg-primary/70"
                                            : ""
                                      }`}
                                      style={{ height: `${heightPct}%` }}
                                    />
                                    {isSelected && heightPct > 0 && (
                                      <div
                                        className="absolute left-0 right-0 h-0.5 bg-primary"
                                        style={{ bottom: `${heightPct}%` }}
                                      />
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Month labels */}
                        <div className="flex gap-0.5 sam:gap-1 imd:gap-1.5 mt-1.5">
                          {monthlyEarnings.map((m, i) => (
                            <div
                              key={m.label}
                              className={`flex-1 text-center font-medium transition-colors text-[8px] sam:text-[9px] imd:text-[10px] ${
                                selectedMonthIdx === i
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {m.label}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Month summary list */}
                    <div className="space-y-0.5">
                      {monthlyEarnings
                        .filter((m) => m.amount > 0)
                        .map((m) => {
                          const idx = MONTH_LABELS.indexOf(m.label);
                          const isSelected = selectedMonthIdx === idx;
                          return (
                            <button
                              key={m.label}
                              className={`w-full flex items-center justify-between px-3 sam:px-4 py-3 rounded-lg border transition-all text-left min-h-[48px] ${
                                isSelected
                                  ? "border-primary/50 bg-primary/5"
                                  : "border-transparent hover:border-border hover:bg-muted/30"
                              }`}
                              onClick={() =>
                                setSelectedMonthIdx(isSelected ? null : idx)
                              }
                            >
                              <div className="flex items-center gap-2 sam:gap-3">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? "bg-primary" : "bg-muted-foreground/40"}`}
                                />
                                <span
                                  className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}
                                >
                                  {m.label}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] h-4 px-1.5 font-normal"
                                >
                                  {m.bounties.length}{" "}
                                  {m.bounties.length === 1
                                    ? "bounty"
                                    : "bounties"}
                                </Badge>
                              </div>
                              <span
                                className={`text-sm font-semibold tabular-nums ${isSelected ? "text-primary" : "text-foreground"}`}
                              >
                                {m.amount.toLocaleString()} ZEC
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Right: drill-down panel */}
                  <div className="lg:col-span-2">
                    {selectedMonthIdx === null ? (
                      <div className="flex flex-col items-center justify-center h-36 imd:h-48 rounded-xl border border-dashed border-border text-center px-6">
                        <BarChart2 className="h-6 w-6 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Select a month to see its bounties
                        </p>
                      </div>
                    ) : (
                      <Card className="bg-card border-border overflow-hidden">
                        <div className="px-3 sam:px-4 pt-3 sam:pt-4 pb-3 border-b border-border">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                                {MONTH_LABELS[selectedMonthIdx]}{" "}
                                {new Date().getFullYear()}
                              </p>
                              <p className="text-lg sam:text-xl imd:text-2xl font-bold mt-0.5">
                                {monthlyEarnings[
                                  selectedMonthIdx
                                ].amount.toLocaleString()}{" "}
                                ZEC
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className="mt-1 shrink-0"
                            >
                              {
                                monthlyEarnings[selectedMonthIdx].bounties
                                  .length
                              }{" "}
                              {monthlyEarnings[selectedMonthIdx].bounties
                                .length === 1
                                ? "bounty"
                                : "bounties"}
                            </Badge>
                          </div>
                        </div>

                        <div className="divide-y divide-border max-h-72 imd:max-h-96 overflow-y-auto">
                          {monthlyEarnings[selectedMonthIdx].bounties.map(
                            (b) => (
                              <div
                                key={b.id}
                                className="flex items-center gap-3 px-3 sam:px-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer group min-h-[52px]"
                                onClick={() => openBounty(b)}
                              >
                                <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                    {b.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {new Date(
                                      (b as any).dateCreated ??
                                        (b as any).createdAt,
                                    ).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </p>
                                </div>
                                <span className="text-sm font-semibold shrink-0 tabular-nums">
                                  {b.bountyAmount.toLocaleString()} ZEC
                                </span>
                              </div>
                            ),
                          )}
                        </div>

                        {monthlyEarnings[selectedMonthIdx].bounties.length >
                          1 && (
                          <div className="flex items-center justify-between px-3 sam:px-4 py-2.5 border-t border-border bg-muted/20">
                            <span className="text-xs text-muted-foreground">
                              Total
                            </span>
                            <span className="text-sm font-bold">
                              {monthlyEarnings[
                                selectedMonthIdx
                              ].amount.toLocaleString()}{" "}
                              ZEC
                            </span>
                          </div>
                        )}
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-14 imd:py-20 border rounded-xl bg-muted/20">
      <p className="text-sm text-muted-foreground">
        No bounties yet. Start hunting in the marketplace!
      </p>
    </div>
  );
}
