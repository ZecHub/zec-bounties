"use client";

import { Bounty } from "@/lib/types";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Clock,
  Users,
  ArrowUpRight,
  UserCheck,
  ClipboardList,
  Upload,
  Send,
} from "lucide-react";
import { formatStatus } from "@/lib/utils";
import { useBounty } from "@/lib/bounty-context";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  formatDistanceToNow,
  isPast,
  isWithinInterval,
  addDays,
  format,
} from "date-fns";
import { toast } from "sonner";

export function BountyCard({
  bounty,
  viewMode = "grid",
  onClick,
}: {
  bounty: Bounty;
  viewMode?: "grid" | "list" | "kanban";
  onClick?: () => void;
}) {
  const {
    currentUser,
    applyToBounty,
    getUserApplicationForBounty,
    getAllApplicationForBounty,
    submitWork,
  } = useBounty();

  const [applicationMessage, setApplicationMessage] = useState("");
  const [isApplicationDialogOpen, setIsApplicationDialogOpen] = useState(false);

  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false);
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userApplication = currentUser
    ? getUserApplicationForBounty(bounty.id)
    : null;

  const currentUserRole = currentUser ? currentUser.role : null;
  const allApplications = currentUserRole
    ? getAllApplicationForBounty(bounty.id)
    : null;

  const isAssignedToCurrentUser =
    currentUser &&
    (bounty.assignees?.some((a) => a.userId === currentUser.id) ||
      bounty.assignee === currentUser.id); // ← fallback for legacy single-assignee bounties

  const canSubmitWork =
    isAssignedToCurrentUser && bounty.status === "IN_PROGRESS";

  const canApply =
    currentUser &&
    bounty.createdBy !== currentUser.id &&
    !userApplication &&
    !isAssignedToCurrentUser;

  const hasApplied = !!userApplication;

  const statusColors = {
    TO_DO: "bg-green-500/10 text-green-500 border-green-500/20",
    IN_PROGRESS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    IN_REVIEW: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    DONE: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const difficultyColors: Record<string, string> = {
    EASY: "text-green-500",
    MEDIUM: "text-yellow-500",
    HARD: "text-red-500",
  };

  const dueDate = bounty.timeToComplete
    ? new Date(bounty.timeToComplete)
    : null;
  const isOverdue = dueDate
    ? isPast(dueDate) && bounty.status !== "DONE"
    : false;
  const isDueSoon =
    dueDate && !isOverdue
      ? isWithinInterval(new Date(), {
          start: new Date(),
          end: addDays(dueDate, 0),
        }) && dueDate <= addDays(new Date(), 3)
      : false;

  const dueDateLabel =
    dueDate && bounty.status !== "DONE" && bounty.status !== "CANCELLED"
      ? format(dueDate, "MMM d")
      : null;

  const dueDateColor = isOverdue
    ? "text-red-500 border-red-500/30 bg-red-500/10"
    : isDueSoon
      ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
      : "text-muted-foreground border-border bg-muted/30";

  const handleApply = async () => {
    if (!applicationMessage.trim()) {
      toast.error("Message required", {
        description: "Please write an application message.",
      });
      return;
    }
    try {
      await applyToBounty(bounty.id, applicationMessage);
      toast.success("Application submitted!");
      setApplicationMessage("");
      setIsApplicationDialogOpen(false);
    } catch (error: any) {
      toast.error("Failed to apply", { description: error?.message });
    }
  };

  const handleSubmitWork = async () => {
    if (!submissionDescription.trim()) {
      toast.error("Description required", {
        description: "Please describe the work you completed.",
      });
      return;
    }
    if (!deliverableUrl.trim()) {
      toast.error("Deliverable URL required", {
        description: "Please provide a link to your work.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitWork(bounty.id, {
        description: submissionDescription,
        deliverableUrl,
      });
      toast.success("Work submitted successfully!");
      setSubmissionDescription("");
      setDeliverableUrl("");
      setIsSubmissionDialogOpen(false);
    } catch (error: any) {
      toast.error("Failed to submit work", { description: error?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) return;
    onClick?.();
  };

  // ── KANBAN CARD (compact) ──────────────────────────────────────────────────
  if (viewMode === "kanban") {
    return (
      <>
        <Card
          className="p-1 group transition-all hover:border-primary/50 hover:shadow-md bg-card/80 backdrop-blur-sm cursor-pointer"
          onClick={handleCardClick}
        >
          <div className="p-3 space-y-2.5">
            {/* Title */}
            <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {bounty.title}
            </h3>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {bounty.description}
            </p>

            {/* Tags row */}
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {bounty.categoryId}
              </Badge>
              <Badge
                variant="secondary"
                className={`text-[10px] h-4 px-1.5 ${difficultyColors[bounty.difficulty] ?? ""}`}
              >
                {bounty.difficulty}
              </Badge>
              {hasApplied && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-yellow-500/40 text-yellow-600 bg-yellow-500/5"
                >
                  Applied
                </Badge>
              )}
              {isAssignedToCurrentUser && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-purple-500/40 text-purple-500 bg-purple-500/5"
                >
                  Yours
                </Badge>
              )}
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-5 w-5 border shrink-0">
                  <AvatarImage
                    src={
                      bounty.createdByUser?.avatar || "/placeholder-user.jpg"
                    }
                  />
                  <AvatarFallback className="text-[9px]">?</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">
                  {bounty.createdByUser?.name ?? "Unknown"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {dueDateLabel && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${dueDateColor}`}
                  >
                    {isOverdue ? "⚠ " : ""}
                    {dueDateLabel}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <span className="text-xs font-bold">
                    {bounty.bountyAmount}
                  </span>
                  <span className="text-[10px] text-muted-foreground">ZEC</span>
                </div>
                {canSubmitWork && (
                  <Button
                    size="icon"
                    className="h-6 w-6 bg-green-600 hover:bg-green-700 text-white rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSubmissionDialogOpen(true);
                    }}
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Work Submission Dialog */}
        <Dialog
          open={isSubmissionDialogOpen}
          onOpenChange={setIsSubmissionDialogOpen}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Your Work</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                  {bounty.title}
                </h4>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  Amount: {bounty.bountyAmount} ZEC
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-description">
                  Work Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="submission-description"
                  placeholder="Describe the work you've completed..."
                  value={submissionDescription}
                  onChange={(e) => setSubmissionDescription(e.target.value)}
                  className="min-h-[120px]"
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliverable-url">
                  Deliverable URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="deliverable-url"
                  type="url"
                  placeholder="https://github.com/username/repo"
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmissionDialogOpen(false);
                    setSubmissionDescription("");
                    setDeliverableUrl("");
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitWork}
                  disabled={
                    !submissionDescription.trim() ||
                    !deliverableUrl.trim() ||
                    isSubmitting
                  }
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Clock className="w-4 h-4 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Submit Work
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── LIST CARD ──────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <>
        <Card
          className="group transition-all hover:border-primary/50 overflow-hidden bg-card/50 backdrop-blur-sm cursor-pointer"
          onClick={handleCardClick}
        >
          <div className="flex items-center p-4 gap-4">
            <Avatar className="h-10 w-10 border shrink-0">
              <AvatarImage
                src={bounty.createdByUser?.avatar || "/placeholder-user.jpg"}
              />
              <AvatarFallback>{"None"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                {bounty.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {bounty.createdByUser?.name}
              </p>
            </div>
            {bounty.assignees && bounty.assignees.length > 0 ? (
              <div className="hidden lg:flex flex-col gap-1 items-start px-4 border-l min-w-[140px]">
                <span className="text-[10px] uppercase text-muted-foreground font-bold">
                  Assignees
                </span>
                <div className="flex items-center gap-1">
                  {bounty.assignees.slice(0, 3).map((a) => (
                    <Avatar
                      key={a.userId}
                      className="h-5 w-5 border -ml-1 first:ml-0"
                    >
                      <AvatarImage
                        src={a.user?.avatar || "/placeholder-user.jpg"}
                      />
                      <AvatarFallback className="text-[9px]">
                        {a.user?.name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {bounty.assignees.length > 3 && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      +{bounty.assignees.length - 3}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="hidden lg:flex flex-col gap-1 items-start px-4 border-l min-w-[140px]">
                <span className="text-[10px] uppercase text-muted-foreground font-bold">
                  Available
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Open for applications
                </span>
              </div>
            )}
            <div className="hidden md:flex flex-col gap-1 items-center px-4 border-x">
              <span className="text-[10px] uppercase text-muted-foreground font-bold">
                Category
              </span>
              <Badge variant="secondary" className="text-[10px] h-5">
                {bounty.categoryId}
              </Badge>
            </div>
            <div className="hidden sm:flex flex-col gap-1 items-center px-4">
              <span className="text-[10px] uppercase text-muted-foreground font-bold">
                Status
              </span>
              <Badge
                variant="outline"
                className={`${statusColors[bounty.status]} text-[10px] h-5`}
              >
                {formatStatus(bounty.status)}
              </Badge>
            </div>
            {dueDateLabel && (
              <div className="hidden sm:flex flex-col gap-1 items-center px-4 border-l">
                <span className="text-[10px] uppercase text-muted-foreground font-bold">
                  Due
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${dueDateColor}`}
                >
                  {isOverdue ? "⚠ " : ""}
                  {dueDateLabel}
                </span>
              </div>
            )}
            <div className="text-right pl-4">
              <p className="font-bold text-sm">{bounty.bountyAmount} ZEC</p>
              <p className="text-[10px] text-muted-foreground">
                {bounty.difficulty}
              </p>
            </div>
            {canSubmitWork && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSubmissionDialogOpen(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white shrink-0"
              >
                <Upload className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>

        <Dialog
          open={isSubmissionDialogOpen}
          onOpenChange={setIsSubmissionDialogOpen}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Your Work</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                  {bounty.title}
                </h4>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  Amount: {bounty.bountyAmount} ZEC
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-description">
                  Work Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="submission-description"
                  placeholder="Describe the work you've completed..."
                  value={submissionDescription}
                  onChange={(e) => setSubmissionDescription(e.target.value)}
                  className="min-h-[120px]"
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliverable-url">
                  Deliverable URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="deliverable-url"
                  type="url"
                  placeholder="https://github.com/username/repo"
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmissionDialogOpen(false);
                    setSubmissionDescription("");
                    setDeliverableUrl("");
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitWork}
                  disabled={
                    !submissionDescription.trim() ||
                    !deliverableUrl.trim() ||
                    isSubmitting
                  }
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Clock className="w-4 h-4 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Submit Work
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── GRID CARD (full size) ──────────────────────────────────────────────────
  return (
    <>
      <Card
        className="group transition-all hover:border-primary/50 overflow-hidden bg-card/50 backdrop-blur-sm cursor-pointer flex flex-col h-full"
        onClick={handleCardClick}
      >
        <CardHeader className="p-4 flex-row items-start justify-between space-y-0">
          <div className="flex gap-3 items-center">
            <Avatar className="h-10 w-10 border">
              <AvatarImage
                src={bounty.createdByUser?.avatar || "/placeholder-user.jpg"}
              />
              <AvatarFallback>{"None"}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {bounty.createdByUser?.name}
              </p>
              <h3 className="font-semibold line-clamp-1 leading-tight group-hover:text-primary transition-colors">
                {bounty.title}
              </h3>
            </div>
          </div>
          <Badge variant="outline" className={statusColors[bounty.status]}>
            {formatStatus(bounty.status)}
          </Badge>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1">
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
            {bounty.description}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge
              variant="secondary"
              className="text-[10px] h-5 uppercase tracking-wider"
            >
              {bounty.categoryId}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[10px] h-5 uppercase tracking-wider"
            >
              {bounty.difficulty}
            </Badge>
            {bounty.assignees && bounty.assignees.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 uppercase tracking-wider border-primary/50 text-primary bg-primary/5 gap-1"
              >
                <UserCheck className="h-3 w-3" /> {bounty.assignees.length}{" "}
                Assigned
              </Badge>
            )}
            {hasApplied && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 uppercase tracking-wider border-yellow-500/50 text-yellow-600 bg-yellow-500/5 gap-1"
              >
                <Clock className="h-3 w-3" /> Applied
              </Badge>
            )}
            {isAssignedToCurrentUser && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 uppercase tracking-wider border-purple-500/50 text-purple-600 bg-purple-500/5 gap-1"
              >
                Your Task
              </Badge>
            )}
          </div>
        </CardContent>
        <CardFooter className="p-4 pt-0 border-t bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {bounty.assignees && bounty.assignees.length > 0 ? (
              <div className="flex items-center gap-1">
                {bounty.assignees.slice(0, 3).map((a) => (
                  <Avatar
                    key={a.userId}
                    className="h-5 w-5 border ring-1 ring-background -ml-1 first:ml-0"
                  >
                    <AvatarImage
                      src={a.user?.avatar || "/placeholder-user.jpg"}
                    />
                    <AvatarFallback className="text-[9px]">
                      {a.user?.name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {bounty.assignees.length > 3 && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    +{bounty.assignees.length - 3}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <ClipboardList className="h-3 w-3 text-green-600" />
                <span className="text-[10px] font-semibold text-green-600">
                  Apply
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{new Date(bounty.dateCreated).toLocaleDateString()}</span>
              </div>
              {dueDateLabel && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium w-fit ${dueDateColor}`}
                >
                  {isOverdue ? "⚠ " : ""}
                  {dueDateLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs imd:text-sm">
              {bounty.bountyAmount} ZEC
            </span>
            {canSubmitWork && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSubmissionDialogOpen(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white h-8"
              >
                <Upload className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      <Dialog
        open={isSubmissionDialogOpen}
        onOpenChange={setIsSubmissionDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Your Work</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                {bounty.title}
              </h4>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Amount: {bounty.bountyAmount} ZEC
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-description">
                Work Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="submission-description"
                placeholder="Describe the work you've completed, what you delivered, and any important notes..."
                value={submissionDescription}
                onChange={(e) => setSubmissionDescription(e.target.value)}
                className="min-h-[120px]"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliverable-url">
                Deliverable URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="deliverable-url"
                type="url"
                placeholder="https://github.com/username/repo or https://drive.google.com/..."
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Link to your completed work (GitHub repo, Google Drive, deployed
                app, etc.)
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsSubmissionDialogOpen(false);
                  setSubmissionDescription("");
                  setDeliverableUrl("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitWork}
                disabled={
                  !submissionDescription.trim() ||
                  !deliverableUrl.trim() ||
                  isSubmitting
                }
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Clock className="w-4 h-4 mr-1 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Submit Work
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
