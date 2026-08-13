"use client";

import { Bounty, WorkSubmission, User } from "@/lib/types";
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
  Clock,
  Users,
  Shield,
  MessageSquare,
  CheckCircle2,
  Send,
  AlertTriangle,
  ExternalLink,
  Share2,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { format } from "date-fns";
import Link from "next/link";
import { Notice } from "@/lib/types";
import {
  bountyCreatorName,
  bountyCreatorInitial,
  bountyCreatorAvatarSrc,
} from "@/lib/displayName";

interface BountyDetailModalProps {
  bounty: Bounty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BountyDetailModal({
  bounty,
  open,
  onOpenChange,
}: BountyDetailModalProps) {
  const {
    currentUser,
    applyToBounty,
    getUserApplicationForBounty,
    fetchWorkSubmissions,
    submitWork,
    editSubmission,
  } = useBounty();

  const [applicationMessage, setApplicationMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editDeliverableUrl, setEditDeliverableUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const URL_REGEX = /(https?:\/\/[^\s]+)/g;

  function renderDescriptionWithLinks(text: string) {
    const parts = text.split(URL_REGEX);
    return parts.map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 dark:text-blue-400 hover:underline break-all"
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  useEffect(() => {
    if (!open || !bounty || !currentUser) return;
    const isAssigned =
      bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id;
    if (!isAssigned) return;
    setSubmissionsLoading(true);
    fetchWorkSubmissions(bounty.id)
      .then((data) => setWorkSubmissions(data ?? []))
      .catch((err) => {
        if (!err?.message?.includes("permission")) {
          console.error("Failed to load submissions:", err);
        }
        setWorkSubmissions([]);
      })
      .finally(() => setSubmissionsLoading(false));
  }, [open, bounty?.id, currentUser?.id]);

  if (!bounty) return null;

  const userApplication = currentUser
    ? getUserApplicationForBounty(bounty.id)
    : null;

  const isAssignedToCurrentUser =
    currentUser &&
    (bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id);

  const isSuggestedTask = bounty.createdByUser?.role === "CLIENT";

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
  const canEditSubmission =
    hasCurrentUserSubmitted &&
    userWorkSubmission?.status === "pending" &&
    editMsRemaining > 0;

  const startEdit = () => {
    setEditDescription(userWorkSubmission?.description ?? "");
    setEditDeliverableUrl(userWorkSubmission?.deliverableUrl ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!userWorkSubmission || !editDescription.trim()) return;
    setIsSavingEdit(true);
    try {
      await editSubmission(userWorkSubmission.id, {
        description: editDescription,
        deliverableUrl: editDeliverableUrl,
      });
      setIsEditing(false);
      toast.success("Submission updated!");
    } catch (error) {
      console.error("Failed to edit submission:", error);
      toast.error("Failed to update submission");
    } finally {
      setIsSavingEdit(false);
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
      toast.success("Link copied to clipboard");
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
          action: { label: "Click here to set your UA", href: "/profile" },
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
    if (!applicationMessage.trim()) return;
    setIsApplying(true);
    try {
      await applyToBounty(bounty.id, applicationMessage);
      setApplicationMessage("");
      toast.success("Application submitted successfully!");
    } catch (error) {
      console.error("Failed to apply:", error);
      toast.error("Failed to submit application");
    } finally {
      setIsApplying(false);
    }
  };

  const handleSubmitWork = async () => {
    if (!submissionDescription.trim() || !deliverableUrl.trim()) return;
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
      toast.success("Work submitted successfully!");
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
    setWorkSubmissions([]);
  };

  const statusBadgeClass = (status?: string) => {
    switch (status) {
      case "approved":
        return "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20";
      case "rejected":
        return "text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20";
      case "needs_revision":
        return "text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20";
      case "accepted":
        return "text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20";
      default:
        return "text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Badge
              variant="secondary"
              className="uppercase tracking-wider text-[10px]"
            >
              {bounty.categoryId}
            </Badge>
            <Badge
              variant="outline"
              className="uppercase tracking-wider text-[10px]"
            >
              {bounty.difficulty}
            </Badge>
            {isAssignedToCurrentUser && (
              <Badge
                variant="outline"
                className="text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800 text-[10px]"
              >
                Assigned to You
              </Badge>
            )}
            {isSuggestedTask && (
              <Badge
                variant="outline"
                className="text-orange-600 border-sky-200 dark:text-sky-400 dark:border-sky-800 text-[10px]"
              >
                Suggested Task
              </Badge>
            )}
          </div>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-lg font-semibold leading-snug flex-1">
              {bounty.title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleShare}
              title="Share this bounty"
            >
              {linkCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <DialogDescription className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" />
              {format(bounty.dateCreated, "MMM dd, yyyy")}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          {/* ── Left column ── */}
          <div className="md:col-span-2 space-y-4">
            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Description
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap">
                {renderDescriptionWithLinks(bounty.description)}
              </p>
            </div>

            {/* Submit Work */}
            {canSubmitWork && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Submit Your Work</h3>
                <div className="space-y-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-xs text-green-700 dark:text-green-300">
                    You are assigned to this bounty. Ready to submit your
                    completed work?
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="submission-description" className="text-xs">
                      Work Description <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="submission-description"
                      placeholder="Describe what you delivered and any important notes..."
                      value={submissionDescription}
                      onChange={(e) => setSubmissionDescription(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deliverable-url" className="text-xs">
                      Deliverable URL <span className="text-red-500">*</span>
                    </Label>
                    <input
                      id="deliverable-url"
                      type="url"
                      placeholder="https://github.com/username/repo"
                      value={deliverableUrl}
                      onChange={(e) => setDeliverableUrl(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-md text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Link to your completed work (GitHub, Drive, deployed app,
                      etc.)
                    </p>
                  </div>
                  <Button
                    onClick={handleSubmitWork}
                    disabled={
                      !submissionDescription.trim() ||
                      !deliverableUrl.trim() ||
                      isSubmitting
                    }
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Submit Work
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Already submitted */}
            {isAssignedToCurrentUser && hasCurrentUserSubmitted && (
              <div className="border-t pt-4">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                        Work Submitted
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] rounded-full ${statusBadgeClass(userWorkSubmission?.status)}`}
                    >
                      {userWorkSubmission?.status ?? "pending"}
                    </Badge>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="min-h-[80px] text-sm bg-white dark:bg-green-950/30"
                      />
                      <input
                        type="url"
                        value={editDeliverableUrl}
                        onChange={(e) => setEditDeliverableUrl(e.target.value)}
                        placeholder="https://github.com/username/repo"
                        className="w-full px-3 py-1.5 border rounded-md text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={!editDescription.trim() || isSavingEdit}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {isSavingEdit ? "Saving..." : "Save Changes"}
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
                      <div className="p-2.5 bg-white dark:bg-green-950/30 border rounded text-xs text-green-700 dark:text-green-300 leading-relaxed">
                        {userWorkSubmission?.description}
                      </div>

                      {userWorkSubmission?.deliverableUrl && (
                        <a
                          href={userWorkSubmission.deliverableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          {userWorkSubmission.deliverableUrl}
                        </a>
                      )}

                      {canEditSubmission && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-green-600 dark:text-green-400">
                            You can edit for{" "}
                            {Math.ceil(editMsRemaining / 60000)} more min
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={startEdit}
                          >
                            Edit Submission
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  <p className="text-[11px] text-green-600 dark:text-green-400">
                    Submitted{" "}
                    {userWorkSubmission?.submittedAt
                      ? format(
                          new Date(userWorkSubmission.submittedAt),
                          "MMM d, yyyy 'at' p",
                        )
                      : "—"}
                  </p>

                  {userWorkSubmission?.status === "needs_revision" &&
                    userWorkSubmission.reviewNotes && (
                      <div className="p-2.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded">
                        <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">
                          Revision Notes
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {userWorkSubmission.reviewNotes}
                        </p>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Apply */}
            {canApply && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">
                  Apply for this Bounty
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="application-message" className="text-xs">
                      Application Message{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="application-message"
                      placeholder="Tell us why you're the right person for this bounty..."
                      value={applicationMessage}
                      onChange={(e) => setApplicationMessage(e.target.value)}
                      className="min-h-[90px] text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={handleApply}
                      disabled={!applicationMessage.trim() || isApplying}
                    >
                      {isApplying ? "Applying..." : "Submit Application"}
                      {!isApplying && (
                        <CheckCircle2 className="ml-1.5 h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Notice */}
            {notice && (
              <div className="border-t pt-4">
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                    notice.type === "warning"
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                      : notice.type === "error"
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        : "bg-muted/50 border-border"
                  }`}
                >
                  <AlertTriangle
                    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
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
                </div>
              </div>
            )}

            {/* Application status */}
            {hasApplied && (
              <div className="border-t pt-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Your Application
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] rounded-full ${statusBadgeClass(userApplication?.status)}`}
                    >
                      {userApplication?.status || "pending"}
                    </Badge>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-blue-950/30 border rounded text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    {userApplication?.message}
                  </div>

                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    Applied{" "}
                    {userApplication?.appliedAt
                      ? format(
                          new Date(userApplication.appliedAt),
                          "MMM d, yyyy 'at' p",
                        )
                      : "—"}
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
                        : "Your application is being reviewed by the bounty creator."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">
            {/* Reward */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                Reward
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">
                  {bounty.bountyAmount}
                </span>
                <span className="text-xs text-muted-foreground">ZEC</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Paid upon successful review
              </p>
            </div>

            {/* Issuer */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Issuer
              </p>
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8 border">
                  <AvatarImage
                    src={
                      bountyCreatorAvatarSrc(bounty) || "/placeholder-user.jpg"
                    }
                  />
                  <AvatarFallback className="text-xs">
                    {bountyCreatorInitial(bounty)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-medium">
                  {bountyCreatorName(bounty)}
                </p>
              </div>
            </div>

            {/* Assignees */}
            {bounty.assignees && bounty.assignees.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Assigned To
                </p>
                <div className="space-y-1.5">
                  {bounty.assignees.map((a) => {
                    const hasSubmitted = workSubmissions.some(
                      (s) => s.submittedBy === a.userId,
                    );
                    return (
                      <div
                        key={a.userId}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-primary/20 bg-primary/5"
                      >
                        <Avatar className="h-7 w-7 border border-primary/20">
                          <AvatarImage
                            src={a.user?.avatar || "/placeholder-user.jpg"}
                          />
                          <AvatarFallback className="text-[10px]">
                            {a.user?.name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-primary truncate">
                            {a.user?.nickname || a.user?.name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {a.userId === currentUser?.id && (
                              <span className="text-[10px] text-muted-foreground">
                                You
                              </span>
                            )}
                            {hasSubmitted && (
                              <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-2.5 w-2.5" />{" "}
                                Submitted
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
