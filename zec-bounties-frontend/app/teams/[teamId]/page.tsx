// app/teams/[teamId]/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";
import type {
  Team,
  TeamMember,
  Bounty,
  BountyApplication,
  WorkSubmission,
  TeamFavorite,
} from "@/lib/types";
import { getUserRole } from "../page";
import { TeamsNewBountyModal } from "@/components/teams/new-bounty-modal";
import { BountyDetailModal } from "@/components/teams/bounty-detail-modal";
import { TeamNavbar } from "@/components/layout/teams/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Plus, UserPlus, X } from "lucide-react";
import { backendUrl } from "@/lib/configENV";
import { TeamBanner } from "@/components/teams/team-banner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import {
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  Users,
  Upload,
  Pencil,
  FolderSync,
} from "lucide-react";
import { formatStatus } from "@/lib/utils";
import { displayName } from "@/lib/displayName";
import { format } from "date-fns";
import { TeamsEditBountyModal } from "@/components/teams/edit-bounty-modal";
import { RefreshCw } from "lucide-react";
import { PaymentTxIdsTable } from "@/components/transactions/payment-tx-table";
import { Switch } from "@/components/ui/switch";
import { BountyCard } from "@/components/bounty-card";

type Tab =
  | "Overview"
  | "Bounty program"
  | "Community"
  | "Members"
  | "Treasury"
  | "Settings";
const TABS: Tab[] = [
  "Overview",
  "Bounty program",
  "Community",
  "Members",
  "Treasury",
  "Settings",
];

function formatZec(amount: number) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ZEC`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function statusMeta(status: Bounty["status"]) {
  switch (status) {
    case "DONE":
      return {
        label: "Done",
        className: "text-green-600 border-green-500/30 bg-green-500/10",
      };
    case "IN_PROGRESS":
      return {
        label: "In progress",
        className: "text-blue-600 border-blue-500/30 bg-blue-500/10",
      };
    case "IN_REVIEW":
      return {
        label: "In review",
        className: "text-yellow-600 border-yellow-500/30 bg-yellow-500/10",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        className: "text-red-600 border-red-500/30 bg-red-500/10",
      };
    default:
      return {
        label: "To do",
        className: "text-muted-foreground border-border bg-muted/30",
      };
  }
}

function roleBadgeClass(role: string) {
  if (role === "OWNER") return "text-primary border-primary/30 bg-primary/10";
  if (role === "ADMIN") return "text-foreground border-border bg-muted/40";
  return "text-muted-foreground border-border bg-transparent";
}

function applicationStatusClass(status?: string) {
  switch (status) {
    case "accepted":
      return "text-green-600 border-green-500/30 bg-green-500/10";
    case "rejected":
      return "text-red-600 border-red-500/30 bg-red-500/10";
    default:
      return "text-muted-foreground border-border bg-muted/30";
  }
}

function submissionStatusClass(status?: string) {
  switch (status) {
    case "approved":
      return "text-green-600 border-green-500/30 bg-green-500/10";
    case "rejected":
      return "text-red-600 border-red-500/30 bg-red-500/10";
    case "needs_revision":
      return "text-yellow-600 border-yellow-500/30 bg-yellow-500/10";
    default:
      return "text-muted-foreground border-border bg-muted/30";
  }
}

export default function TeamConsolePage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const { currentUser, teams, teamsLoading, fetchTeams, bounties } =
    useBounty();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [searchQuery, setSearchQuery] = useState("");

  // Refresh-safe: if the store is empty (e.g. hard refresh landed straight
  // here), fetch teams so we can resolve the id from the URL.
  useEffect(() => {
    if (currentUser && teams.length === 0) fetchTeams();
  }, [currentUser?.id]);

  const team = teams.find((t) => t.id === params.teamId) ?? null;
  const teamBounties = bounties.filter((b) => b.teamId === params.teamId);

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <TeamNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="xl:container xl:mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Log in to view this team.</p>
        </div>
      </main>
    );
  }

  if (teamsLoading && !team) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <TeamNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="xl:container xl:mx-auto px-4 py-20 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading team...</p>
        </div>
      </main>
    );
  }

  if (!team) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <TeamNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <div className="xl:container xl:mx-auto px-4 py-16 text-center">
          <p className="mb-4 text-muted-foreground">
            Team not found, or you don't have access to it.
          </p>
          <Button variant="outline" onClick={() => router.push("/teams")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to all teams
          </Button>
        </div>
      </main>
    );
  }

  const role = getUserRole(team, currentUser.id, currentUser.role === "ADMIN");
  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <TeamNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/teams")}
          className="mb-6 -ml-2 text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All teams
        </Button>

        <TeamBanner teamId={team.id} bannerUrl={null} canManage={canManage} />

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border">
              {team.logo && (
                <AvatarImage
                  src={`${backendUrl}${team.logo}`}
                  alt={`${team.name} logo`}
                />
              )}
              <AvatarFallback className="text-lg font-semibold">
                {initials(team.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                {team.name}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {team.description || "No description yet."}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`w-fit ${roleBadgeClass(role)}`}>
            {role}
          </Badge>
        </div>

        <div className="mb-8 flex gap-1 overflow-x-auto border-b">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Overview" && (
          <OverviewTab
            team={team}
            teamBounties={teamBounties}
            canManage={canManage}
          />
        )}
        {activeTab === "Bounty program" && (
          <BountyProgramTab
            team={team}
            teamBounties={teamBounties}
            canManage={canManage}
          />
        )}
        {activeTab === "Members" && (
          <MembersTab team={team} canManage={canManage} />
        )}
        {activeTab === "Community" && <CommunityTab team={team} />}
        {activeTab === "Treasury" && (
          <TreasuryTab
            team={team}
            teamBounties={teamBounties}
            canManage={canManage}
          />
        )}
        {activeTab === "Settings" && (
          <SettingsTab
            team={team}
            currentUserId={currentUser.id}
            canManage={canManage}
            isOwner={role === "OWNER"}
          />
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function statusDotColor(status: Bounty["status"]) {
  switch (status) {
    case "TO_DO":
      return "bg-slate-400";
    case "IN_PROGRESS":
      return "bg-blue-500";
    case "IN_REVIEW":
      return "bg-yellow-500";
    case "DONE":
      return "bg-green-500";
    default:
      return "bg-red-500";
  }
}

function OverviewTab({
  team,
  teamBounties,
  canManage,
}: {
  team: Team;
  teamBounties: Bounty[];
  canManage: boolean;
}) {
  const {
    currentUser,
    fetchTeamApplications,
    fetchTeamSubmissions,
    acceptApplication,
    rejectApplication,
    reviewWorkSubmission,
  } = useBounty();

  const [applications, setApplications] = useState<BountyApplication[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [managingBountyId, setManagingBountyId] = useState<string | null>(null);
  const [isManagingApplications, setIsManagingApplications] = useState(false);
  const [isManagingSubmissions, setIsManagingSubmissions] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingBounty, setEditingBounty] = useState<Bounty | null>(null);
  const [assigneeSectionBounty, setAssigneeSectionBounty] =
    useState<Bounty | null>(null);

  const loadActivity = async () => {
    const [apps, subs] = await Promise.all([
      fetchTeamApplications(team.id),
      fetchTeamSubmissions(team.id),
    ]);
    setApplications(apps);
    setSubmissions(subs);
  };

  useEffect(() => {
    loadActivity();
  }, [team.id]);

  const totalPaid = teamBounties
    .filter((b) => b.status === "DONE")
    .reduce((sum, b) => sum + b.bountyAmount, 0);
  const active = teamBounties.filter(
    (b) => b.status === "IN_PROGRESS" || b.status === "IN_REVIEW",
  ).length;

  const managingBounty = teamBounties.find((b) => b.id === managingBountyId);
  const managingApplications = applications.filter(
    (a) => a.bountyId === managingBountyId,
  );
  const managingSubmissions = submissions.filter(
    (s) => s.bountyId === managingBountyId,
  );

  const handleApplicationAction = async (
    applicationId: string,
    action: "accept" | "reject",
  ) => {
    setIsUpdating(true);
    try {
      if (action === "accept") await acceptApplication(applicationId);
      else await rejectApplication(applicationId);
      await loadActivity();
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
      await loadActivity();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 imd:grid-cols-4">
        <StatCard label="Members" value={String(team.members.length)} />
        <StatCard label="Active bounties" value={String(active)} />
        <StatCard label="Paid out" value={formatZec(totalPaid)} />
        <StatCard
          label="Treasury"
          value={team.wallet ? "See Treasury tab" : "—"}
        />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Team bounties</h2>
            <p className="text-xs text-muted-foreground">
              Every bounty posted under {team.name}
            </p>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="py-3 pl-4 sm:pl-6">Bounty</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Assignee</TableHead>
              <TableHead className="hidden lg:table-cell">
                Applications
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                Submissions
              </TableHead>
              <TableHead className="hidden sm:table-cell">Reward</TableHead>
              {canManage && (
                <TableHead className="text-right pr-4 sm:pr-6">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamBounties.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 8 : 7}
                  className="text-center py-12 text-muted-foreground"
                >
                  No bounties yet for this team.
                </TableCell>
              </TableRow>
            ) : (
              teamBounties.map((bounty) => {
                const bountyApps = applications.filter(
                  (a) => a.bountyId === bounty.id,
                );
                const pendingApps = bountyApps.filter(
                  (a) => a.status === "pending",
                ).length;
                const bountySubs = submissions.filter(
                  (s) => s.bountyId === bounty.id,
                );
                const pendingSubs = bountySubs.filter(
                  (s) => s.status === "pending",
                ).length;

                return (
                  <TableRow
                    key={bounty.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-medium py-3 pl-4 sm:pl-6 max-w-[180px] sm:max-w-[240px]">
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
                                  {displayName(bounty.createdByUser)[0]}
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
                          <div className="flex items-center gap-2 mt-1 sm:hidden flex-wrap">
                            <div className="flex items-center gap-1">
                              <div
                                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusDotColor(bounty.status)}`}
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
                        {bounty.categoryId ?? "uncategorized"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${statusDotColor(bounty.status)}`}
                        />
                        <span className="text-sm">
                          {formatStatus(bounty.status)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {bounty.assignees && bounty.assignees.length > 0 ? (
                        <button
                          className="flex items-center gap-2 hover:opacity-75 transition-opacity"
                          onClick={() => setAssigneeSectionBounty(bounty)}
                        >
                          <div className="flex items-center">
                            {bounty.assignees.slice(0, 3).map((a, i) => (
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
                                    a.user?.avatar || "/placeholder-user.jpg"
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
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] gap-1 px-2 border border-dashed"
                          onClick={() => setAssigneeSectionBounty(bounty)}
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
                            ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                            : bountyApps.length > 0
                              ? "border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                              : "border border-dashed"
                        }`}
                        onClick={() => {
                          setManagingBountyId(bounty.id);
                          setIsManagingApplications(true);
                        }}
                      >
                        <Users className="h-3 w-3" />
                        {bountyApps.length > 0
                          ? `${bountyApps.length}${pendingApps > 0 ? ` (${pendingApps} pending)` : ""}`
                          : "None"}
                      </Button>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 text-xs gap-1 px-2 ${
                          pendingSubs > 0
                            ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                            : bountySubs.length > 0
                              ? "border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                              : "border border-dashed"
                        }`}
                        onClick={() => {
                          setManagingBountyId(bounty.id);
                          setIsManagingSubmissions(true);
                        }}
                      >
                        <Upload className="h-3 w-3" />
                        {bountySubs.length > 0
                          ? `${bountySubs.length}${pendingSubs > 0 ? ` (${pendingSubs} pending)` : ""}`
                          : "None"}
                      </Button>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-sm">
                      {bounty.bountyAmount} ZEC
                    </TableCell>
                    {canManage && (
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
                            <DropdownMenuLabel>Manage</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setEditingBounty(bounty)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit bounty
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setManagingBountyId(bounty.id);
                                setIsManagingApplications(true);
                              }}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              View Applications
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setManagingBountyId(bounty.id);
                                setIsManagingSubmissions(true);
                              }}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Review Submissions
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <TeamsEditBountyModal
        bounty={editingBounty}
        open={!!editingBounty}
        onOpenChange={(open) => {
          if (!open) setEditingBounty(null);
        }}
      />

      <TeamsEditBountyModal
        bounty={assigneeSectionBounty}
        open={!!assigneeSectionBounty}
        defaultSection="assignees"
        onOpenChange={(open) => {
          if (!open) setAssigneeSectionBounty(null);
        }}
      />

      {/* ── Applications dialog ── */}
      <Dialog
        open={isManagingApplications}
        onOpenChange={setIsManagingApplications}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <DialogTitle className="text-base font-medium leading-tight">
                  Applications
                </DialogTitle>
                {managingBounty && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {managingBounty.title} &middot;{" "}
                    {managingApplications.length} applicant
                    {managingApplications.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {managingApplications.length > 0 ? (
              managingApplications.map((application) => (
                <div
                  key={application.id}
                  className="border rounded-lg px-3.5 py-3"
                >
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
                            className="h-6 px-2 text-[11px] gap-1 border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                            onClick={() =>
                              handleApplicationAction(application.id, "accept")
                            }
                            disabled={isUpdating}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px] gap-1 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                            onClick={() =>
                              handleApplicationAction(application.id, "reject")
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
                  <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed pl-10.5 border-l-2 ml-3.5 wrap-anywhere">
                    {application.message}
                  </p>
                </div>
              ))
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

      {/* ── Submissions dialog ── */}
      <Dialog
        open={isManagingSubmissions}
        onOpenChange={setIsManagingSubmissions}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-start gap-3">
              <Upload className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <DialogTitle className="text-base font-medium leading-tight">
                  Submissions
                </DialogTitle>
                {managingBounty && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {managingBounty.title} &middot; {managingSubmissions.length}{" "}
                    submission{managingSubmissions.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {managingSubmissions.length > 0 ? (
              managingSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="border rounded-lg px-3.5 py-3 space-y-3"
                >
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

                  <p className="text-xs text-muted-foreground leading-relaxed break-words whitespace-pre-wrap pl-[42px] border-l-2 ml-[14px]">
                    {submission.description}
                  </p>

                  {submission.deliverableUrl && (
                    <a
                      href={submission.deliverableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all pl-[42px] ml-[14px]"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      {submission.deliverableUrl}
                    </a>
                  )}

                  {submission.status === "pending" && (
                    <div className="border-t pt-3 space-y-2.5">
                      <Textarea
                        id={`team-review-notes-${submission.id}`}
                        placeholder="Add feedback for the submitter..."
                        className="text-sm min-h-[64px]"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const textarea = document.getElementById(
                              `team-review-notes-${submission.id}`,
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
                              `team-review-notes-${submission.id}`,
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
    </div>
  );
}

function BountyProgramTab({
  team,
  teamBounties,
  canManage,
}: {
  team: Team;
  teamBounties: Bounty[];
  canManage: boolean;
}) {
  const [showNewBounty, setShowNewBounty] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {teamBounties.length} bounties
          </h2>
          {canManage && (
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => setShowNewBounty(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New bounty
            </Button>
          )}
        </div>

        {teamBounties.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground bg-muted/20">
            No bounties posted for this team yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 imd:grid-cols-3">
            {teamBounties.map((bounty) => (
              <BountyCard
                key={bounty.id}
                bounty={bounty}
                viewMode="grid"
                onClick={() => {
                  setSelectedBounty(bounty);
                  setIsDetailModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[300px] xl:w-[340px]">
        <TeamActivityFeed teamId={team.id} canManage={canManage} />
      </div>

      <TeamsNewBountyModal
        open={showNewBounty}
        onOpenChange={setShowNewBounty}
        onSuccess={() => setShowNewBounty(false)}
        onCancel={() => setShowNewBounty(false)}
        defaultTeamId={team.id}
        defaultTeamName={team.name}
      />

      <BountyDetailModal
        bounty={selectedBounty}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
      />
    </div>
  );
}

function TeamActivityFeed({
  teamId,
  canManage,
}: {
  teamId: string;
  canManage: boolean;
}) {
  const {
    fetchTeamApplications,
    fetchTeamSubmissions,
    acceptApplication,
    rejectApplication,
    reviewWorkSubmission,
  } = useBounty();
  const [applications, setApplications] = useState<BountyApplication[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const loadActivity = async () => {
    setLoading(true);
    try {
      const [apps, subs] = await Promise.all([
        fetchTeamApplications(teamId),
        fetchTeamSubmissions(teamId),
      ]);
      setApplications(apps);
      setSubmissions(subs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, [teamId]);

  const pendingApplications = applications.filter(
    (a) => a.status === "pending",
  );
  const pendingSubmissions = submissions.filter((s) => s.status === "pending");

  const handleAccept = async (id: string) => {
    setActioningId(id);
    try {
      await acceptApplication(id);
      await loadActivity();
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioningId(id);
    try {
      await rejectApplication(id);
      await loadActivity();
    } finally {
      setActioningId(null);
    }
  };

  const handleReview = async (
    id: string,
    status: "approved" | "rejected" | "needs_revision",
  ) => {
    setActioningId(id);
    try {
      await reviewWorkSubmission(id, { status });
      await loadActivity();
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading team activity...
      </div>
    );
  }

  if (applications.length === 0 && submissions.length === 0) return null;

  return (
    <div className="mb-6 space-y-5 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Team activity
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {pendingApplications.length + pendingSubmissions.length} pending
        </span>
      </div>

      {applications.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Applications ({applications.length})
          </h4>
          <div className="space-y-2">
            {applications.map((app) => (
              <div key={app.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {app.applicantUser?.nickname ||
                        app.applicantUser?.name ||
                        "Unknown"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      on {app.bounty?.title ?? "Unknown bounty"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {app.message}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[11px] ${applicationStatusClass(app.status)}`}
                  >
                    {app.status}
                  </Badge>
                </div>
                {canManage && app.status === "pending" && (
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => handleAccept(app.id)}
                      disabled={actioningId === app.id}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => handleReject(app.id)}
                      disabled={actioningId === app.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {submissions.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Submissions ({submissions.length})
          </h4>
          <div className="space-y-2">
            {submissions.map((sub) => (
              <div key={sub.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {sub.submitterUser?.nickname ||
                        sub.submitterUser?.name ||
                        "Unknown"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      on {sub.bounty?.title ?? "Unknown bounty"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sub.description}
                    </p>
                    {sub.deliverableUrl && (
                      <a
                        href={sub.deliverableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block break-all text-[11px] text-primary hover:underline"
                      >
                        {sub.deliverableUrl}
                      </a>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[11px] ${submissionStatusClass(sub.status)}`}
                  >
                    {sub.status}
                  </Badge>
                </div>
                {canManage && sub.status === "pending" && (
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => handleReview(sub.id, "approved")}
                      disabled={actioningId === sub.id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => handleReview(sub.id, "needs_revision")}
                      disabled={actioningId === sub.id}
                    >
                      Needs revision
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => handleReview(sub.id, "rejected")}
                      disabled={actioningId === sub.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MembersTab({ team, canManage }: { team: Team; canManage: boolean }) {
  const { addTeamMembers, removeTeamMember, nonAdminUsers, fetchUsers } =
    useBounty();
  const [showInvite, setShowInvite] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const memberIds = new Set(team.members.map((m) => m.userId));
  const candidates = nonAdminUsers.filter((u) => !memberIds.has(u.id));

  const handleInvite = async () => {
    if (!selectedUserId) return;
    setSubmitting(true);
    try {
      await addTeamMembers(team.id, [selectedUserId], inviteRole);
      setShowInvite(false);
      setSelectedUserId("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {team.members.length} members
        </h2>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInvite(true)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" /> Invite member
          </Button>
        )}
      </div>

      <div className="divide-y rounded-xl border bg-card">
        {team.members.map((member: TeamMember) => (
          <div
            key={member.userId}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border">
                <AvatarImage src={(member as any).user?.avatar || undefined} />
                <AvatarFallback className="text-xs">
                  {initials(
                    (member as any).user?.name ||
                      (member as any).user?.email ||
                      "?",
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm font-medium">
                  {(member as any).user?.name || "Unnamed"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(member as any).user?.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`shrink-0 text-[11px] ${roleBadgeClass(member.role)}`}
              >
                {member.role}
              </Badge>
              {canManage && member.role !== "OWNER" && (
                <button
                  type="button"
                  onClick={() => removeTeamMember(team.id, member.userId)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-user" className="text-xs">
                User
              </Label>
              <select
                id="invite-user"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Select a user...</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-xs">
                Role
              </Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "ADMIN" | "MEMBER")
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!selectedUserId || submitting}
            >
              {submitting ? "Inviting..." : "Invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommunityTab({ team }: { team: Team }) {
  const { fetchTeamCommunity } = useBounty();
  const [community, setCommunity] = useState<TeamFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTeamCommunity(team.id)
      .then(setCommunity)
      .finally(() => setLoading(false));
  }, [team.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {community.length} {community.length === 1 ? "member" : "members"}
        </h2>
      </div>

      {community.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground bg-muted/20">
          No one has joined {team.name}'s community yet. Favoriting this team
          adds someone here — and lets them see the team's private bounties.
        </p>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {community.map((fav) => (
            <div
              key={fav.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border">
                  <AvatarImage src={fav.user?.avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {initials(displayName(fav.user))}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">
                    {displayName(fav.user)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fav.user?.email}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Joined {format(new Date(fav.createdAt), "MMM d, yyyy")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TreasuryTab({
  team,
  teamBounties,
  canManage,
}: {
  team: Team;
  teamBounties: Bounty[];
  canManage: boolean;
}) {
  const {
    fetchTeamWalletBalance,
    createTeamWallet,
    fetchTeamTransactionHashes,
    teamPaymentIDs,
    teamPaymentChain,
    teamPaymentServerUrl,
    rescanTeamWallet,
    teamRescanLoading,
    teamRescanStatus,
  } = useBounty();
  const [balance, setBalance] = useState<any>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [isFetchingTxHashes, setIsFetchingTxHashes] = useState(false);

  const loadBalance = () => {
    if (!team.wallet) return;
    setBalanceLoading(true);
    fetchTeamWalletBalance(team.id)
      .then(setBalance)
      .finally(() => setBalanceLoading(false));
  };

  useEffect(() => {
    loadBalance();
  }, [team.id, team.wallet]);

  const handleFetchTransactions = async () => {
    setIsFetchingTxHashes(true);
    try {
      await fetchTeamTransactionHashes(team.id);
    } finally {
      setIsFetchingTxHashes(false);
    }
  };

  const handleRescan = async () => {
    await rescanTeamWallet(team.id);
  };

  if (!team.wallet) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-8 py-14 text-center">
        <span className="text-sm font-medium text-muted-foreground">
          No wallet set up
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">
          Set up a shared wallet so bounty payouts for this team can be
          authorized on completion.
        </p>
        {canManage &&
          (settingUp ? (
            <div className="mt-2 flex w-full max-w-xs flex-col gap-3">
              <input
                type="text"
                placeholder="Account name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button
                onClick={() => createTeamWallet(team.id, { accountName })}
                disabled={!accountName.trim()}
              >
                Create wallet
              </Button>
            </div>
          ) : (
            <Button className="mt-1" onClick={() => setSettingUp(true)}>
              Set up wallet
            </Button>
          ))}
      </div>
    );
  }

  const confirmed =
    balance?.confirmed_sapling_balance ?? balance?.confirmed_orchard_balance;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Account</div>
            <div className="mt-1 text-sm font-medium">
              {team.wallet.accountName}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {team.wallet.chain}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={loadBalance}
              disabled={balanceLoading}
              title="Refresh balance"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`}
              />
            </Button>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleRescan}
                disabled={teamRescanLoading}
                title="Rescan wallet"
              >
                {teamRescanLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderSync className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 text-3xl font-bold text-primary">
          {balanceLoading
            ? "…"
            : confirmed != null
              ? formatZec(confirmed / 1e8)
              : "—"}
        </div>
        {teamRescanStatus && (
          <p className="mt-2 text-xs text-muted-foreground">
            {teamRescanStatus}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Recent payouts
        </h2>
        <div className="divide-y rounded-xl border bg-card">
          {teamBounties
            .filter((b) => b.status === "DONE")
            .map((bounty) => (
              <div
                key={bounty.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm">{bounty.title}</span>
                <span className="text-sm text-muted-foreground">
                  −{formatZec(bounty.bountyAmount)}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Transaction history
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleFetchTransactions}
            disabled={isFetchingTxHashes}
          >
            {isFetchingTxHashes ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isFetchingTxHashes ? "Fetching..." : "Refresh"}
          </Button>
        </div>

        {teamPaymentIDs && teamPaymentIDs.length > 0 ? (
          <PaymentTxIdsTable
            paymentIDs={teamPaymentIDs}
            chain={teamPaymentChain}
            serverUrl={teamPaymentServerUrl}
          />
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 py-12 text-center">
            <RefreshCw className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No transactions loaded yet. Click Refresh to fetch history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTab({
  team,
  currentUserId,
  canManage,
  isOwner,
}: {
  team: Team;
  currentUserId: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const {
    updateTeam,
    deleteTeam,
    removeTeamMember,
    uploadTeamLogo,
    removeTeamLogo,
  } = useBounty();
  const router = useRouter();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [isPrivate, setIsPrivate] = useState(team.isPrivate);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      await uploadTeamLogo(team.id, file);
    } catch (err) {
      console.error(err);
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleLogoRemove = async () => {
    setLogoUploading(true);
    try {
      await removeTeamLogo(team.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTeam(team.id, { name, description, isPrivate });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDangerAction = async () => {
    if (isOwner) {
      if (!confirm(`Delete ${team.name}? This can't be undone.`)) return;
      await deleteTeam(team.id);
      router.push("/teams");
    } else {
      if (!confirm(`Leave ${team.name}?`)) return;
      await removeTeamMember(team.id, currentUserId);
      router.push("/teams");
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      {canManage && (
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Team logo
          </Label>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border rounded-lg">
              {team.logo && (
                <AvatarImage
                  src={`${backendUrl}${team.logo}`}
                  alt={`${team.name} logo`}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="rounded-lg text-lg font-semibold">
                {initials(team.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
              >
                {logoUploading
                  ? "Uploading..."
                  : team.logo
                    ? "Replace"
                    : "Upload"}
              </Button>
              {team.logo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLogoRemove}
                  disabled={logoUploading}
                  className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            PNG, JPEG, WEBP, or SVG. Max 5MB.
          </p>
        </div>
      )}

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          Team name
        </Label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          Description
        </Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="pr-4">
          <Label className="text-sm">Private team</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When private, only {team.name}'s community (members and favoriters)
            can see and apply to its bounties. Flipping this updates every
            existing bounty under this team.
          </p>
        </div>
        <Switch
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          disabled={!canManage}
        />
      </div>

      {canManage ? (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only owners and admins can edit team settings.
        </p>
      )}

      <div className="border-t pt-6">
        <h3 className="mb-2 text-xs font-semibold text-red-500">Danger zone</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDangerAction}
          className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
        >
          {isOwner ? "Delete team" : "Leave team"}
        </Button>
      </div>
    </div>
  );
}
