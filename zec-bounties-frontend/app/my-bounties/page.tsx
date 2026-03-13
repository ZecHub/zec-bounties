"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  LayoutGrid,
  List,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { BountyCard } from "@/components/bounty-card";
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

export default function MyBountiesPage() {
  const { bounties, currentUser } = useBounty();
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const userBounties = useMemo(
    () =>
      currentUser?.role === "ADMIN"
        ? bounties
        : bounties.filter(
            (b) =>
              b.createdBy === currentUser?.id || b.assignee === currentUser?.id,
          ),
    [bounties, currentUser],
  );

  const columns = useMemo(
    () =>
      STATUS_COLUMNS.map((col) => ({
        ...col,
        bounties: userBounties.filter((b) => b.status === col.status),
      })),
    [userBounties],
  );

  const stats = useMemo(
    () => ({
      totalRewards: userBounties
        .filter((b) => b.status === "DONE")
        .reduce((sum, b) => sum + b.bountyAmount, 0),
      activeBounties: userBounties.filter((b) => b.status === "IN_PROGRESS")
        .length,
      completed: userBounties.filter((b) => b.status === "DONE").length,
      totalApplications: userBounties.reduce(
        (sum, b) => sum + (b.applications?.length || 0),
        0,
      ),
    }),
    [userBounties],
  );

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <Navbar />

        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />

        <NewBountyModal
          open={isNewBountyModalOpen}
          onOpenChange={setIsNewBountyModalOpen}
          onSuccess={() => setIsNewBountyModalOpen(false)}
          onCancel={() => setIsNewBountyModalOpen(false)}
        />

        <div className="imd:container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold mb-1">My Bounties</h1>
                <p className="text-muted-foreground">
                  Manage your active submissions and history.
                </p>
              </div>
              <Button
                className="gap-2 rounded-full shadow-lg shadow-primary/20 shrink-0"
                onClick={() => setIsNewBountyModalOpen(true)}
              >
                <Plus className="w-4 h-4" /> New Bounty
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <Card className="bg-card border-border">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total Rewards
                    </p>
                    <p className="text-xl font-bold mt-0.5">
                      {stats.totalRewards.toLocaleString()} ZEC
                    </p>
                  </div>
                  <TrendingUp className="w-7 h-7 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold mt-0.5">
                      {stats.activeBounties}
                    </p>
                  </div>
                  <Clock className="w-7 h-7 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-xl font-bold mt-0.5">
                      {stats.completed}
                    </p>
                  </div>
                  <CheckCircle className="w-7 h-7 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Applications
                    </p>
                    <p className="text-xl font-bold mt-0.5">
                      {stats.totalApplications}
                    </p>
                  </div>
                  <AlertCircle className="w-7 h-7 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between pb-4 border-b mb-6">
            <h2 className="text-xl font-bold">All Bounties</h2>
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

          {/* Kanban board (grid) */}
          {viewMode === "grid" ? (
            userBounties.length === 0 ? (
              <div className="text-center py-20 border rounded-xl bg-muted/20">
                <p className="text-muted-foreground">
                  No bounties yet. Start hunting in the marketplace!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto pb-4 -mx-1 px-1">
                <div className="flex gap-4 items-start min-w-max">
                  {columns.map((col) => (
                    <div
                      key={col.status}
                      className="flex flex-col gap-3 w-72 xl:w-[22.5rem] flex-shrink-0"
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
          ) : /* ── LIST MODE (grouped by status) ── */
          userBounties.length > 0 ? (
            <div className="space-y-8">
              {columns
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
                No bounties yet. Start hunting in the marketplace!
              </p>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
