"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { useBounty } from "@/lib/bounty-context";
import { formatStatus } from "@/lib/utils";
import { WalletGuard } from "@/components/settings/wallet-guard";

export default function ClientDashboard() {
  const { bounties, paymentIDs, fetchTransactionHashes, authorizeDuePayment } =
    useBounty();
  const [filterStatus, setFilterStatus] = useState<
    "all" | "TO_DO" | "IN_PROGRESS" | "DONE" | "CANCELLED"
  >("all");
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);

  const clientBounties = useMemo(() => {
    const filtered = bounties.filter(
      (b) => filterStatus === "all" || b.status === filterStatus,
    );
    return filtered.sort(
      (a, b) =>
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [filterStatus]);

  const stats = {
    totalRewards: clientBounties.reduce((sum, b) => sum + b.bountyAmount, 0),
    activeBounties: bounties.filter(
      (b) => b.status === "TO_DO" || b.status === "IN_PROGRESS",
    ).length,
    completed: bounties.filter((b) => b.status === "DONE").length,
    totalApplications: clientBounties.reduce(
      (sum, b) => sum + (b.applications?.length || 0),
      0,
    ),
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AdminNavbar isAdmin={true} />
      <div className="min-h-screen bg-background">
        <div className="border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-foreground">
                  Admin Dashboard
                </h1>
                <p className="text-muted-foreground mt-2">
                  Manage your bounties and track applications
                </p>
              </div>
              <Button
                className="gap-2"
                onClick={() => setIsNewBountyModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                New Bounty
              </Button>
            </div>
          </div>
        </div>

        <NewBountyModal
          open={isNewBountyModalOpen}
          onOpenChange={setIsNewBountyModalOpen}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Rewards
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {stats.totalRewards.toLocaleString()}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Active Bounties
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {stats.activeBounties}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {stats.completed}
                    </p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Applications
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {stats.totalApplications}
                    </p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Bounty List */}
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Your Bounties</CardTitle>
                  <CardDescription>
                    Track all posted bounties and applications
                  </CardDescription>
                </div>
              </div>
              <div className="grid grid-cols-3 imd:grid-cols-5 gap-2 mt-4">
                {(
                  ["all", "TO_DO", "IN_PROGRESS", "DONE", "CANCELLED"] as const
                ).map((status) => (
                  <Button
                    key={status}
                    variant={filterStatus === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus(status)}
                    className="capitalize"
                  >
                    {status === "all" ? "All" : formatStatus(status)}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {clientBounties.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No bounties found</p>
                  </div>
                ) : (
                  clientBounties.map((bounty) => (
                    <div
                      key={bounty.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-foreground">
                            {bounty.title}
                          </h3>
                          <Badge
                            variant={
                              bounty.status === "TO_DO"
                                ? "default"
                                : bounty.status === "IN_PROGRESS"
                                  ? "secondary"
                                  : bounty.status === "DONE"
                                    ? "outline"
                                    : "destructive"
                            }
                          >
                            {formatStatus(bounty.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {bounty.applications?.length || 0} applications
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">
                          {bounty.bountyAmount}
                        </p>
                        <p className="text-xs text-muted-foreground">ZEC</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
