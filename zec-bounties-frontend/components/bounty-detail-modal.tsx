"use client";

import { Bounty, WorkSubmission } from "@/lib/types";
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
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { format } from "date-fns";

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
  } = useBounty();

  const [applicationMessage, setApplicationMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  // Work submission states
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Local work submissions state — fetched when modal opens
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Fetch work submissions whenever the modal opens for an assigned user
  useEffect(() => {
    if (!open || !bounty || !currentUser) return;

    const isAssigned =
      bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id;

    if (!isAssigned) return;

    setSubmissionsLoading(true);
    fetchWorkSubmissions(bounty.id)
      .then((data) => setWorkSubmissions(data ?? []))
      .catch(() => setWorkSubmissions([]))
      .finally(() => setSubmissionsLoading(false));
  }, [open, bounty?.id, currentUser?.id]);

  if (!bounty) return null;

  // Get current user's application for this bounty
  const userApplication = currentUser
    ? getUserApplicationForBounty(bounty.id)
    : null;

  // Check if current user is assigned to this bounty
  const isAssignedToCurrentUser =
    currentUser &&
    (bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id);

  // Find this user's own WorkSubmission (submittedBy === currentUser.id)
  const userWorkSubmission = currentUser
    ? (workSubmissions.find((s) => s.submittedBy === currentUser.id) ?? null)
    : null;
  const hasCurrentUserSubmitted = !!userWorkSubmission;

  // Can submit: assigned, hasn't personally submitted yet, bounty not closed
  const canSubmitWork =
    isAssignedToCurrentUser &&
    !hasCurrentUserSubmitted &&
    !submissionsLoading &&
    bounty.status !== "DONE" &&
    bounty.status !== "CANCELLED";

  // Can apply: logged in, not the creator, not already applied, not already assigned
  const canApply =
    currentUser &&
    bounty.createdBy !== currentUser.id &&
    !userApplication &&
    !isAssignedToCurrentUser;

  const hasApplied = !!userApplication;

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
      setSubmissionDescription("");
      setDeliverableUrl("");
      toast.success("Work submitted successfully!");
      // Re-fetch submissions so the UI immediately reflects the new submission
      const updated = await fetchWorkSubmissions(bounty.id);
      setWorkSubmissions(updated ?? []);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
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
                className="text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800"
              >
                Assigned to You
              </Badge>
            )}
          </div>
          <DialogTitle className="text-2xl font-bold">
            {bounty.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" /> Published on{" "}
              {format(bounty.dateCreated, "MMM dd, yyyy")}
            </span>
            <span className="flex items-center gap-1 text-xs">
              <Users className="h-3 w-3" /> {bounty.applications?.length || 0}{" "}
              Applications
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
          <div className="md:col-span-2 space-y-6">
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Description
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {bounty.description}
              </p>
            </div>

            {/* Work Submission — only shown if assigned and not yet submitted */}
            {canSubmitWork && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Submit Your Work</h3>
                <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    You are assigned to this bounty. Ready to submit your
                    completed work?
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="submission-description">
                      Work Description <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="submission-description"
                      placeholder="Describe the work you've completed, what you delivered, and any important notes..."
                      value={submissionDescription}
                      onChange={(e) => setSubmissionDescription(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deliverable-url">
                      Deliverable URL <span className="text-red-500">*</span>
                    </Label>
                    <input
                      id="deliverable-url"
                      type="url"
                      placeholder="https://github.com/username/repo or https://drive.google.com/..."
                      value={deliverableUrl}
                      onChange={(e) => setDeliverableUrl(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Link to your completed work (GitHub repo, Google Drive,
                      deployed app, etc.)
                    </p>
                  </div>

                  <Button
                    onClick={handleSubmitWork}
                    disabled={
                      !submissionDescription.trim() ||
                      !deliverableUrl.trim() ||
                      isSubmitting
                    }
                    className="bg-green-600 hover:bg-green-700 text-white w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Submit Work
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Already submitted — show this user's WorkSubmission */}
            {isAssignedToCurrentUser && hasCurrentUserSubmitted && (
              <div className="border-t pt-6">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="font-semibold text-green-800 dark:text-green-200">
                        Work Submitted
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        userWorkSubmission?.status === "approved"
                          ? "text-green-600 border-green-200"
                          : userWorkSubmission?.status === "rejected"
                            ? "text-red-600 border-red-200"
                            : userWorkSubmission?.status === "needs_revision"
                              ? "text-orange-600 border-orange-200"
                              : "text-yellow-600 border-yellow-200"
                      }
                    >
                      {userWorkSubmission?.status ?? "pending"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-300 mb-1">
                        <strong>Your submission:</strong>
                      </p>
                      <p className="text-green-600 dark:text-green-400 text-sm bg-white dark:bg-green-950/30 p-3 rounded border">
                        {userWorkSubmission?.description}
                      </p>
                    </div>

                    {userWorkSubmission?.deliverableUrl && (
                      <div>
                        <p className="text-sm text-green-700 dark:text-green-300 mb-1">
                          <strong>Deliverable:</strong>
                        </p>
                        <a
                          href={userWorkSubmission.deliverableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 underline break-all"
                        >
                          {userWorkSubmission.deliverableUrl}
                        </a>
                      </div>
                    )}

                    <div className="text-xs text-green-600 dark:text-green-400">
                      Submitted on:{" "}
                      {userWorkSubmission?.submittedAt
                        ? format(
                            new Date(userWorkSubmission.submittedAt),
                            "PPP 'at' p",
                          )
                        : "Unknown"}
                    </div>

                    {userWorkSubmission?.status === "needs_revision" &&
                      userWorkSubmission.reviewNotes && (
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded">
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-1">
                            Revision Notes:
                          </p>
                          <p className="text-sm text-orange-600 dark:text-orange-400">
                            {userWorkSubmission.reviewNotes}
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* Application Section */}
            {canApply && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Apply for this Bounty
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="application-message">
                      Application Message{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="application-message"
                      placeholder="Tell us why you're the right person for this bounty..."
                      value={applicationMessage}
                      onChange={(e) => setApplicationMessage(e.target.value)}
                      className="min-h-[120px]"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={handleApply}
                      disabled={!applicationMessage.trim() || isApplying}
                    >
                      {isApplying ? "Applying..." : "Submit Application"}
                      {!isApplying && <CheckCircle2 className="ml-2 h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Application status */}
            {hasApplied && (
              <div className="border-t pt-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <CheckCircle2 className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                      <span className="font-semibold text-blue-800 dark:text-blue-200">
                        Your Application
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        userApplication?.status === "accepted"
                          ? "text-green-600 border-green-200"
                          : userApplication?.status === "rejected"
                            ? "text-red-600 border-red-200"
                            : "text-yellow-600 border-yellow-200"
                      }
                    >
                      {userApplication?.status || "pending"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                        <strong>Your message:</strong>
                      </p>
                      <p className="text-blue-600 dark:text-blue-400 text-sm bg-white dark:bg-blue-950/30 p-3 rounded border">
                        {userApplication?.message}
                      </p>
                    </div>

                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      Applied on:{" "}
                      {userApplication?.appliedAt
                        ? format(
                            new Date(userApplication.appliedAt),
                            "PPP 'at' p",
                          )
                        : "Unknown"}
                    </div>

                    {userApplication?.status === "pending" && (
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        Your application is being reviewed by the bounty
                        creator.
                      </p>
                    )}
                    {userApplication?.status === "accepted" && (
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        Congratulations! Your application has been accepted.
                      </p>
                    )}
                    {userApplication?.status === "rejected" && (
                      <p className="text-red-700 dark:text-red-300 text-sm">
                        Your application was not selected for this bounty.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Cannot apply message */}
            {!canApply && !hasApplied && !isAssignedToCurrentUser && (
              <div className="border-t pt-6">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-slate-600 dark:text-slate-400">
                    {!currentUser
                      ? "Please log in to apply for this bounty."
                      : bounty.createdBy === currentUser.id
                        ? "You cannot apply to your own bounty."
                        : ""}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border bg-muted/30 p-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Reward
              </h4>
              <div className="flex items-center gap-2 text-2xl font-bold">
                {bounty.bountyAmount}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ZEC
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Paid upon successful review
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Issuer
              </h4>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border">
                  <AvatarImage
                    src={
                      bounty.createdByUser?.avatar || "/placeholder-user.jpg"
                    }
                  />
                  <AvatarFallback>
                    {bounty.createdByUser?.name?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">
                    {bounty.createdByUser?.name || "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            {bounty.assignees && bounty.assignees.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Assigned To
                </h4>
                <div className="space-y-2">
                  {bounty.assignees.map((a) => {
                    const hasSubmitted = workSubmissions.some(
                      (s) => s.submittedBy === a.userId,
                    );
                    return (
                      <div
                        key={a.userId}
                        className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5"
                      >
                        <Avatar className="h-8 w-8 border-2 border-primary/20">
                          <AvatarImage
                            src={a.user?.avatar || "/placeholder-user.jpg"}
                          />
                          <AvatarFallback>
                            {a.user?.name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-primary truncate">
                            {a.user?.name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {a.userId === currentUser?.id && (
                              <p className="text-[10px] text-muted-foreground">
                                You
                              </p>
                            )}
                            {hasSubmitted && (
                              <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" /> Submitted
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
