"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  Download,
  SlidersHorizontal,
  Check,
  Plus,
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
import { PaymentRecordsTable } from "@/components/transactions/payment-records-table";
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

/* ------------------------------------------------------------------ */
/* Status metadata — single source of truth (kills the repeated ternaries) */
/* ------------------------------------------------------------------ */

const STATUS_DOT: Record<string, string> = {
  TO_DO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  IN_REVIEW: "bg-yellow-500",
  DONE: "bg-green-500",
  CANCELLED: "bg-red-500",
};

function StatusDot({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? "bg-muted-foreground"} ${className}`}
    />
  );
}

const STATUS_FILTERS: {
  status: BountyStatus | "ALL";
  label: string;
  dotColor?: string;
}[] = [
  { status: "ALL", label: "All" },
  { status: "TO_DO", label: "Todo", dotColor: STATUS_DOT.TO_DO },
  {
    status: "IN_PROGRESS",
    label: "In Progress",
    dotColor: STATUS_DOT.IN_PROGRESS,
  },
  { status: "IN_REVIEW", label: "In Review", dotColor: STATUS_DOT.IN_REVIEW },
  { status: "DONE", label: "Done", dotColor: STATUS_DOT.DONE },
  { status: "CANCELLED", label: "Cancelled", dotColor: STATUS_DOT.CANCELLED },
];

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  hintTone = "muted",
  onClick,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  hint?: React.ReactNode;
  hintTone?: "muted" | "positive";
  onClick?: () => void;
  emphasis?: boolean;
}) {
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`group text-left w-full rounded-xl border bg-card/50 p-4 transition-colors ${
        onClick ? "hover:bg-muted/40 cursor-pointer" : ""
      } ${emphasis ? "border-primary/20" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon
          className={`h-4 w-4 ${emphasis ? "text-primary" : "text-muted-foreground"}`}
        />
      </div>
      <div className="mt-3 text-2xl font-bold leading-none tabular-nums">
        {value}
      </div>
      {hint && (
        <p
          className={`mt-2 text-xs flex items-center gap-1 ${
            hintTone === "positive"
              ? "text-green-500 font-medium"
              : "text-muted-foreground"
          }`}
        >
          {hint}
        </p>
      )}
    </Wrapper>
  );
}

function CountPill({
  count,
  pending,
  icon: Icon,
  onClick,
  emptyLabel = "None",
}: {
  count: number;
  pending: number;
  icon: React.ElementType;
  onClick: () => void;
  emptyLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors ${
        pending > 0
          ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
          : count > 0
            ? "border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
            : "border border-dashed text-muted-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className="h-3 w-3" />
      {count > 0
        ? pending > 0
          ? `${count} · ${pending} new`
          : count
        : emptyLabel}
    </button>
  );
}

/* ------------------------------------------------------------------ */

export default function AdminDashboard() {
  useRoleGuard("ADMIN");
  const {
    bounties,
    nonAdminUsers,
    totalBountyAmount,
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
    rejectOtherSubmissions,
    paymentIDs,
    paymentChain,
    paymentServerUrl,
    fetchTransactionHashes,
    paymentRecords,
    fetchPaymentRecords,
    allSubmissions,
    fetchAllSubmissions,
    totalActiveCount,
    statusCounts,
    unpaidDoneCount,
    categories,
  } = useBounty();

  const [activeTab, setActiveTab] = useState<"overview" | "payments" | "txids">(
    "overview",
  );
  const [bountyStatusFilter, setBountyStatusFilter] = useState<
    BountyStatus | "ALL"
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string | "ALL">("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
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
  const [txSubTab, setTxSubTab] = useState<"payouts" | "wallet">("wallet");

  // Filtered bounties for the table
  const chainFilteredBounties = useMemo(
    () => bounties.filter((b) => b.chain === chainFilter && !b.teamId),
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

    if (categoryFilter !== "ALL") {
      result = result.filter((b) => b.categoryId === categoryFilter);
    }

    return result;
  }, [
    chainFilteredBounties,
    bountyStatusFilter,
    showCancelledBounties,
    categoryFilter,
  ]);

  const activeCategoryLabel =
    categoryFilter === "ALL" ? "All Categories" : categoryFilter;
  const activeFilterCount =
    (bountyStatusFilter !== "ALL" ? 1 : 0) +
    (categoryFilter !== "ALL" ? 1 : 0) +
    (showCancelledBounties ? 1 : 0);

  const statusCountFor = (status: BountyStatus | "ALL") =>
    status === "ALL"
      ? chainFilteredBounties.length
      : chainFilteredBounties.filter((b) => b.status === status).length;

  const resetFilters = () => {
    setBountyStatusFilter("ALL");
    setCategoryFilter("ALL");
    setShowCancelledBounties(false);
  };

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

  const handleRejectOthers = async (submissionId: string) => {
    setIsUpdating(true);
    try {
      await rejectOtherSubmissions(submissionId);
      await Promise.all([loadWorkSubmissions(), fetchAllSubmissions()]);
    } catch (error) {
      console.error("Failed to reject other submissions:", error);
      toast.error("Failed to reject other submissions");
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filtersRef.current &&
        !filtersRef.current.contains(e.target as Node)
      ) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFetchTransactionHashes = async () => {
    setIsFetchingTxHashes(true);
    try {
      await Promise.all([fetchTransactionHashes(), fetchPaymentRecords()]);
    } catch (error) {
      console.error("Failed to fetch transaction hashes:", error);
    } finally {
      setIsFetchingTxHashes(false);
    }
  };

  // The tab used to sit empty until someone clicked Refresh, which made it
  // useless for verifying a payout you just sent.
  useEffect(() => {
    if (activeTab === "txids") {
      fetchPaymentRecords();
      fetchTransactionHashes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const totalRewards = totalBountyAmount;
  const activeBountiesAmount = totalActiveCount;
  const totalHunters = nonAdminUsers.filter((u) => u.role === "CLIENT").length;
  const completedBounties = bounties.filter(
    (b) => b.status === "DONE" && !b.isPaid,
  );

  const pendingReviewCount = allSubmissions.filter(
    (s) => s.status === "pending",
  ).length;

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: BarChart3,
      badge: null as number | null,
    },
    {
      id: "payments",
      label: "Payments Due",
      icon: CreditCard,
      badge: unpaidDoneCount > 0 ? unpaidDoneCount : null,
    },
    {
      id: "txids",
      label: "Transactions",
      icon: RefreshCw,
      badge: null as number | null,
    },
  ];

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <AdminNavbar isAdmin={true} />

        {/* ---------------------------------------------------------- */}
        {/* Sticky command bar: identity + environment + primary action */}
        {/* ---------------------------------------------------------- */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="imd:container mx-auto max-w-7xl px-4 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-12 py-3">
              <div className="min-w-0">
                <h1 className="text-3xl font-extrabold">Admin Console</h1>
                <p className="text-muted-foreground">
                  Platform-wide overview and management
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Environment switch reads as a setting, not a CTA */}
                <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5">
                  <span
                    className={`text-xs font-medium transition-colors ${
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
                    className={`text-xs font-medium transition-colors ${
                      chainFilter === "MAIN"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    Main
                  </span>
                </div>

                {/* Settings demoted to an icon button, CTA stays last */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 bg-transparent"
                        onClick={() => setShowGlobalSettings(true)}
                        aria-label="Global settings"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Global settings</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  onClick={() => setShowAdminBountyModal(true)}
                  className="h-9 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Bounty</span>
                </Button>
              </div>
            </div>

            {/* Tabs sit inside the same bar so they scroll with context */}
            <div
              className="-mb-px flex items-center gap-1 overflow-x-auto"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.badge ? (
                      <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                        {tab.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="imd:container mx-auto max-w-7xl px-4 py-6">
          {activeTab === "overview" && (
            <>
              {/* -------------------- KPI row -------------------- */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Total Rewards"
                  value={`${totalRewards.toLocaleString()} ZEC`}
                  icon={BarChart3}
                  hintTone="positive"
                  hint={
                    <>
                      <TrendingUp className="h-3 w-3" /> +12.5% from last month
                    </>
                  }
                />
                <StatCard
                  label="Active Bounties"
                  value={activeBountiesAmount}
                  icon={Clock}
                  hint={`${statusCounts?.TO_DO ?? 0} pending approval`}
                  onClick={() => setBountyStatusFilter("IN_PROGRESS")}
                />
                <StatCard
                  label="Total Hunters"
                  value={totalHunters}
                  icon={Users}
                  hintTone="positive"
                  hint={
                    <>
                      <TrendingUp className="h-3 w-3" /> +8 this week
                    </>
                  }
                />
                <StatCard
                  label="Needs Action"
                  value={pendingReviewCount + unpaidDoneCount}
                  icon={AlertTriangle}
                  emphasis
                  hint={`${pendingReviewCount} to review · ${unpaidDoneCount} to pay`}
                  onClick={() => setActiveTab("payments")}
                />
              </div>

              {/* ---------------- Bounties workspace ---------------- */}
              <Card className="mt-6 overflow-hidden border-muted bg-card/50 gap-0">
                <CardHeader className="gap-4 border-b p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Bounties</CardTitle>
                      <CardDescription>
                        {filteredBounties.length} of{" "}
                        {chainFilteredBounties.length} on{" "}
                        {chainFilter === "MAIN" ? "mainnet" : "testnet"}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeFilterCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={resetFilters}
                        >
                          Clear
                        </Button>
                      )}

                      {/* Category + options popover (status now lives inline) */}
                      <div className="relative" ref={filtersRef}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFiltersOpen(!filtersOpen)}
                          className="gap-2 font-normal text-muted-foreground"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {activeCategoryLabel}
                        </Button>

                        {filtersOpen && (
                          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                            <p className="mb-1.5 px-1 text-xs text-muted-foreground">
                              Category
                            </p>
                            <div className="max-h-56 overflow-y-auto">
                              <button
                                onClick={() => setCategoryFilter("ALL")}
                                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                All Categories
                                {categoryFilter === "ALL" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {categories.map((category) => (
                                <button
                                  key={category.id}
                                  onClick={() =>
                                    setCategoryFilter(category.name)
                                  }
                                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                                >
                                  {category.name}
                                  {categoryFilter === category.name && (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ))}
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                              <Label
                                htmlFor="show-cancelled"
                                className="text-xs font-normal text-muted-foreground"
                              >
                                Show cancelled
                              </Label>
                              <Switch
                                id="show-cancelled"
                                checked={showCancelledBounties}
                                onCheckedChange={setShowCancelledBounties}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline status chips — one click instead of two */}
                  <div
                    className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
                    style={{
                      scrollbarWidth: "none",
                      msOverflowStyle: "none",
                    }}
                  >
                    {STATUS_FILTERS.map((f) => {
                      const active = bountyStatusFilter === f.status;
                      return (
                        <button
                          key={f.status}
                          onClick={() => setBountyStatusFilter(f.status)}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            active
                              ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted/60"
                          }`}
                        >
                          {f.dotColor && (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${f.dotColor}`}
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
                </CardHeader>

                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="sticky top-[0px] z-10 bg-muted/50 backdrop-blur">
                      <TableRow>
                        <TableHead className="py-3 pl-4 sm:pl-6">
                          Bounty
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Status
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          Category
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Assignee
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Activity
                        </TableHead>
                        <TableHead className="hidden sm:table-cell text-right">
                          Reward
                        </TableHead>
                        <TableHead className="w-12 pr-4 text-right sm:pr-6">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBounties.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-16">
                            <div className="flex flex-col items-center text-center">
                              <FileText className="mb-3 h-9 w-9 text-muted-foreground/40" />
                              <p className="text-sm text-muted-foreground">
                                No bounties match these filters.
                              </p>
                              <div className="mt-4 flex gap-2">
                                {activeFilterCount > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={resetFilters}
                                  >
                                    Clear filters
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => setShowAdminBountyModal(true)}
                                >
                                  <Plus className="h-3.5 w-3.5" /> New Bounty
                                </Button>
                              </div>
                            </div>
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
                              className="transition-colors hover:bg-muted/30"
                            >
                              {/* Title + creator + mobile meta */}
                              <TableCell className="max-w-[180px] py-3 pl-4 font-medium sm:max-w-[240px] sm:pl-6 imd:max-w-[400px]">
                                <div className="flex items-center gap-3 min-w-0">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Avatar className="h-7 w-7 flex-shrink-0 border">
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
                                        Created by{" "}
                                        {displayName(bounty.createdByUser)}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <div className="min-w-0 flex-1">
                                    <button
                                      className="block w-full truncate text-left text-sm font-medium transition-colors hover:text-primary hover:underline"
                                      onClick={() => setEditingBounty(bounty)}
                                    >
                                      {bounty.title}
                                    </button>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                                      <span className="flex items-center gap-1">
                                        <StatusDot
                                          status={bounty.status}
                                          className="h-1.5 w-1.5"
                                        />
                                        <span className="text-[11px] text-muted-foreground">
                                          {formatStatus(bounty.status)}
                                        </span>
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        ·
                                      </span>
                                      <span className="font-mono text-[11px] text-muted-foreground">
                                        {bounty.bountyAmount} ZEC
                                      </span>
                                      {(pendingApps > 0 || pendingSubs > 0) && (
                                        <span className="text-[11px] text-yellow-700 dark:text-yellow-400">
                                          {pendingApps + pendingSubs} pending
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>

                              {/* Status moved next to title for scannability */}
                              <TableCell className="hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  <StatusDot
                                    status={bounty.status}
                                    className="h-2 w-2"
                                  />
                                  <span className="text-sm capitalize">
                                    {formatStatus(bounty.status)}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="hidden md:table-cell">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-bold uppercase tracking-tight"
                                >
                                  {bounty.categoryId}
                                </Badge>
                              </TableCell>

                              <TableCell className="hidden lg:table-cell">
                                {bounty.assignees &&
                                bounty.assignees.length > 0 ? (
                                  <button
                                    className="flex items-center gap-2 transition-opacity hover:opacity-75"
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
                                          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-bold text-muted-foreground"
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
                                    className="flex items-center gap-2 transition-opacity hover:opacity-75"
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
                                    className="h-7 gap-1 border border-dashed px-2 text-[10px]"
                                    onClick={() =>
                                      setAssigneeSectionBounty(bounty)
                                    }
                                  >
                                    <UserPlus className="h-3 w-3" /> Assign
                                  </Button>
                                )}
                              </TableCell>

                              {/* Applications + submissions collapsed into one column */}
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex items-center gap-1.5">
                                  <CountPill
                                    count={appCount}
                                    pending={pendingApps}
                                    icon={Users}
                                    onClick={() => {
                                      setSelectedBounty(bounty.id);
                                      setIsManagingApplications(true);
                                      fetchBountyApplications(bounty.id);
                                    }}
                                  />
                                  <CountPill
                                    count={submissionCount}
                                    pending={pendingSubs}
                                    icon={Upload}
                                    onClick={() => {
                                      setSelectedBounty(bounty.id);
                                      setIsManagingSubmissions(true);
                                    }}
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                                {bounty.bountyAmount} ZEC
                              </TableCell>

                              <TableCell className="pr-4 text-right sm:pr-6">
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
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-56"
                                  >
                                    <DropdownMenuLabel>
                                      Change Status
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(bounty.id, "TO_DO")
                                      }
                                    >
                                      <StatusDot
                                        status="TO_DO"
                                        className="mr-2 h-2 w-2"
                                      />
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
                                      <StatusDot
                                        status="IN_PROGRESS"
                                        className="mr-2 h-2 w-2"
                                      />
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
                                      <StatusDot
                                        status="IN_REVIEW"
                                        className="mr-2 h-2 w-2"
                                      />
                                      Set In Review
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(bounty.id, "DONE")
                                      }
                                    >
                                      <StatusDot
                                        status="DONE"
                                        className="mr-2 h-2 w-2"
                                      />
                                      Mark as Done
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
                                      <Users className="mr-2 h-4 w-4" />
                                      View Applications
                                      {pendingApps > 0 && (
                                        <span className="ml-auto text-[11px] text-muted-foreground">
                                          {pendingApps}
                                        </span>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedBounty(bounty.id);
                                        setIsManagingSubmissions(true);
                                      }}
                                    >
                                      <Upload className="mr-2 h-4 w-4" />
                                      Review Submissions
                                      {pendingSubs > 0 && (
                                        <span className="ml-auto text-[11px] text-muted-foreground">
                                          {pendingSubs}
                                        </span>
                                      )}
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
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Approve Bounty
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleApprovalChange(bounty.id, false)
                                      }
                                      disabled={!bounty.isApproved}
                                      className="text-destructive"
                                    >
                                      <AlertTriangle className="mr-2 h-4 w-4" />
                                      Reject Bounty
                                    </DropdownMenuItem>

                                    {/* Destructive action isolated at the bottom */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleStatusChange(
                                          bounty.id,
                                          "CANCELLED",
                                        )
                                      }
                                      className="text-destructive"
                                    >
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Cancel Bounty
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

                  {hasMoreBounties && (
                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
                      <span className="text-xs text-muted-foreground">
                        Showing {filteredBounties.length} bounties
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
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
                            Load more
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Payments Due</h2>
                  <p className="text-xs text-muted-foreground">
                    {unpaidDoneCount} completed{" "}
                    {unpaidDoneCount === 1 ? "bounty" : "bounties"} awaiting
                    payout
                  </p>
                </div>
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
            <Card className="overflow-hidden border-muted bg-card/50 gap-0">
              <CardHeader className="flex flex-col gap-4 border-b p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Transactions</CardTitle>
                    <CardDescription>
                      {txSubTab === "wallet"
                        ? "Everything seen by your default wallet"
                        : "The app's own ledger, linked to bounties"}
                    </CardDescription>
                  </div>

                  {txSubTab === "payouts" && (
                    <Button
                      onClick={handleFetchTransactionHashes}
                      disabled={isFetchingTxHashes}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      {isFetchingTxHashes ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {isFetchingTxHashes ? "Fetching..." : "Refresh"}
                    </Button>
                  )}
                </div>

                {/* Sub-tabs */}
                <div className="-mb-px flex items-center gap-1">
                  <button
                    onClick={() => setTxSubTab("wallet")}
                    className={`relative flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      txSubTab === "wallet"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Wallet History
                    <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                      {paymentIDs?.length || 0}
                    </span>
                  </button>
                  <button
                    onClick={() => setTxSubTab("payouts")}
                    className={`relative flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      txSubTab === "payouts"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                    Bounty Payouts
                    <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                      {paymentRecords.length}
                    </span>
                  </button>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {txSubTab === "wallet" ? (
                  paymentIDs && paymentIDs.length > 0 ? (
                    <PaymentTxIdsTable
                      paymentIDs={paymentIDs}
                      chain={paymentChain}
                      serverUrl={paymentServerUrl}
                    />
                  ) : (
                    <div className="flex flex-col items-center py-16 text-center">
                      <RefreshCw className="mb-3 h-9 w-9 text-muted-foreground/40" />
                      <h3 className="text-sm font-medium">
                        No wallet history loaded
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Refresh to query the wallet.
                      </p>
                    </div>
                  )
                ) : paymentRecords.length > 0 ? (
                  <PaymentRecordsTable records={paymentRecords} />
                ) : (
                  <div className="flex flex-col items-center py-16 text-center">
                    <CreditCard className="mb-3 h-9 w-9 text-muted-foreground/40" />
                    <h3 className="text-sm font-medium">
                      No payout records yet
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Completed bounty payouts will show up here.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
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

        {/* ------------------------ Applications ------------------------ */}
        <Dialog
          open={isManagingApplications}
          onOpenChange={setIsManagingApplications}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto imd:max-w-180">
            <DialogHeader className="border-b border-border pb-3">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div>
                  <DialogTitle className="text-base font-medium leading-tight">
                    Applications
                  </DialogTitle>
                  {selectedBounty && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                      className="rounded-lg border border-border px-3.5 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                            <p className="truncate text-sm font-medium leading-tight">
                              {displayName(application.applicantUser)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Applied{" "}
                              {format(
                                new Date(application.appliedAt),
                                "MMM d, yyyy",
                              )}
                            </p>
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                            application.status === "accepted"
                              ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                              : application.status === "rejected"
                                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                                : "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                          }`}
                        >
                          {application.status || "pending"}
                        </Badge>
                      </div>

                      <p className="ml-3.5 mt-2.5 border-l-2 border-border pl-10.5 text-xs leading-relaxed text-muted-foreground wrap-anywhere">
                        {application.message}
                      </p>

                      {/* Actions moved to a full-width footer row: bigger targets */}
                      {application.status === "pending" && (
                        <div className="mt-3 flex gap-2 border-t border-border pt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 flex-1 gap-1.5 border border-green-300 bg-green-50 text-xs text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                            onClick={() =>
                              handleApplicationAction(application.id, "accept")
                            }
                            disabled={isUpdating}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 flex-1 gap-1.5 border border-red-300 bg-red-50 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                            onClick={() =>
                              handleApplicationAction(application.id, "reject")
                            }
                            disabled={isUpdating}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ),
                )
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <Users className="mb-3 h-9 w-9 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No applications yet.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ------------------------ Submissions ------------------------ */}
        <Dialog
          open={isManagingSubmissions}
          onOpenChange={setIsManagingSubmissions}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto imd:max-w-180">
            <DialogHeader className="border-b border-border pb-3">
              <div className="flex items-start gap-3">
                <Upload className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div>
                  <DialogTitle className="text-base font-medium leading-tight">
                    Submissions
                  </DialogTitle>
                  {selectedBounty && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                  <Clock className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : workSubmissions && workSubmissions.length > 0 ? (
                workSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="space-y-3 rounded-lg border border-border px-3.5 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                          <p className="truncate text-sm font-medium leading-tight">
                            {displayName(submission.submitterUser)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {format(
                              new Date(submission.submittedAt),
                              "MMM d, yyyy",
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                          submission.status === "approved"
                            ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                            : submission.status === "rejected"
                              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                              : submission.status === "needs_revision"
                                ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                                : "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                        }`}
                      >
                        {submission.status}
                      </Badge>
                    </div>

                    <p className="ml-[14px] overflow-wrap-anywhere whitespace-pre-wrap break-words border-l-2 border-border pl-[42px] text-xs leading-relaxed text-muted-foreground">
                      {submission.description}
                    </p>

                    {submission.deliverableUrl && (
                      <a
                        href={submission.deliverableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-[14px] flex items-center gap-1.5 break-all pl-[42px] text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        {submission.deliverableUrl}
                      </a>
                    )}

                    {submission.reviewNotes && (
                      <div className="ml-[14px] rounded border border-yellow-200 bg-yellow-50 p-2.5 pl-[42px] text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                        <span className="font-medium">Note: </span>
                        {submission.reviewNotes}
                      </div>
                    )}

                    {submission.status === "pending" && (
                      <div className="space-y-2.5 border-t border-border pt-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`review-notes-${submission.id}`}
                            className="text-xs"
                          >
                            Review Notes{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </Label>
                          <Textarea
                            id={`review-notes-${submission.id}`}
                            placeholder="Add feedback for the submitter..."
                            className="min-h-[64px] text-sm"
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
                            className="flex-1 bg-green-600 text-white hover:bg-green-700"
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const textarea = document.getElementById(
                                `review-notes-${submission.id}`,
                              ) as HTMLTextAreaElement;
                              handleSubmissionReview(
                                submission.id,
                                "needs_revision",
                                textarea?.value,
                              );
                            }}
                            disabled={isUpdating}
                            className="flex-1"
                          >
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Revise
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
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}

                    {submission.status === "approved" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20">
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                          <p className="text-xs text-green-700 dark:text-green-300">
                            Approved
                          </p>
                        </div>

                        {workSubmissions.some(
                          (s) =>
                            s.id !== submission.id && s.status === "pending",
                        ) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (
                                confirm(
                                  "Reject all other pending submissions for this bounty? This can't be undone.",
                                )
                              ) {
                                handleRejectOthers(submission.id);
                              }
                            }}
                            disabled={isUpdating}
                            className="w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject remaining pending submissions
                          </Button>
                        )}
                      </div>
                    )}

                    {submission.status === "rejected" && (
                      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/20">
                        <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                        <p className="text-xs text-red-700 dark:text-red-300">
                          Rejected
                        </p>
                      </div>
                    )}

                    {submission.status === "needs_revision" && (
                      <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-900/20">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                        <p className="text-xs text-orange-700 dark:text-orange-300">
                          Revision requested — bounty back to In Progress
                        </p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <Upload className="mb-3 h-9 w-9 text-muted-foreground/40" />
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
