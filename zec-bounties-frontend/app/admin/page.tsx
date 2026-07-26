"use client";

import { useState, useEffect, useMemo } from "react";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  CheckCircle2,
  MoreHorizontal,
  TrendingUp,
  Settings2,
  UserPlus,
  AlertTriangle,
  Upload,
  ExternalLink,
  FileText,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  CreditCard,
  Shield,
  Download,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminBountyModal } from "@/components/admin-bounty-modal";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useBounty } from "@/lib/bounty-context";
import { BountyStatus, WorkSubmission, Bounty } from "@/lib/types";
import { formatStatus } from "@/lib/utils";
import { format } from "date-fns";
import { GlobalSettingsModal } from "@/components/settings/global-settings-modal";
import { PaymentTxIdsTable } from "@/components/transactions/payment-tx-table";
import { BountyAdminCard } from "@/components/admin/bounty-admin-card";
import { WalletGuard } from "@/components/settings/wallet-guard";
import { AuthorizePaymentPanel } from "@/components/payments/authorize-payment-panel";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { EditBountyModal } from "@/components/admin/edit-bounty-modal";
import { SelectWinnerModal } from "@/components/admin/select-winner-modal";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExportCompletedModal } from "@/components/payments/export-completed-modal";
import { displayName } from "@/lib/displayName";

const STATUS_FILTERS: {
  status: BountyStatus | "ALL";
  label: string;
  dotColor?: string;
}[] = [
  { status: "ALL", label: "All" },
  { status: "TO_DO", label: "Todo", dotColor: "bg-slate-400" },
  { status: "IN_PROGRESS", label: "In Progress", dotColor: "bg-blue-500" },
  { status: "IN_REVIEW", label: "In Review", dotColor: "bg-yellow-500" },
  { status: "DONE", label: "Done", dotColor: "bg-green-500" },
  { status: "CANCELLED", label: "Cancelled", dotColor: "bg-red-500" },
];

export default function AdminDashboard() {
  useRoleGuard("ADMIN");
  const {
    bounties,
    nonAdminUsers,
    totalBountyAmount,
    totalBountyCount,
    bountiesLoading,
    hasMoreBounties,
    loadMoreBounties,
    updateBountyStatus,
    updateBounty,
    approveBounty,
    getAllApplicationsForBounty,
    acceptApplication,
    rejectApplication,
    fetchBountyApplications,
    fetchWorkSubmissions,
    reviewWorkSubmission,
    paymentIDs,
    paymentChain,
    paymentServerUrl,
    fetchTransactionHashes,
    currentUser,
    allSubmissions,
    fetchAllSubmissions,
    totalActiveCount,
    statusCounts,
  } = useBounty();

  const [activeTab, setActiveTab] = useState<"overview" | "payments" | "txids">(
    "overview",
  );
  const [bountyStatusFilter, setBountyStatusFilter] = useState<
    BountyStatus | "ALL"
  >("ALL");
  const [showAdminBountyModal, setShowAdminBountyModal] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<string | null>(null);
  const [isManagingApplications, setIsManagingApplications] = useState(false);
  const [isManagingSubmissions, setIsManagingSubmissions] = useState(false);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [isFetchingTxHashes, setIsFetchingTxHashes] = useState(false);

  const [editingBounty, setEditingBounty] = useState<Bounty | null>(null);
  const [assigneeSectionBounty, setAssigneeSectionBounty] =
    useState<Bounty | null>(null);
  const [winnerBounty, setWinnerBounty] = useState<Bounty | null>(null);
  const [chainFilter, setChainFilter] = useState<"MAIN" | "TEST">("MAIN");
  const [showCancelledBounties, setShowCancelledBounties] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Filtered bounties for the table
  const chainFilteredBounties = useMemo(
    () => bounties.filter((b) => b.chain === chainFilter),
    [bounties, chainFilter],
  );

  const filteredBounties = useMemo(() => {
    let result =
      bountyStatusFilter === "ALL"
        ? chainFilteredBounties
        : chainFilteredBounties.filter((b) => b.status === bountyStatusFilter);

    if (bountyStatusFilter === "ALL" && !showCancelledBounties) {
      result = result.filter((b) => b.status !== "CANCELLED");
    }

    return result;
  }, [chainFilteredBounties, bountyStatusFilter, showCancelledBounties]);

  const handleStatusChange = async (
    bountyId: string,
    newStatus: BountyStatus,
  ) => {
    if (newStatus !== "DONE") {
      updateBountyStatus(bountyId, newStatus);
      return;
    }

    const bounty = bounties.find((b) => b.id === bountyId);
    if (!bounty) return;

    const assigneeCount = bounty.assignees?.length ?? 0;

    if (assigneeCount === 0) {
      const createdByUser = bounty.createdByUser;
      const hasLegacyAssignee = !!bounty.assigneeUser;
      const createdByClient = createdByUser?.role === "CLIENT";

      if (hasLegacyAssignee && createdByClient) {
        try {
          await updateBountyStatus(bountyId, "DONE");
        } catch (err) {
          console.error(err);
        }
        return;
      }

      toast.error("Cannot mark as done", {
        description:
          "This bounty has no assignees. Assign at least one person before marking it done.",
      });
      return;
    }

    if (assigneeCount === 1) {
      try {
        await updateBountyStatus(bountyId, "DONE");
      } catch (err) {
        console.error(err);
      }
    } else {
      setWinnerBounty(bounty);
    }
  };

  const handleWinnerConfirm = async (bountyId: string, winnerId: string) => {
    await updateBountyStatus(bountyId, "DONE", winnerId);
    try {
      await updateBounty(bountyId, { userIds: [winnerId] } as any);
    } catch (err) {
      console.error("Failed to trim assignees to winner:", err);
    }
    setWinnerBounty(null);
  };

  const handleApprovalChange = async (bountyId: string, approved: boolean) => {
    setIsUpdating(true);
    try {
      approveBounty(bountyId, approved);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApplicationAction = async (
    applicationId: string,
    action: "accept" | "reject",
  ) => {
    setIsUpdating(true);
    try {
      if (action === "accept") {
        await acceptApplication(applicationId);
      } else {
        await rejectApplication(applicationId);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSubmissionReview = async (
    submissionId: string,
    action: "approved" | "rejected" | "needs_revision",
    reviewNotes?: string,
  ) => {
    setIsUpdating(true);
    try {
      await reviewWorkSubmission(submissionId, { status: action, reviewNotes });
      await Promise.all([loadWorkSubmissions(), fetchAllSubmissions()]);
    } catch (error) {
      console.error("Failed to review submission:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const loadWorkSubmissions = async () => {
    if (!selectedBounty) return;
    setSubmissionsLoading(true);
    try {
      const submissions = await fetchWorkSubmissions(selectedBounty);
      setWorkSubmissions(submissions);
    } catch (error) {
      console.error("Failed to load work submissions:", error);
      setWorkSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  useEffect(() => {
    if (isManagingSubmissions && selectedBounty) {
      loadWorkSubmissions();
    }
  }, [isManagingSubmissions, selectedBounty]);

  const handleFetchTransactionHashes = async () => {
    setIsFetchingTxHashes(true);
    try {
      await fetchTransactionHashes();
    } catch (error) {
      console.error("Failed to fetch transaction hashes:", error);
    } finally {
      setIsFetchingTxHashes(false);
    }
  };

  const totalRewards = totalBountyAmount;
  const activeBountiesAmount = totalActiveCount;
  const totalHunters = nonAdminUsers.filter((u) => u.role === "CLIENT").length;
  const completedBounties = bounties.filter(
    (b) => b.status === "DONE" && !b.isPaid,
  );

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    {
      id: "payments",
      label: "Payments Due",
      icon: CreditCard,
      badge: completedBounties.length > 0 ? completedBounties.length : null,
    },
    { id: "txids", label: "Transactions", icon: RefreshCw },
  ];

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <AdminNavbar isAdmin={true} />
        <div className="imd:container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h1 className="text-3xl font-extrabold">Admin Console</h1>
              <p className="text-muted-foreground">
                Platform-wide overview and management
              </p>
            </div>
            <div className="flex flex-col imd:flex-row items-end imd:items-center gap-3">
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-full border bg-muted/40">
                <span
                  className={`text-sm font-medium transition-colors ${
                    chainFilter === "TEST"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Test
                </span>
                <Switch
                  checked={chainFilter === "MAIN"}
                  onCheckedChange={(checked) =>
                    setChainFilter(checked ? "MAIN" : "TEST")
                  }
                />
                <span
                  className={`text-sm font-medium transition-colors ${
                    chainFilter === "MAIN"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Main
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowAdminBountyModal(true)}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" /> New Bounty
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 bg-transparent"
                  onClick={() => setShowGlobalSettings(true)}
                >
                  <Settings2 className="h-4 w-4" /> Global Settings
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 imd:grid-cols-3 gap-2 mb-8 border-b border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors relative ${
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.badge && (
                    <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium">
                      Total Rewards
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalRewards.toLocaleString()} ZEC
                    </div>
                    <p className="text-xs text-green-500 flex items-center gap-1 mt-1 font-medium">
                      <TrendingUp className="h-3 w-3" /> +12.5% from last month
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium">
                      Active Bounties
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {activeBountiesAmount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {statusCounts?.TO_DO ?? 0} pending approval
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium">
                      Total Hunters
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalHunters}</div>
                    <p className="text-xs text-green-500 flex items-center gap-1 mt-1 font-medium">
                      <TrendingUp className="h-3 w-3" /> +8 this week
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium">
                      System Health
                    </CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">Operational</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      All services running smoothly
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-card/50 overflow-hidden border-muted">
                <CardHeader className="p-4 sm:p-6 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <CardTitle>Recent Bounties</CardTitle>
                      <CardDescription>
                        All bounties on the platform
                      </CardDescription>
                    </div>

                    {/* ── Mobile: dropdown filter ── */}
                    <div className="flex imd:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 w-full justify-between"
                          >
                            <div className="flex items-center gap-2">
                              {(() => {
                                const active = STATUS_FILTERS.find(
                                  (f) => f.status === bountyStatusFilter,
                                );
                                return (
                                  <>
                                    {active?.dotColor && (
                                      <span
                                        className={`h-2 w-2 rounded-full flex-shrink-0 ${active.dotColor}`}
                                      />
                                    )}
                                    <span>{active?.label ?? "All"}</span>
                                    <span className="text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                                      {bountyStatusFilter === "ALL"
                                        ? chainFilteredBounties.length
                                        : chainFilteredBounties.filter(
                                            (b) =>
                                              b.status === bountyStatusFilter,
                                          ).length}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>
                            Filter by Status
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {STATUS_FILTERS.map((f) => {
                            const count =
                              f.status === "ALL"
                                ? chainFilteredBounties.length
                                : chainFilteredBounties.filter(
                                    (b) => b.status === f.status,
                                  ).length;
                            const isActive = bountyStatusFilter === f.status;
                            return (
                              <DropdownMenuItem
                                key={f.status}
                                onClick={() => setBountyStatusFilter(f.status)}
                                className={`flex items-center justify-between ${isActive ? "bg-muted font-medium" : ""}`}
                              >
                                <div className="flex items-center gap-2">
                                  {f.dotColor && (
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${f.dotColor}`}
                                    />
                                  )}
                                  {f.label}
                                </div>
                                <span className="text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                                  {count}
                                </span>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* ── Desktop: pill filters ── */}
                    <div className="hidden imd:flex items-center gap-1.5 flex-wrap">
                      {STATUS_FILTERS.map((f) => {
                        const count =
                          f.status === "ALL"
                            ? chainFilteredBounties.length
                            : chainFilteredBounties.filter(
                                (b) => b.status === f.status,
                              ).length;
                        const isActive = bountyStatusFilter === f.status;
                        return (
                          <button
                            key={f.status}
                            onClick={() => setBountyStatusFilter(f.status)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm transition-all ${
                              isActive
                                ? "border-border bg-muted font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            {f.dotColor && (
                              <span
                                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${f.dotColor}`}
                              />
                            )}
                            {f.label}
                            <span className="text-[11px] bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="py-3 pl-4 sm:pl-6">
                          Bounty
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          Category
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Status
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Assignee
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Applications
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Submissions
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Reward
                        </TableHead>
                        <TableHead className="text-right pr-4 sm:pr-6">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBounties.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-12 text-muted-foreground"
                          >
                            No bounties match this filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredBounties.map((bounty) => {
                          const applications = getAllApplicationsForBounty(
                            bounty.id,
                          );
                          const appCount = applications?.length || 0;
                          const pendingApps =
                            applications?.filter((a) => a.status === "pending")
                              .length || 0;

                          const submissions = allSubmissions.filter(
                            (s) => s.bountyId === bounty.id,
                          );
                          const submissionCount = submissions.length;
                          const pendingSubs = submissions.filter(
                            (s) => s.status === "pending",
                          ).length;

                          return (
                            <TableRow
                              key={bounty.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <TableCell className="font-medium py-3 pl-4 sm:pl-6 max-w-[180px] sm:max-w-[240px] imd:max-w-[400px]">
                                <div className="flex items-center gap-3 min-w-0">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Avatar className="h-7 w-7 border flex-shrink-0">
                                          <AvatarImage
                                            src={
                                              bounty.createdByUser?.avatar ||
                                              "/placeholder-user.jpg"
                                            }
                                          />
                                          <AvatarFallback>
                                            {
                                              displayName(
                                                bounty.createdByUser,
                                              )[0]
                                            }
                                          </AvatarFallback>
                                        </Avatar>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {displayName(bounty.createdByUser)}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <div className="min-w-0 flex-1">
                                    <button
                                      className="block w-full truncate text-left hover:underline hover:text-primary transition-colors text-sm font-medium"
                                      onClick={() => setEditingBounty(bounty)}
                                    >
                                      {bounty.title}
                                    </button>
                                    {/* Mobile-only inline meta */}
                                    <div className="flex items-center gap-2 mt-1 sm:hidden flex-wrap">
                                      <div className="flex items-center gap-1">
                                        <div
                                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                                            bounty.status === "TO_DO"
                                              ? "bg-slate-400"
                                              : bounty.status === "IN_PROGRESS"
                                                ? "bg-blue-500"
                                                : bounty.status === "IN_REVIEW"
                                                  ? "bg-yellow-500"
                                                  : bounty.status === "DONE"
                                                    ? "bg-green-500"
                                                    : "bg-red-500"
                                          }`}
                                        />
                                        <span className="text-[11px] text-muted-foreground">
                                          {formatStatus(bounty.status)}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-muted-foreground">
                                        ·
                                      </span>
                                      <span className="text-[11px] font-mono text-muted-foreground">
                                        {bounty.bountyAmount} ZEC
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase font-bold tracking-tight"
                                >
                                  {bounty.categoryId}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`h-2 w-2 rounded-full ${
                                      bounty.status === "TO_DO"
                                        ? "bg-slate-400"
                                        : bounty.status === "IN_PROGRESS"
                                          ? "bg-blue-500"
                                          : bounty.status === "IN_REVIEW"
                                            ? "bg-yellow-500"
                                            : bounty.status === "DONE"
                                              ? "bg-green-500"
                                              : "bg-red-500"
                                    }`}
                                  />
                                  <span className="capitalize text-sm">
                                    {formatStatus(bounty.status)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {bounty.assignees &&
                                bounty.assignees.length > 0 ? (
                                  <button
                                    className="flex items-center gap-2 hover:opacity-75 transition-opacity"
                                    onClick={() =>
                                      setAssigneeSectionBounty(bounty)
                                    }
                                  >
                                    <div className="flex items-center">
                                      {bounty.assignees
                                        .slice(0, 3)
                                        .map((a, i) => (
                                          <Avatar
                                            key={a.userId}
                                            className="h-6 w-6 border-2 border-background"
                                            style={{
                                              marginLeft: i === 0 ? 0 : "-8px",
                                              zIndex: 3 - i,
                                            }}
                                          >
                                            <AvatarImage
                                              src={
                                                a.user?.avatar ||
                                                "/placeholder-user.jpg"
                                              }
                                            />
                                            <AvatarFallback className="text-[9px]">
                                              {displayName(a.user)[0]}
                                            </AvatarFallback>
                                          </Avatar>
                                        ))}
                                      {bounty.assignees.length > 3 && (
                                        <div
                                          className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-bold text-muted-foreground"
                                          style={{ marginLeft: "-8px" }}
                                        >
                                          +{bounty.assignees.length - 3}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-xs font-medium">
                                      {bounty.assignees.length === 1
                                        ? displayName(bounty.assignees[0].user)
                                        : `${bounty.assignees.length} assignees`}
                                    </span>
                                  </button>
                                ) : bounty.assignee && bounty.assigneeUser ? (
                                  <button
                                    className="flex items-center gap-2 hover:opacity-75 transition-opacity"
                                    onClick={() =>
                                      setAssigneeSectionBounty(bounty)
                                    }
                                  >
                                    <Avatar className="h-6 w-6 border">
                                      <AvatarImage
                                        src={
                                          bounty.assigneeUser.avatar ||
                                          "/placeholder-user.jpg"
                                        }
                                      />
                                      <AvatarFallback>
                                        {displayName(bounty.assigneeUser)[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs font-medium">
                                      {displayName(bounty.assigneeUser)}
                                    </span>
                                  </button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] gap-1 px-2 border border-dashed"
                                    onClick={() =>
                                      setAssigneeSectionBounty(bounty)
                                    }
                                  >
                                    <UserPlus className="h-3 w-3" /> Assign
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 text-xs gap-1 px-2 ${
                                    pendingApps > 0
                                      ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                                      : appCount > 0
                                        ? "border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                                        : "border border-dashed"
                                  }`}
                                  onClick={() => {
                                    setSelectedBounty(bounty.id);
                                    setIsManagingApplications(true);
                                    fetchBountyApplications(bounty.id);
                                  }}
                                >
                                  <Users className="h-3 w-3" />
                                  {appCount > 0 ? (
                                    <>
                                      {appCount}{" "}
                                      {pendingApps > 0 &&
                                        `(${pendingApps} pending)`}
                                    </>
                                  ) : (
                                    "None"
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 text-xs gap-1 px-2 ${
                                    pendingSubs > 0
                                      ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                                      : submissionCount > 0
                                        ? "border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                                        : "border border-dashed"
                                  }`}
                                  onClick={() => {
                                    setSelectedBounty(bounty.id);
                                    setIsManagingSubmissions(true);
                                  }}
                                >
                                  <Upload className="h-3 w-3" />
                                  {submissionCount > 0 ? (
                                    <>
                                      {submissionCount}{" "}
                                      {pendingSubs > 0 &&
                                        `(${pendingSubs} pending)`}
                                    </>
                                  ) : (
                                    "None"
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell font-mono text-sm">
                                {bounty.bountyAmount} ZEC
                              </TableCell>
                              <TableCell className="text-right pr-4 sm:pr-6">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>
                                      Change Status
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(bounty.id, "TO_DO")
                                      }
                                    >
                                      Set To Do
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(
                                          bounty.id,
                                          "IN_PROGRESS",
                                        )
                                      }
                                    >
                                      Set In Progress
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(
                                          bounty.id,
                                          "IN_REVIEW",
                                        )
                                      }
                                    >
                                      Set In Review
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(bounty.id, "DONE")
                                      }
                                    >
                                      Mark as Done
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(
                                          bounty.id,
                                          "CANCELLED",
                                        )
                                      }
                                      className="text-destructive"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Cancel Bounty
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>
                                      Approval
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleApprovalChange(bounty.id, true)
                                      }
                                      disabled={bounty.isApproved}
                                    >
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Approve Bounty
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleApprovalChange(bounty.id, false)
                                      }
                                      disabled={!bounty.isApproved}
                                      className="text-destructive"
                                    >
                                      <AlertTriangle className="h-4 w-4 mr-2" />
                                      Reject Bounty
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>
                                      Manage
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedBounty(bounty.id);
                                        setIsManagingApplications(true);
                                        fetchBountyApplications(bounty.id);
                                      }}
                                    >
                                      <Users className="h-4 w-4 mr-2" />
                                      View Applications
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedBounty(bounty.id);
                                        setIsManagingSubmissions(true);
                                      }}
                                    >
                                      <Upload className="h-4 w-4 mr-2" />
                                      Review Submissions
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>

                  {/* Load More row */}
                  {hasMoreBounties && (
                    <div className="flex justify-center p-4 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground hover:text-foreground"
                        onClick={loadMoreBounties}
                        disabled={bountiesLoading}
                      >
                        {bountiesLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Load more bounties
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Payments Due
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowExportModal(true)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Completed
                </Button>
              </div>
              <AuthorizePaymentPanel />
            </div>
          )}

          <ExportCompletedModal
            open={showExportModal}
            onOpenChange={setShowExportModal}
          />

          {activeTab === "txids" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Transaction History ({paymentIDs?.length || 0})
                </h2>
                <Button
                  onClick={handleFetchTransactionHashes}
                  disabled={isFetchingTxHashes}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {isFetchingTxHashes ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {isFetchingTxHashes ? "Fetching..." : "Refresh"}
                </Button>
              </div>

              {isFetchingTxHashes && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-blue-800 dark:text-blue-200 text-sm">
                      Fetching latest transaction hashes...
                    </span>
                  </div>
                </div>
              )}

              {paymentIDs && paymentIDs.length > 0 ? (
                <PaymentTxIdsTable
                  paymentIDs={paymentIDs}
                  chain={paymentChain}
                  serverUrl={paymentServerUrl}
                />
              ) : (
                <div className="text-center py-12">
                  <RefreshCw className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                    No payments processed
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    No transaction IDs available at this time.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <EditBountyModal
          bounty={editingBounty}
          open={!!editingBounty}
          onOpenChange={(open) => {
            if (!open) setEditingBounty(null);
          }}
        />

        <EditBountyModal
          bounty={assigneeSectionBounty}
          open={!!assigneeSectionBounty}
          defaultSection="assignees"
          onOpenChange={(open) => {
            if (!open) setAssigneeSectionBounty(null);
          }}
        />

        <SelectWinnerModal
          bounty={winnerBounty}
          open={!!winnerBounty}
          onOpenChange={(open) => {
            if (!open) setWinnerBounty(null);
          }}
          onConfirm={handleWinnerConfirm}
        />

        <AdminBountyModal
          open={showAdminBountyModal}
          onOpenChange={setShowAdminBountyModal}
        />

        <GlobalSettingsModal
          open={showGlobalSettings}
          onOpenChange={setShowGlobalSettings}
        />

        <Dialog
          open={isManagingApplications}
          onOpenChange={setIsManagingApplications}
        >
          <DialogContent className="imd:max-w-180 max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-3 border-b border-border">
              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <DialogTitle className="text-base font-medium leading-tight">
                    Applications
                  </DialogTitle>
                  {selectedBounty && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bounties.find((b) => b.id === selectedBounty)?.title}{" "}
                      &middot;{" "}
                      {getAllApplicationsForBounty(selectedBounty)?.length ?? 0}{" "}
                      applicant
                      {getAllApplicationsForBounty(selectedBounty)?.length !== 1
                        ? "s"
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-2 imd:max-w-2xl">
              {selectedBounty &&
              getAllApplicationsForBounty(selectedBounty)?.length > 0 ? (
                getAllApplicationsForBounty(selectedBounty).map(
                  (application) => (
                    <div
                      key={application.id}
                      className="border border-border rounded-lg px-3.5 py-3"
                    >
                      {/* Top row: avatar + name + actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Avatar className="h-8 w-8 flex-shrink-0 border">
                            <AvatarImage
                              src={
                                application.applicantUser?.avatar ||
                                "/placeholder-user.jpg"
                              }
                            />
                            <AvatarFallback className="text-[11px]">
                              {displayName(application.applicantUser)[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight truncate">
                              {displayName(application.applicantUser)}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Applied{" "}
                              {format(
                                new Date(application.appliedAt),
                                "MMM d, yyyy",
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Status badge + action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              application.status === "accepted"
                                ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                                : application.status === "rejected"
                                  ? "text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                                  : "text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20"
                            }`}
                          >
                            {application.status || "pending"}
                          </Badge>

                          {application.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px] gap-1 border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                                onClick={() =>
                                  handleApplicationAction(
                                    application.id,
                                    "accept",
                                  )
                                }
                                disabled={isUpdating}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px] gap-1 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                                onClick={() =>
                                  handleApplicationAction(
                                    application.id,
                                    "reject",
                                  )
                                }
                                disabled={isUpdating}
                              >
                                <XCircle className="w-3 h-3" />
                                Decline
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Message */}
                      <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed pl-10.5 border-l-2 border-border ml-3.5 wrap-anywhere">
                        {application.message}
                      </p>
                    </div>
                  ),
                )
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <Users className="w-9 h-9 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No applications yet.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isManagingSubmissions}
          onOpenChange={setIsManagingSubmissions}
        >
          <DialogContent className="imd:max-w-180 max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-3 border-b border-border">
              <div className="flex items-start gap-3">
                <Upload className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <DialogTitle className="text-base font-medium leading-tight">
                    Submissions
                  </DialogTitle>
                  {selectedBounty && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bounties.find((b) => b.id === selectedBounty)?.title}{" "}
                      &middot; {workSubmissions.length} submission
                      {workSubmissions.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-2">
              {submissionsLoading ? (
                <div className="flex justify-center py-10">
                  <Clock className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : workSubmissions && workSubmissions.length > 0 ? (
                workSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="border border-border rounded-lg px-3.5 py-3 space-y-3"
                  >
                    {/* Top row: avatar + name + status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Avatar className="h-8 w-8 flex-shrink-0 border">
                          <AvatarImage
                            src={
                              submission.submitterUser?.avatar ||
                              "/placeholder-user.jpg"
                            }
                          />
                          <AvatarFallback className="text-[11px]">
                            {displayName(submission.submitterUser)[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">
                            {displayName(submission.submitterUser)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(
                              new Date(submission.submittedAt),
                              "MMM d, yyyy",
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                          submission.status === "approved"
                            ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                            : submission.status === "rejected"
                              ? "text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                              : submission.status === "needs_revision"
                                ? "text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20"
                                : "text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20"
                        }`}
                      >
                        {submission.status}
                      </Badge>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap pl-[42px] border-l-2 border-border ml-[14px]">
                      {submission.description}
                    </p>

                    {/* Deliverable link */}
                    {submission.deliverableUrl && (
                      <a
                        href={submission.deliverableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all pl-[42px] ml-[14px]"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        {submission.deliverableUrl}
                      </a>
                    )}

                    {/* Review notes (already set) */}
                    {submission.reviewNotes && (
                      <div className="ml-[14px] pl-[42px] p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                        <span className="font-medium">Note: </span>
                        {submission.reviewNotes}
                      </div>
                    )}

                    {/* Pending — review actions */}
                    {submission.status === "pending" && (
                      <div className="border-t border-border pt-3 space-y-2.5">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`review-notes-${submission.id}`}
                            className="text-xs"
                          >
                            Review Notes{" "}
                            <span className="text-muted-foreground font-normal">
                              (optional)
                            </span>
                          </Label>
                          <Textarea
                            id={`review-notes-${submission.id}`}
                            placeholder="Add feedback for the submitter..."
                            className="text-sm min-h-[64px]"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              const textarea = document.getElementById(
                                `review-notes-${submission.id}`,
                              ) as HTMLTextAreaElement;
                              handleSubmissionReview(
                                submission.id,
                                "approved",
                                textarea?.value,
                              );
                            }}
                            disabled={isUpdating}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              const textarea = document.getElementById(
                                `review-notes-${submission.id}`,
                              ) as HTMLTextAreaElement;
                              handleSubmissionReview(
                                submission.id,
                                "rejected",
                                textarea?.value,
                              );
                            }}
                            disabled={isUpdating}
                            className="flex-1"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Resolved state banners */}
                    {submission.status === "approved" && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <p className="text-xs text-green-700 dark:text-green-300">
                          Approved — bounty marked as Done
                        </p>
                      </div>
                    )}

                    {submission.status === "rejected" && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                        <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-300">
                          Rejected
                        </p>
                      </div>
                    )}

                    {submission.status === "needs_revision" && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
                        <FileText className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                        <p className="text-xs text-orange-700 dark:text-orange-300">
                          Revision requested — bounty back to In Progress
                        </p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <Upload className="w-9 h-9 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No submissions yet.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </ProtectedRoute>
  );
}
