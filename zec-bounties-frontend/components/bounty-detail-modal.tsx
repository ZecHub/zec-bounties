"use client";

import { Bounty, WorkSubmission, User, Notice } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Palette,
  Pencil,
  Send,
  Share2,
  X,
} from "lucide-react";
import { RxDiscordLogo } from "react-icons/rx";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { format } from "date-fns";
import Link from "next/link";
import {
  bountyCreatorName,
  bountyCreatorInitial,
  bountyCreatorAvatarSrc,
} from "@/lib/displayName";
import { ProfileLink } from "@/components/profile-link";
import { ZecToUsd } from "./ZecToUsd";

interface BountyDetailModalProps {
  bounty: Bounty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const inputCls =
  "w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";
const inlineEditCls =
  "bg-transparent border-b border-dashed border-primary/50 focus:border-primary focus:outline-none";
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const STATUS_BADGE: Record<string, string> = {
  approved:
    "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
  accepted:
    "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
  rejected:
    "text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20",
  needs_revision:
    "text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20",
  pending:
    "text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20",
};

// Keys match both "Design and Videos" and slugs like "design-and-videos"
const CATEGORY_EMOJI: Record<string, string> = {
  writing: "✍️",
  "design-and-videos": "🎨",
  "web-development": "💻",
};

function categoryEmoji(categoryId?: string) {
  const key = categoryId
    ?.toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");
  return key ? CATEGORY_EMOJI[key] : undefined;
}

// ~4 lines of text-sm / leading-relaxed
const DESC_COLLAPSED_PX = 92;

function Status({ status = "pending" }: { status?: string }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full text-[10px] ${STATUS_BADGE[status] ?? STATUS_BADGE.pending}`}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function renderDescriptionWithLinks(text: string) {
  return text.split(URL_REGEX).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function BountyDetailModal({
  bounty: bountyProp,
  open,
  onOpenChange,
}: BountyDetailModalProps) {
  const {
    currentUser,
    updateBounty,
    applyToBounty,
    getUserApplicationForBounty,
    fetchWorkSubmissions,
    submitWork,
    editSubmission,
    teams,
    favoriteTeamIds,
  } = useBounty();

  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [submissionErrors, setSubmissionErrors] = useState<{
    description?: string;
    deliverableUrl?: string;
  }>({});
  const [submissionErrorSummary, setSubmissionErrorSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editDeliverableUrl, setEditDeliverableUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyOnlyState, setCopyOnlyState] = useState(false);
  const [assigneesExpanded, setAssigneesExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descEl, setDescEl] = useState<HTMLParagraphElement | null>(null);
  const [descFullHeight, setDescFullHeight] = useState(0);

  const [isEditingBounty, setIsEditingBounty] = useState(false);
  const [isSavingBounty, setIsSavingBounty] = useState(false);
  const [bountyOverrides, setBountyOverrides] = useState<Partial<Bounty>>({});
  const [bEditTitle, setBEditTitle] = useState("");
  const [bEditDescription, setBEditDescription] = useState("");
  const [bEditAmount, setBEditAmount] = useState("");
  const [bEditDate, setBEditDate] = useState("");

  const bounty = bountyProp ? { ...bountyProp, ...bountyOverrides } : null;

  // Drop local overrides when a different bounty is opened
  useEffect(() => {
    setBountyOverrides({});
    setIsEditingBounty(false);
    setWorkSubmissions([]);
    setAssigneesExpanded(false);
    setDescExpanded(false);
  }, [bountyProp?.id]);

  // Measure the full description height (and keep it fresh on resize)
  useEffect(() => {
    if (!descEl) return;
    const measure = () => setDescFullHeight(descEl.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(descEl);
    return () => ro.disconnect();
  }, [descEl]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open || !bounty || !currentUser) return;
    const isAssigned =
      bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id;
    if (!isAssigned) return;
    let cancelled = false;
    setSubmissionsLoading(true);
    fetchWorkSubmissions(bounty.id)
      .then((data) => {
        if (!cancelled) setWorkSubmissions(data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!err?.message?.includes("permission")) {
          console.error("Failed to load submissions:", err);
        }
        setWorkSubmissions([]);
      })
      .finally(() => {
        if (!cancelled) setSubmissionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, bounty?.id, bounty?.status, currentUser?.id]);

  if (!bounty) return null;

  const userApplication = currentUser
    ? getUserApplicationForBounty(bounty.id)
    : null;

  const isAssignedToCurrentUser =
    currentUser &&
    (bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id);

  const isSuggestedTask = bounty.createdByUser?.role === "HUNTER";

  // Matches both "Design and Videos" and a slug like "design-and-videos"
  const isDesignCategory =
    bounty.categoryId?.toLowerCase().replace(/[^a-z]+/g, "-") ===
    "design-and-videos";

  const canViewPrivate =
    !bounty.isPrivate ||
    currentUser?.role === "ADMIN" ||
    bounty.createdBy === currentUser?.id ||
    (bounty.teamId != null &&
      (teams.some((t) => t.id === bounty.teamId) ||
        favoriteTeamIds.has(bounty.teamId)));

  const isMissingUAForMainnet =
    bounty.chain === "MAIN" && !currentUser?.UA_address;

  const userWorkSubmission = currentUser
    ? (workSubmissions.find((s) => s.submittedBy === currentUser.id) ?? null)
    : null;
  const hasCurrentUserSubmitted = !!userWorkSubmission;

  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const submittedAtMs = userWorkSubmission?.submittedAt
    ? new Date(userWorkSubmission.submittedAt).getTime()
    : null;
  const editMsRemaining = submittedAtMs
    ? EDIT_WINDOW_MS - (now - submittedAtMs)
    : 0;

  const isNeedsRevision = userWorkSubmission?.status === "needs_revision";

  const canEditSubmission =
    hasCurrentUserSubmitted &&
    (isNeedsRevision ||
      (userWorkSubmission?.status === "pending" && editMsRemaining > 0));

  const bountyEditMsRemaining =
    EDIT_WINDOW_MS - (now - new Date(bounty.dateCreated).getTime());
  const canEditBounty =
    currentUser?.role === "HUNTER" &&
    bounty.createdBy === currentUser.id &&
    bountyEditMsRemaining > 0;

  const startBountyEdit = () => {
    setBEditTitle(bounty.title);
    setBEditDescription(bounty.description);
    setBEditAmount(String(bounty.bountyAmount));
    setBEditDate(format(new Date(bounty.timeToComplete), "yyyy-MM-dd"));
    setIsEditingBounty(true);
  };

  const cancelBountyEdit = () => setIsEditingBounty(false);

  // Optimistic: apply immediately, roll back if the request fails.
  const handleSaveBountyEdit = async () => {
    const amount = parseFloat(bEditAmount);
    if (
      !bEditTitle.trim() ||
      !bEditDescription.trim() ||
      !bEditDate ||
      !(amount > 0)
    ) {
      toast.error("Title, description, date and a valid reward are required");
      return;
    }
    const previous: Partial<Bounty> = {
      title: bounty.title,
      description: bounty.description,
      bountyAmount: bounty.bountyAmount,
      timeToComplete: bounty.timeToComplete,
    };
    const next: Partial<Bounty> = {
      title: bEditTitle.trim(),
      description: bEditDescription.trim(),
      bountyAmount: amount,
      timeToComplete: new Date(bEditDate),
    };
    setBountyOverrides((prev) => ({ ...prev, ...next }));
    setIsEditingBounty(false);
    setIsSavingBounty(true);
    try {
      await updateBounty(bounty.id, {
        title: next.title,
        description: next.description,
        bountyAmount: next.bountyAmount,
        timeToComplete: new Date(bEditDate),
      });
      toast.success("Bounty updated");
    } catch (error) {
      console.error("Failed to update bounty:", error);
      setBountyOverrides((prev) => ({ ...prev, ...previous }));
      toast.error("Failed to update bounty");
    } finally {
      setIsSavingBounty(false);
    }
  };

  const startEdit = () => {
    setEditDescription(userWorkSubmission?.description ?? "");
    setEditDeliverableUrl(userWorkSubmission?.deliverableUrl ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!userWorkSubmission || !editDescription.trim()) return;
    setIsSavingEdit(true);
    try {
      const updated = await editSubmission(userWorkSubmission.id, {
        description: editDescription,
        deliverableUrl: editDeliverableUrl,
      });
      setWorkSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setIsEditing(false);
      toast.success("Submission updated");
    } catch (error) {
      console.error("Failed to edit submission:", error);
      toast.error("Failed to update submission");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Native share sheet where available, otherwise copy.
  const handleCopyLink = async () => {
    const url = `${window.location.origin}/bounty/${bounty.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyOnlyState(true);
      toast.success("Link copied");
      setTimeout(() => setCopyOnlyState(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/bounty/${bounty.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: bounty.title,
          text: `Check out this bounty: ${bounty.title}`,
          url,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // fall through to clipboard on other errors
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast.success("Link copied");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const canSubmitWork =
    isAssignedToCurrentUser &&
    !hasCurrentUserSubmitted &&
    !submissionsLoading &&
    bounty.status !== "TO_DO" &&
    bounty.status !== "DONE" &&
    bounty.status !== "CANCELLED";

  const canApply =
    currentUser &&
    canViewPrivate &&
    bounty.createdBy !== currentUser.id &&
    !userApplication &&
    !isAssignedToCurrentUser &&
    !isMissingUAForMainnet &&
    !isSuggestedTask;

  const hasApplied = !!userApplication;

  const notice: Notice | null = (() => {
    if (isAssignedToCurrentUser && bounty.status === "TO_DO") {
      return {
        type: "warning",
        title: "Bounty not yet approved",
        message:
          "This bounty is pending approval. You'll be able to submit your work once an admin activates it.",
      };
    }
    if (!isAssignedToCurrentUser && !hasApplied) {
      if (!currentUser) {
        return {
          type: "info",
          title: "Login required",
          message: "Please log in to apply for this bounty.",
        };
      }
      if (bounty.createdBy === currentUser.id) {
        return {
          type: "info",
          title: "Your bounty",
          message: "You cannot apply to your own bounty.",
        };
      }
      if (!canViewPrivate) {
        return {
          type: "info",
          title: "Private bounty",
          message:
            "This bounty belongs to a private team you're not a member of.",
        };
      }
      if (isSuggestedTask) {
        return {
          type: "info",
          title: "Suggested task",
          message: "This is a suggested task and isn't open to applications.",
        };
      }
      if (bounty.chain === "MAIN" && !currentUser.UA_address) {
        return {
          type: "warning",
          title: "Unified Address required",
          message:
            "This bounty pays out on mainnet. You need a Unified Address (UA) set on your profile before you can apply.",
          action: { label: "Set your UA", href: "/profile" },
        };
      }
      if (bounty.status === "DONE" || bounty.status === "CANCELLED") {
        return {
          type: "info",
          title: "Bounty closed",
          message: "This bounty is no longer accepting applications.",
        };
      }
    }
    return null;
  })();

  const handleApply = async () => {
    if (!applicationMessage.trim()) {
      setApplicationError("Enter an application message.");
      requestAnimationFrame(() => {
        document.getElementById("application-message")?.focus();
      });
      return;
    }

    setApplicationError("");
    setIsApplying(true);
    try {
      await applyToBounty(bounty.id, applicationMessage);
      setApplicationMessage("");
      toast.success("Application submitted");
    } catch (error) {
      console.error("Failed to apply:", error);
      toast.error("Failed to submit application");
    } finally {
      setIsApplying(false);
    }
  };

  const handleSubmitWork = async () => {
    const nextErrors: { description?: string; deliverableUrl?: string } = {};

    if (!submissionDescription.trim()) {
      nextErrors.description = "Describe the work you completed.";
    }
    if (!deliverableUrl.trim()) {
      nextErrors.deliverableUrl = "Enter a deliverable URL.";
    }

    setSubmissionErrors(nextErrors);

    const firstInvalid = nextErrors.description
      ? "submission-description"
      : nextErrors.deliverableUrl
        ? "deliverable-url"
        : null;

    if (firstInvalid) {
      setSubmissionErrorSummary(
        "Please correct the highlighted work submission fields.",
      );
      requestAnimationFrame(() => {
        document.getElementById(firstInvalid)?.focus();
      });
      return;
    }

    setSubmissionErrorSummary("");
    setIsSubmitting(true);
    try {
      await submitWork(bounty.id, {
        description: submissionDescription,
        deliverableUrl,
      });
      const optimistic: WorkSubmission = {
        id: `optimistic-${Date.now()}`,
        bountyId: bounty.id,
        submittedBy: currentUser!.id,
        description: submissionDescription,
        deliverableUrl,
        status: "pending",
        submittedAt: new Date(),
        submitterUser: currentUser as User,
      };
      setWorkSubmissions((prev) => [optimistic, ...prev]);
      setSubmissionDescription("");
      setDeliverableUrl("");
      toast.success("Work submitted");
    } catch (error) {
      console.error("Failed to submit work:", error);
      toast.error("Failed to submit work");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setApplicationMessage("");
    setSubmissionDescription("");
    setDeliverableUrl("");
    // Don't clear workSubmissions / overrides / edit mode here: the dialog is
    // still animating out, and resetting them re-renders the "Submit your
    // work" form (and reverts edits) for a few frames.
  };

  const noticeAccent =
    notice?.type === "warning"
      ? "border-amber-400"
      : notice?.type === "error"
        ? "border-red-400"
        : "border-border";

  // Current user first, then everyone else in original order
  const descIsLong = descFullHeight > DESC_COLLAPSED_PX + 8;
  const descMaxHeight =
    descIsLong && !descExpanded
      ? DESC_COLLAPSED_PX
      : descFullHeight || undefined;

  const assignees = [...(bounty.assignees ?? [])].sort(
    (x, y) =>
      Number(y.userId === currentUser?.id) -
      Number(x.userId === currentUser?.id),
  );
  const [firstAssignee, ...restAssignees] = assignees;

  const renderAssignee = (a: (typeof assignees)[number]) => {
    const submitted = workSubmissions.some((s) => s.submittedBy === a.userId);
    return (
      <div
        key={a.userId}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-2"
      >
        <Avatar className="h-6 w-6 border border-primary/20">
          <AvatarImage src={a.user?.avatar || "/placeholder-user.jpg"} />
          <AvatarFallback className="text-[10px]">
            {a.user?.name?.[0] || "?"}
          </AvatarFallback>
        </Avatar>
        <ProfileLink user={a.user}>
          <p className="truncate text-xs font-semibold text-primary">
            {a.user?.nickname || a.user?.name || "Unknown"}
          </p>
        </ProfileLink>
        {a.userId === currentUser?.id && (
          <span className="text-[10px] text-muted-foreground">You</span>
        )}
        {submitted && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-2.5 w-2.5" /> Submitted
          </span>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] imd:max-h-[90vh] overflow-y-auto p-4 sam:p-5 md:p-6 gap-0">
        {/* ── Header ── */}
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="secondary"
              className="text-[11px] font-normal capitalize"
            >
              {categoryEmoji(bounty.categoryId) && (
                <span aria-hidden="true" className="mr-1">
                  {categoryEmoji(bounty.categoryId)}
                </span>
              )}
              {bounty.categoryId}
            </Badge>
            <Badge
              variant="outline"
              className="text-[11px] font-normal capitalize"
            >
              {String(bounty.difficulty).toLowerCase()}
            </Badge>
            {isAssignedToCurrentUser && (
              <Badge
                variant="outline"
                className="text-[11px] font-normal text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800"
              >
                Assigned to you
              </Badge>
            )}
            {isSuggestedTask && (
              <Badge
                variant="outline"
                className="text-[11px] font-normal text-orange-600 border-sky-200 dark:text-sky-400 dark:border-sky-800"
              >
                Suggested task
              </Badge>
            )}
          </div>

          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="flex-1 text-base sam:text-lg font-semibold leading-snug">
              {isEditingBounty ? (
                <input
                  value={bEditTitle}
                  onChange={(e) => setBEditTitle(e.target.value)}
                  placeholder="Title"
                  autoFocus
                  className={`w-full pb-0.5 ${inlineEditCls}`}
                />
              ) : (
                bounty.title
              )}
            </DialogTitle>
            <div className="flex shrink-0 items-center -mr-1.5">
              {isEditingBounty ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={cancelBountyEdit}
                    aria-label="Cancel editing"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-emerald-500 hover:text-emerald-600"
                    onClick={handleSaveBountyEdit}
                    aria-label="Save changes"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  {canEditBounty && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={startBountyEdit}
                      disabled={isSavingBounty}
                      aria-label="Edit bounty"
                      title={`${Math.ceil(bountyEditMsRemaining / 60000)} min left to edit`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={handleCopyLink}
                    aria-label="Copy link"
                    title="Copy link"
                  >
                    {copyOnlyState ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={handleShare}
                    aria-label="Share bounty"
                    title="Share"
                  >
                    {linkCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          <DialogDescription asChild>
            <div className="text-xs text-muted-foreground">
              {isEditingBounty ? (
                <label className="flex items-center gap-2">
                  Due
                  <input
                    type="date"
                    value={bEditDate}
                    onChange={(e) => setBEditDate(e.target.value)}
                    className={inlineEditCls}
                  />
                </label>
              ) : (
                <span>
                  Due {format(new Date(bounty.timeToComplete), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* ── Reward + issuer ── */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <div className="flex items-baseline gap-1.5 text-xl sam:text-2xl font-bold tabular-nums">
              {isEditingBounty ? (
                <>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={bEditAmount}
                    onChange={(e) => setBEditAmount(e.target.value)}
                    className={`w-24 ${inlineEditCls}`}
                    aria-label="Reward in ZEC"
                  />
                  <span>ZEC</span>
                </>
              ) : (
                <span>{bounty.bountyAmount} ZEC</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <ZecToUsd
                zecAmount={
                  isEditingBounty
                    ? parseFloat(bEditAmount) || 0
                    : bounty.bountyAmount
                }
                showZec={false}
              />
            </p>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6 border">
              <AvatarImage
                src={bountyCreatorAvatarSrc(bounty) || "/placeholder-user.jpg"}
              />
              <AvatarFallback className="text-[10px]">
                {bountyCreatorInitial(bounty)}
              </AvatarFallback>
            </Avatar>
            <ProfileLink user={bounty.team ? null : bounty.createdByUser}>
              <p className="truncate text-sm font-medium">
                {bountyCreatorName(bounty)}
              </p>
            </ProfileLink>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="mt-4">
          {isEditingBounty ? (
            <Textarea
              value={bEditDescription}
              onChange={(e) => setBEditDescription(e.target.value)}
              className="min-h-[120px] text-sm border-dashed border-primary/50"
              aria-label="Description"
            />
          ) : (
            <>
              <div className="relative">
                <div
                  className="overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
                  style={{ maxHeight: descMaxHeight }}
                >
                  <p
                    ref={setDescEl}
                    className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words"
                  >
                    {renderDescriptionWithLinks(bounty.description)}
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-300 ${
                    descIsLong && !descExpanded ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
              {descIsLong && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  aria-expanded={descExpanded}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                >
                  {descExpanded ? "Show less" : "Show more"}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-300 ${descExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </>
          )}
        </div>

        {isDesignCategory && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2.5">
            <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              Follow the{" "}
              <a
                href="https://zechub.wiki/visual-identity"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline hover:no-underline"
              >
                ZecHub brand guidelines
              </a>{" "}
              for design deliverables.
            </p>
          </div>
        )}

        {/* ── Assignees ── */}
        {firstAssignee && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-muted-foreground">Assigned to</p>
            <div className="flex items-center gap-1.5">
              {renderAssignee(firstAssignee)}
              {restAssignees.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAssigneesExpanded((v) => !v)}
                  aria-expanded={assigneesExpanded}
                  aria-controls="more-assignees"
                  aria-label={`${assigneesExpanded ? "Hide" : "Show"} ${restAssignees.length} more assignee${restAssignees.length > 1 ? "s" : ""}`}
                  className="flex h-[42px] shrink-0 items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  +{restAssignees.length}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-300 ${assigneesExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>

            {restAssignees.length > 0 && (
              <div
                id="more-assignees"
                className={`grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${
                  assigneesExpanded
                    ? "visible grid-rows-[1fr] opacity-100"
                    : "invisible grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1.5">
                    {restAssignees.map((a) => (
                      <div key={a.userId} className="flex">
                        {renderAssignee(a)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Contextual action: only the one relevant right now ── */}

        {/* Submit work */}
        {canSubmitWork && (
          <section className="mt-5 space-y-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
            <div>
              <h3 className="text-sm font-medium">Submit your work</h3>
              <p className="text-xs text-green-700 dark:text-green-300">
                You're assigned to this bounty.
              </p>
            </div>
            {submissionErrorSummary && (
              <p
                role="alert"
                aria-live="assertive"
                className="text-xs text-destructive"
              >
                {submissionErrorSummary}
              </p>
            )}
            <div className="space-y-1.5">
              <Label
                htmlFor="submission-description"
                className="text-xs text-muted-foreground"
              >
                What did you deliver?
              </Label>
              <Textarea
                id="submission-description"
                placeholder="Describe your work and any important notes"
                value={submissionDescription}
                onChange={(e) => {
                  setSubmissionDescription(e.target.value);
                  setSubmissionErrors((prev) => ({
                    ...prev,
                    description: undefined,
                  }));
                  setSubmissionErrorSummary("");
                }}
                className="min-h-[80px] text-sm"
                aria-invalid={Boolean(submissionErrors.description)}
                aria-describedby={
                  submissionErrors.description
                    ? "submission-description-error"
                    : undefined
                }
              />
              {submissionErrors.description && (
                <p
                  id="submission-description-error"
                  className="text-xs text-destructive"
                >
                  {submissionErrors.description}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="deliverable-url"
                className="text-xs text-muted-foreground"
              >
                Link to your work
              </Label>
              <input
                id="deliverable-url"
                type="url"
                placeholder="https://github.com/username/repo"
                value={deliverableUrl}
                onChange={(e) => {
                  setDeliverableUrl(e.target.value);
                  setSubmissionErrors((prev) => ({
                    ...prev,
                    deliverableUrl: undefined,
                  }));
                  setSubmissionErrorSummary("");
                }}
                className={inputCls}
                autoComplete="off"
                aria-invalid={Boolean(submissionErrors.deliverableUrl)}
                aria-describedby={
                  submissionErrors.deliverableUrl
                    ? "deliverable-url-help deliverable-url-error"
                    : "deliverable-url-help"
                }
              />
              <p
                id="deliverable-url-help"
                className="text-xs text-muted-foreground"
              >
                Share a link where your completed work can be reviewed.
              </p>
              {submissionErrors.deliverableUrl && (
                <p
                  id="deliverable-url-error"
                  className="text-xs text-destructive"
                >
                  {submissionErrors.deliverableUrl}
                </p>
              )}
            </div>
            <Button
              onClick={handleSubmitWork}
              disabled={isSubmitting}
              size="sm"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Submit work
                </>
              )}
            </Button>
          </section>
        )}

        {/* Already submitted */}
        {isAssignedToCurrentUser && hasCurrentUserSubmitted && (
          <section className="mt-5 space-y-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-green-800 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                Work submitted
              </span>
              <Status status={userWorkSubmission?.status ?? "pending"} />
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="min-h-[80px] text-sm bg-white dark:bg-green-950/30"
                  aria-label="Work description"
                />
                <input
                  type="url"
                  value={editDeliverableUrl}
                  onChange={(e) => setEditDeliverableUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  className={inputCls}
                  aria-label="Deliverable URL"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={!editDescription.trim() || isSavingEdit}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSavingEdit ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={isSavingEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="rounded border bg-white dark:bg-green-950/30 p-2.5 text-xs leading-relaxed text-green-700 dark:text-green-300 whitespace-pre-wrap break-words">
                  {userWorkSubmission?.description}
                </p>
                {userWorkSubmission?.deliverableUrl && (
                  <a
                    href={userWorkSubmission.deliverableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {userWorkSubmission.deliverableUrl}
                  </a>
                )}
                {isNeedsRevision && userWorkSubmission?.reviewNotes && (
                  <div className="rounded border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-2.5">
                    <p className="mb-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                      Revision notes
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      {userWorkSubmission.reviewNotes}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-green-600 dark:text-green-400">
                  <span>
                    {canEditSubmission
                      ? isNeedsRevision
                        ? "Edit and resubmit"
                        : `Editable for ${Math.max(1, Math.ceil(editMsRemaining / 60000))} more min`
                      : userWorkSubmission?.submittedAt
                        ? `Submitted ${format(new Date(userWorkSubmission.submittedAt), "MMM d, p")}`
                        : ""}
                  </span>
                  {canEditSubmission && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={startEdit}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Apply */}
        {canApply && (
          <section className="mt-5 space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Apply</h3>
            <div className="space-y-1.5">
              <Label htmlFor="application-message" className="sr-only">
                Application message
              </Label>
              <Textarea
                id="application-message"
                placeholder="Why are you the right person for this bounty?"
                value={applicationMessage}
                onChange={(e) => {
                  setApplicationMessage(e.target.value);
                  setApplicationError("");
                }}
                className="min-h-[90px] text-sm"
                aria-invalid={Boolean(applicationError)}
                aria-describedby={
                  applicationError ? "application-message-error" : undefined
                }
              />
              {applicationError && (
                <p
                  id="application-message-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {applicationError}
                </p>
              )}
            </div>

            {!currentUser?.discordUsername && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <RxDiscordLogo className="h-3 w-3 shrink-0" />
                <span>
                  Connect Discord on your{" "}
                  <Link
                    href="/profile"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    profile
                  </Link>{" "}
                  to get notified if you're assigned.
                </span>
              </p>
            )}

            <Button
              size="sm"
              className="w-full"
              onClick={handleApply}
              disabled={isApplying}
            >
              {isApplying ? "Applying…" : "Submit application"}
              {!isApplying && <CheckCircle2 className="ml-1.5 h-3.5 w-3.5" />}
            </Button>
          </section>
        )}

        {/* Notice */}
        {notice && (
          <section
            className={`mt-5 flex items-start gap-2.5 rounded-lg border p-3 ${
              notice.type === "warning"
                ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                : notice.type === "error"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-muted/50 border-border"
            }`}
          >
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                notice.type === "warning"
                  ? "text-yellow-600 dark:text-yellow-400"
                  : notice.type === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            />
            <div className="space-y-1">
              <p
                className={`text-xs font-semibold ${
                  notice.type === "warning"
                    ? "text-yellow-800 dark:text-yellow-200"
                    : notice.type === "error"
                      ? "text-red-800 dark:text-red-200"
                      : "text-foreground"
                }`}
              >
                {notice.title}
              </p>
              <p
                className={`text-xs ${
                  notice.type === "warning"
                    ? "text-yellow-700 dark:text-yellow-300"
                    : notice.type === "error"
                      ? "text-red-700 dark:text-red-300"
                      : "text-muted-foreground"
                }`}
              >
                {notice.message}
              </p>
              {notice.action && (
                <Link href={notice.action.href}>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`mt-1 h-7 text-xs ${
                      notice.type === "warning"
                        ? "border-yellow-400 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                        : ""
                    }`}
                  >
                    {notice.action.label}
                  </Button>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Application status */}
        {hasApplied && (
          <section className="mt-5 space-y-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Your application
              </span>
              <Status status={userApplication?.status || "pending"} />
            </div>
            <p className="rounded border bg-white dark:bg-blue-950/30 p-2.5 text-xs leading-relaxed text-blue-700 dark:text-blue-300 whitespace-pre-wrap break-words">
              {userApplication?.message}
            </p>
            <p
              className={`text-xs ${
                userApplication?.status === "accepted"
                  ? "text-green-700 dark:text-green-300"
                  : userApplication?.status === "rejected"
                    ? "text-red-700 dark:text-red-300"
                    : "text-blue-700 dark:text-blue-300"
              }`}
            >
              {userApplication?.status === "accepted"
                ? "Congratulations! Your application has been accepted."
                : userApplication?.status === "rejected"
                  ? "Your application was not selected for this bounty."
                  : userApplication?.appliedAt
                    ? `Under review · applied ${format(new Date(userApplication.appliedAt), "MMM d")}`
                    : "Under review"}
            </p>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
