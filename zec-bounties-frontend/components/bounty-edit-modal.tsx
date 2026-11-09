"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Save,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Coins,
  FileText,
  UserPlus,
  MessageSquare,
  History,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBounty } from "@/lib/bounty-context";
import { Bounty, BountyActivity, User } from "@/lib/types";
import Link from "next/link";
import { displayName } from "@/lib/displayName";
import { toDateInputValue, parseDateInputValue } from "@/lib/utils";
import { REPOS } from "@/lib/repos";
import { IS_DEV } from "@/lib/configENV";
import { RepoMenuLabel } from "@/components/repo-filter";
import { ZecToUsd } from "@/components/ZecToUsd";
import { BountyChat } from "@/components/bounty-chat";

// One edit modal for both surfaces. `variant` only switches the few things that really
// differ; the backend stays the authority on who may edit what.
export type BountyEditVariant = "admin" | "team";
type Section = "details" | "assignees" | "activity" | "chat";

export interface BountyEditModalProps {
  variant: BountyEditVariant;
  bounty: Bounty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: "details" | "assignees";
}

const fmtStatus = (s?: string) => (s ?? "").replace(/_/g, " ").toLowerCase();

function describeActivity(a: BountyActivity, bounty: Bounty): string {
  const m = a.meta ?? {};
  switch (a.type) {
    case "CREATED":
      return "created this bounty";
    case "APPROVED":
      return "approved this bounty";
    case "UNAPPROVED":
      return "revoked approval";
    case "EDITED":
      return `edited ${(m.fields ?? []).join(", ")}`;
    case "STATUS_CHANGED": {
      const winner = m.winnerId
        ? bounty.assignees?.find((x) => x.userId === m.winnerId)?.user
        : null;
      return `changed status from ${fmtStatus(m.from)} to ${fmtStatus(m.to)}${
        winner ? ` (winner: ${displayName(winner as any)})` : ""
      }`;
    }
    case "ASSIGNEES_UPDATED": {
      const parts = [];
      if (m.added?.length) parts.push(`added ${m.added.join(", ")}`);
      if (m.removed?.length) parts.push(`removed ${m.removed.join(", ")}`);
      return `updated assignees: ${parts.join("; ")}`;
    }
    case "WORK_SUBMITTED":
      return "submitted work";
    case "SUBMISSION_APPROVED":
      return `accepted ${m.submitter ?? "a"}'s submission`;
    case "SUBMISSION_REJECTED":
      return `rejected ${m.submitter ?? "a"}'s submission`;
    case "SUBMISSION_NEEDS_REVISION":
      return `requested revision on ${m.submitter ?? "a"}'s submission`;
    case "APPLICATION_ACCEPTED":
      return `accepted ${m.applicant ?? "an"}'s application`;
    case "APPLICATION_REJECTED":
      return `rejected ${m.applicant ?? "an"}'s application`;
    case "PAYMENT_AUTHORIZED":
      return "authorized payment";
    default:
      return a.type.toLowerCase().replace(/_/g, " ");
  }
}

export function BountyEditModal({
  variant,
  bounty,
  open,
  onOpenChange,
  defaultSection = "details",
}: BountyEditModalProps) {
  const {
    updateBounty,
    nonAdminUsers,
    currentUser,
    fetchBountyActivity,
    fetchTeamDirectory,
  } = useBounty();

  const isAdminView = variant === "admin";
  const canEditChain = isAdminView || IS_DEV;
  const showRepo = isAdminView;
  const showChat = isAdminView;
  const sections: Section[] = showChat
    ? ["details", "assignees", "activity", "chat"]
    : ["details", "assignees", "activity"];

  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>(defaultSection);

  // Activity
  const [activity, setActivity] = useState<BountyActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [timeToComplete, setTimeToComplete] = useState("");
  const [chain, setChain] = useState<"MAIN" | "TEST">("MAIN");
  const [targetRepo, setTargetRepo] = useState("");

  // Assignee picker
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [notifyUsers, setNotifyUsers] = useState(false);

  // Team variant: the team's community, fetched only while the Assignees tab is open
  // and cleared on close so it never outlives the modal.
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Populate the form when the bounty changes; honour defaultSection on re-open
  useEffect(() => {
    if (!bounty) return;
    setTitle(bounty.title ?? "");
    setDescription(bounty.description ?? "");
    setBountyAmount(String(bounty.bountyAmount ?? ""));
    setTimeToComplete(
      bounty.timeToComplete
        ? toDateInputValue(new Date(bounty.timeToComplete))
        : "",
    );
    setChain(bounty.chain ?? "MAIN");
    setTargetRepo(bounty.targetRepo ?? "");
    setSelectedUserIds(bounty.assignees?.map((a) => a.userId) ?? []);
    setAssigneeSearch("");
    setNotifyUsers(false);
    setActiveSection(defaultSection);
  }, [bounty, open, defaultSection]);

  // Load activity when its tab is shown
  useEffect(() => {
    if (!open || !bounty || activeSection !== "activity") return;
    let cancelled = false;
    setActivityLoading(true);
    fetchBountyActivity(bounty.id).then((rows) => {
      if (cancelled) return;
      setActivity(rows);
      setActivityLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bounty?.id, activeSection]);

  // Live updates while the modal is open
  useEffect(() => {
    if (!open || !bounty) return;
    const onActivity = (e: Event) => {
      const row = (e as CustomEvent<BountyActivity>).detail;
      if (row.bountyId !== bounty.id) return;
      setActivity((prev) =>
        prev.some((a) => a.id === row.id) ? prev : [row, ...prev],
      );
    };
    window.addEventListener("bounty-activity", onActivity);
    return () => window.removeEventListener("bounty-activity", onActivity);
  }, [open, bounty?.id]);

  // Team directory (team variant only)
  useEffect(() => {
    if (
      !open ||
      variant !== "team" ||
      activeSection !== "assignees" ||
      !bounty?.teamId
    )
      return;
    let cancelled = false;
    setUsersLoading(true);
    fetchTeamDirectory(bounty.teamId)
      .then((list) => {
        if (!cancelled) setTeamUsers(list);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant, activeSection, bounty?.teamId]);

  useEffect(() => {
    if (!open) setTeamUsers([]);
  }, [open]);

  const candidates: User[] = isAdminView ? nonAdminUsers : teamUsers;

  // Existing assignees may not be in the candidate list (for example an accepted
  // applicant who isn't in the community), so keep them known so their chips render and
  // can be removed. The fuller candidate record wins when both exist.
  const knownUsers = useMemo(() => {
    const map = new Map<string, User>();
    bounty?.assignees?.forEach((a) =>
      map.set(a.userId, a.user as unknown as User),
    );
    candidates.forEach((u) => map.set(u.id, u));
    return map;
  }, [bounty?.assignees, candidates]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  // true / false when we know, undefined when we don't. Unknown is never treated as
  // "missing", so it can't block Save. Server flags win (team directory); otherwise a
  // record that carries the address field at all (admin's full user list) is conclusive.
  const hasAddress = (u: User): boolean | undefined => {
    const flag = chain === "MAIN" ? u.hasUnifiedAddress : u.hasShieldedAddress;
    if (flag !== undefined) return flag;
    const field = chain === "MAIN" ? "UA_address" : "z_address";
    if (field in u) return Boolean((u as any)[field]);
    return undefined;
  };
  const lacksAddress = (u: User) => hasAddress(u) === false;

  const q = assigneeSearch.toLowerCase();
  const filteredUsers = candidates
    .filter(
      (u) =>
        displayName(u).toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const aSelected = selectedUserIds.includes(a.id);
      const bSelected = selectedUserIds.includes(b.id);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      const aHas = hasAddress(a) === true;
      const bHas = hasAddress(b) === true;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return 0;
    });

  const handleSave = async () => {
    if (!bounty) return;
    setIsSaving(true);
    try {
      const existingIds = bounty.assignees?.map((a) => a.userId) ?? [];
      const assigneesChanged =
        selectedUserIds.length !== existingIds.length ||
        selectedUserIds.some((id) => !existingIds.includes(id));

      // Preserve unchanged deadlines, including expired dates and their time of day.
      const originalDeadline = bounty.timeToComplete
        ? toDateInputValue(new Date(bounty.timeToComplete))
        : "";
      await updateBounty(bounty.id, {
        title,
        description,
        bountyAmount: parseFloat(bountyAmount),
        timeToComplete:
          timeToComplete && timeToComplete !== originalDeadline
            ? parseDateInputValue(timeToComplete)
            : undefined,
        ...(canEditChain && chain !== (bounty.chain ?? "MAIN") && { chain }),
        ...(showRepo && { targetRepo: targetRepo || null }),
        notifyUsers,
        ...(assigneesChanged && { userIds: selectedUserIds }),
      } as any);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save bounty:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!bounty || !currentUser) return null;
  // UI guard only; the backend enforces who may edit
  if (isAdminView && currentUser.role !== "ADMIN") return null;

  const selectedUsers = selectedUserIds
    .map((id) => knownUsers.get(id))
    .filter((u): u is User => Boolean(u));
  const selectedUsersWithoutAddress = selectedUsers.filter(lacksAddress);
  const hasAddressWarning = selectedUsersWithoutAddress.length > 0;
  const showFooter =
    activeSection === "details" || activeSection === "assignees";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            Edit Bounty
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
            {bounty.title}
          </p>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b shrink-0">
          {sections.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSection(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeSection === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "details" ? (
                <FileText className="h-4 w-4" />
              ) : tab === "assignees" ? (
                <Users className="h-4 w-4" />
              ) : tab === "activity" ? (
                <History className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              {tab}
              {tab === "assignees" && selectedUserIds.length > 0 && (
                <span className="ml-1 bg-primary/15 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {selectedUserIds.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeSection === "details" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-title"
                  className="flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Title
                </Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Bounty title"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-desc"
                  className="flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Description
                </Label>
                <Textarea
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the bounty..."
                  rows={5}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-amount"
                    className="flex items-center gap-1.5"
                  >
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Reward (ZEC)
                  </Label>
                  <Input
                    id="edit-amount"
                    type="number"
                    min="0"
                    step="0.001"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                    placeholder="0.000"
                  />
                  {isAdminView &&
                    bountyAmount &&
                    !isNaN(parseFloat(bountyAmount)) && (
                      <ZecToUsd
                        zecAmount={parseFloat(bountyAmount)}
                        showZec={false}
                      />
                    )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-chain"
                    className="flex items-center gap-1.5"
                  >
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Network
                  </Label>
                  {canEditChain ? (
                    <Select
                      value={chain}
                      onValueChange={(v) => setChain(v as "MAIN" | "TEST")}
                    >
                      <SelectTrigger id="edit-chain" className="w-full">
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAIN">Mainnet</SelectItem>
                        <SelectItem value="TEST">Testnet</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="edit-chain"
                      value={chain === "MAIN" ? "Mainnet" : "Testnet"}
                      disabled
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-deadline"
                    className="flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Deadline
                  </Label>
                  <Input
                    id="edit-deadline"
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={timeToComplete}
                    onChange={(e) => setTimeToComplete(e.target.value)}
                  />
                </div>
              </div>

              {showRepo && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-repo">Repository</Label>
                  <Select
                    value={targetRepo || "none"}
                    onValueChange={(value) =>
                      setTargetRepo(value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="edit-repo" className="w-full">
                      <SelectValue placeholder="No repository" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No repository</SelectItem>
                      {REPOS.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          <RepoMenuLabel repoId={repo.id} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {activeSection === "assignees" && (
            <div className="space-y-4">
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-muted/40 rounded-lg border border-dashed">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border text-xs font-medium shadow-sm"
                    >
                      <Link
                        href={`/users/${u.id}`}
                        className="inline-flex items-center gap-1.5 hover:underline focus:outline-none focus:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Avatar className="h-4 w-4">
                          <AvatarImage
                            src={u.avatar || "/placeholder-user.jpg"}
                          />
                          <AvatarFallback className="text-[8px]">
                            {displayName(u)[0]}
                          </AvatarFallback>
                        </Avatar>
                        {displayName(u)}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleUser(u.id);
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                        aria-label={`Remove ${displayName(u)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {hasAddressWarning && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      Missing{" "}
                      {chain === "MAIN"
                        ? "Unified Address (UA)"
                        : "Transparent Address (TA)"}
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-300 text-xs">
                      {selectedUsersWithoutAddress
                        .map((u) => displayName(u))
                        .join(", ")}{" "}
                      {selectedUsersWithoutAddress.length === 1
                        ? "has"
                        : "have"}{" "}
                      no {chain === "MAIN" ? "UA" : "TA"} set and cannot receive
                      payment on {chain === "MAIN" ? "mainnet" : "testnet"}.
                      Remove them or ask them to set their address first.
                    </p>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={
                    isAdminView
                      ? "Search by name or email..."
                      : "Search by name..."
                  }
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg overflow-hidden divide-y">
                {usersLoading ? (
                  <div className="py-10 flex justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {isAdminView
                      ? "No users found"
                      : bounty.teamId
                        ? "No community members found"
                        : "This bounty isn't linked to a team"}
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const selected = selectedUserIds.includes(user.id);
                    const addressOk = hasAddress(user);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selected
                            ? "bg-primary/8 hover:bg-primary/12"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Avatar className="h-9 w-9 flex-shrink-0 border">
                          <AvatarImage
                            src={user.avatar || "/placeholder-user.jpg"}
                          />
                          <AvatarFallback className="text-xs font-semibold">
                            {displayName(user)[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayName(user)}
                          </p>
                          {isAdminView && user.email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          )}
                          {chain === "MAIN" ? (
                            addressOk ? (
                              <span className="text-green-600 flex items-center gap-0.5 shrink-0 text-xs">
                                <CheckCircle2 className="h-3 w-3" /> UA set
                              </span>
                            ) : (
                              <span className="text-red-600 flex items-center gap-0.5 shrink-0 text-xs">
                                <AlertTriangle className="h-3 w-3" /> No UA
                              </span>
                            )
                          ) : addressOk ? (
                            <span className="text-blue-600 flex items-center gap-0.5 shrink-0 text-xs">
                              <CheckCircle2 className="h-3 w-3" /> TA set
                            </span>
                          ) : (
                            <span className="text-yellow-600 flex items-center gap-0.5 shrink-0 text-xs">
                              <AlertTriangle className="h-3 w-3" /> No TA
                            </span>
                          )}
                        </div>
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            selected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedUserIds.length === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  No assignees selected — bounty will be open to applications
                </p>
              )}
            </div>
          )}

          {activeSection === "activity" && (
            <div className="space-y-1">
              {activityLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activity.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No activity recorded yet
                </p>
              ) : (
                activity.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 py-2.5 border-b last:border-0"
                  >
                    <Avatar className="h-7 w-7 border shrink-0">
                      <AvatarImage
                        src={a.actor?.avatar || "/placeholder-user.jpg"}
                      />
                      <AvatarFallback className="text-[10px]">
                        {a.actor ? displayName(a.actor as any)[0] : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">
                          {a.actor
                            ? displayName(a.actor as any)
                            : "Deleted user"}
                        </span>{" "}
                        {describeActivity(a, bounty)}
                      </p>
                      {a.meta?.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          “{a.meta.notes}”
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeSection === "chat" && showChat && (
            <BountyChat
              bountyId={bounty.id}
              active={open}
              currentUserId={currentUser.id}
              closed={bounty.status === "DONE"}
            />
          )}
        </div>

        {/* Footer: only where there is something to save */}
        {showFooter && (
          <div className="px-6 py-4 border-t flex flex-col gap-3 shrink-0 bg-muted/20">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={notifyUsers}
                onChange={(e) => setNotifyUsers(e.target.checked)}
              />
              Notify assignees about this update
            </label>
            <div className="grid grid-cols-1 imd:flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {activeSection === "assignees"
                  ? `${selectedUserIds.length} assignee${selectedUserIds.length !== 1 ? "s" : ""} selected`
                  : `Last updated: ${
                      bounty.updatedAt || bounty.dateCreated
                        ? new Date(
                            (bounty.updatedAt || bounty.dateCreated) as string,
                          ).toLocaleDateString()
                        : "—"
                    }`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || !title.trim() || hasAddressWarning}
                  className="gap-2 min-w-[90px]"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
