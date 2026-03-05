"use client";

import { Bounty } from "@/lib/types";
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
  Code,
  MessageSquare,
  CheckCircle2,
  Upload,
  Send,
} from "lucide-react";
import { useState } from "react";
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
    submitWork,
  } = useBounty();

  const [applicationMessage, setApplicationMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  // Work submission states
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!bounty) return null;

  // Get current user's application for this bounty
  const userApplication = currentUser
    ? getUserApplicationForBounty(bounty.id)
    : null;

  // Check if current user is assigned to this bounty
  const isAssignedToCurrentUser =
    currentUser &&
    (bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id); // ← fallback for legacy single-assignee bounties

  // Check if user can submit work (assigned and bounty is in progress)
  const canSubmitWork =
    isAssignedToCurrentUser &&
    (bounty.status === "TO_DO" || bounty.status === "IN_PROGRESS");

  // Updated logic using the context method
  const canApply =
    currentUser &&
    bounty.createdBy !== currentUser.id &&
    !userApplication &&
    !isAssignedToCurrentUser;

  // User has already applied
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
        deliverableUrl: deliverableUrl,
      });

      // Reset form
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

            {/* <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" /> Requirements
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>Demonstrable experience in {bounty.categoryId}</li>
                <li>Clean, well-documented code submission</li>
                <li>Adherence to the project's security guidelines</li>
                <li>Passes all automated test suites</li>
              </ul>
            </div> */}

            {/* Work Submission Section for Assigned User */}
            {canSubmitWork && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Submit Your Work</h3>
                <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-green-700 dark:text-green-300 text-sm mb-4">
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

            {/* Application Section for non-assigned users */}
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

            {/* Application status for users who already applied */}
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

            {/* Show message when user cannot apply */}
            {!canApply && !hasApplied && !isAssignedToCurrentUser && (
              <div className="border-t pt-6">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-slate-600 dark:text-slate-400">
                    {!currentUser
                      ? "Please log in to apply for this bounty."
                      : bounty.createdBy === currentUser.id
                        ? "You cannot apply to your own bounty."
                        : isAssignedToCurrentUser
                          ? "You are assigned to this bounty."
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
                  {bounty.assignees.map((a) => (
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
                        {a.userId === currentUser?.id && (
                          <p className="text-[10px] text-muted-foreground">
                            You
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
