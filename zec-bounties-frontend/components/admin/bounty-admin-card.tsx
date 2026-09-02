"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Bounty, BountyStatus, WorkSubmission } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  Shield,
  CreditCard,
  Edit,
  Users,
  Eye,
  Settings,
  MessageSquare,
  Upload,
  ExternalLink,
  FileText,
  CheckCircle2,
  Code,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { formatStatus } from "@/lib/utils";
import { PaymentAuthorizationModal } from "./payment-authorization-modal";
import { useState, useEffect } from "react";

interface UnifiedAdminBountyCardProps {
  bounty: Bounty;
  variant?: "compact" | "detailed";
}

const statusColors = {
  TO_DO: "bg-green-500/10 text-green-500 border-green-500/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  IN_REVIEW: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  DONE: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
};

// Stable avatar: only mounts AvatarImage when we have a real URL so there is
// no load → fail → fallback flicker.  When there is no real URL the
// placeholder image is rendered directly inside AvatarFallback.
function StableAvatar({
  src,
  alt,
  fallbackChar,
  className,
}: {
  src?: string | null;
  alt?: string;
  fallbackChar: string;
  className?: string;
}) {
  const hasRealAvatar = !!src && src !== "/placeholder-user.jpg";

  return (
    <Avatar className={className}>
      {hasRealAvatar && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback>
        {hasRealAvatar ? (
          fallbackChar
        ) : (
          <img
            src="/placeholder-user.jpg"
            alt={alt || "User"}
            className="h-full w-full rounded-full object-cover"
          />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export function BountyAdminCard({
  bounty,
  variant = "compact",
}: UnifiedAdminBountyCardProps) {
  const {
    updateBountyStatus,
    approveBounty,
    editBounty,
    users,
    getAllApplicationsForBounty,
    acceptApplication,
    rejectApplication,
    fetchBountyApplications,
    fetchWorkSubmissions,
    reviewWorkSubmission,
  } = useBounty();

  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isManagingApplications, setIsManagingApplications] = useState(false);
  const [isManagingSubmissions, setIsManagingSubmissions] = useState(false);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [editForm, setEditForm] = useState({
    title: bounty.title,
    description: bounty.description,
    bountyAmount: bounty.bountyAmount,
    timeToComplete: format(bounty.timeToComplete, "yyyy-MM-dd"),
    assignee: bounty.assignee || "none",
  });

  const isOverdue =
    new Date() > bounty.timeToComplete &&
    bounty.status !== "DONE" &&
    bounty.status !== "CANCELLED";

  const applications = getAllApplicationsForBounty(bounty.id);

  // Fetch applications when details dialog opens
  useEffect(() => {
    if (isDetailsDialogOpen || isManagingApplications) {
      fetchBountyApplications(bounty.id);
    }
  }, [
    isDetailsDialogOpen,
    isManagingApplications,
    bounty.id,
    fetchBountyApplications,
  ]);

  // Fetch work submissions when managing submissions
  useEffect(() => {
    if (isManagingSubmissions || isDetailsDialogOpen) {
      loadWorkSubmissions();
    }
  }, [isManagingSubmissions, isDetailsDialogOpen, bounty.id]);

  const loadWorkSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const submissions = await fetchWorkSubmissions(bounty.id);
      setWorkSubmissions(submissions);
    } catch (error) {
      console.error("Failed to load work submissions:", error);
      setWorkSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: BountyStatus) => {
    setIsUpdating(true);
    try {
      updateBountyStatus(bounty.id, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApprovalChange = async (approved: boolean) => {
    setIsUpdating(true);
    try {
      approveBounty(bounty.id, approved);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditBounty = () => {
    editBounty(bounty.id, {
      title: editForm.title,
      description: editForm.description,
      bountyAmount: editForm.bountyAmount,
      timeToComplete: new Date(editForm.timeToComplete),
      assignee: editForm.assignee === "none" ? undefined : editForm.assignee,
    });
    setIsEditDialogOpen(false);
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
      await reviewWorkSubmission(submissionId, {
        status: action,
        reviewNotes: reviewNotes,
      });
      await loadWorkSubmissions();
    } catch (error) {
      console.error("Failed to review submission:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) {
      return;
    }
    setIsDetailsDialogOpen(true);
  };

  const pendingSubmissions = workSubmissions.filter(
    (submission) => submission.status === "pending",
  ).length;

  const hasWorkSubmissions = workSubmissions.length > 0;

  const CompactCard = () => (
    <Card
      className="group transition-all hover:border-primary/50 overflow-hidden bg-card/50 backdrop-blur-sm cursor-pointer flex flex-col h-full"
      onClick={handleCardClick}
    >
      <CardHeader className="p-4 flex-row items-start justify-between space-y-0">
        <div className="flex gap-3 items-center">
          <StableAvatar
            className="h-10 w-10 border"
            src={bounty.createdByUser?.avatar}
            alt={bounty.createdByUser?.name || "User"}
            fallbackChar={bounty.createdByUser?.name?.charAt(0) || "?"}
          />
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {bounty.createdByUser?.name}
            </p>
            <h3 className="font-semibold line-clamp-1 leading-tight group-hover:text-primary transition-colors">
              {bounty.title}
            </h3>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`${statusColors[bounty.status]} text-[10px] h-5`}
        >
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
          {bounty.isApproved ? (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-green-600 border-green-200 dark:text-green-400 dark:border-green-800 gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800 gap-1"
            >
              <XCircle className="h-3 w-3" />
              Pending
            </Badge>
          )}
          {bounty.paymentAuthorized && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800 gap-1"
            >
              Payment Auth
            </Badge>
          )}
          {applications && applications.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800 gap-1"
            >
              <Users className="h-3 w-3" />
              {applications.length} Applied
            </Badge>
          )}
          {/* {hasWorkSubmissions && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800 gap-1"
            >
              <Upload className="h-3 w-3" />
              {pendingSubmissions > 0
                ? `${pendingSubmissions} Pending`
                : "Submitted"}
            </Badge>
          )} */}
          {bounty.assignee && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider border-primary/50 text-primary bg-primary/5 gap-1"
            >
              <User className="h-3 w-3" /> Assigned
            </Badge>
          )}
          {isOverdue && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
            >
              Overdue
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 border-t bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {bounty.assignee ? (
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
              <StableAvatar
                className="h-5 w-5 border-white"
                src={bounty.assigneeUser?.avatar}
                alt={bounty.assigneeUser?.name || "Assignee"}
                fallbackChar={bounty.assigneeUser?.name?.charAt(0) || "?"}
              />
              <span className="text-[10px] font-bold text-primary">
                {bounty.assigneeUser?.name || "Unknown"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <Settings className="h-3 w-3 text-green-600" />
              <span className="text-[10px] font-semibold text-green-600">
                Manage
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{format(bounty.dateCreated, "MMM dd, yyyy")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs md:text-sm">
            {bounty.bountyAmount} ZEC
          </span>
        </div>
      </CardFooter>
    </Card>
  );

  const DetailedCard = () => (
    <Card className="group transition-all hover:border-primary/50 overflow-hidden bg-card/50 backdrop-blur-sm flex flex-col h-full">
      <CardHeader className="p-4 flex-row items-start justify-between space-y-0">
        <div className="flex gap-3 items-center flex-1">
          <StableAvatar
            className="h-10 w-10 border"
            src={bounty.createdByUser?.avatar}
            alt={bounty.createdByUser?.name || "User"}
            fallbackChar={bounty.createdByUser?.name?.charAt(0) || "?"}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">
              {bounty.createdByUser?.name}
            </p>
            <h3 className="font-semibold line-clamp-1 leading-tight group-hover:text-primary transition-colors">
              {bounty.title}
            </h3>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`${statusColors[bounty.status]} text-[10px] h-5 shrink-0`}
        >
          {formatStatus(bounty.status)}
        </Badge>
      </CardHeader>

      <CardContent className="p-4 pt-0 flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px] leading-relaxed mb-4">
          {bounty.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
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
          {bounty.isApproved ? (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-green-600 border-green-200 dark:text-green-400 dark:border-green-800 gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800 gap-1"
            >
              <XCircle className="h-3 w-3" />
              Pending
            </Badge>
          )}
          {bounty.paymentAuthorized && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800 gap-1"
            >
              Payment Auth
            </Badge>
          )}
          {applications && applications.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800 gap-1"
            >
              <Users className="h-3 w-3" />
              {applications.length} Applied
            </Badge>
          )}
          {hasWorkSubmissions && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800 gap-1"
            >
              <Upload className="h-3 w-3" />
              {pendingSubmissions > 0
                ? `${pendingSubmissions} Pending`
                : "Submitted"}
            </Badge>
          )}
          {bounty.assignee && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider border-primary/50 text-primary bg-primary/5 gap-1"
            >
              <User className="h-3 w-3" /> Assigned
            </Badge>
          )}
          {isOverdue && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 uppercase tracking-wider text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
            >
              Overdue
            </Badge>
          )}
        </div>

        {hasWorkSubmissions && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Work Submissions ({workSubmissions.length})
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsManagingSubmissions(true)}
              >
                <Upload className="w-3 h-3 mr-1" />
                Review
              </Button>
            </div>
            <div className="space-y-2">
              {workSubmissions.slice(0, 2).map((submission) => (
                <div
                  key={submission.id}
                  className="text-xs text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">
                      {submission.submitterUser?.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        submission.status === "approved"
                          ? "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                          : submission.status === "rejected"
                            ? "text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
                            : submission.status === "needs_revision"
                              ? "text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800"
                              : "text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800"
                      }
                    >
                      {submission.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-500 line-clamp-1">
                    {submission.description}
                  </p>
                </div>
              ))}
              {workSubmissions.length > 2 && (
                <div className="text-xs text-slate-500 dark:text-slate-500 text-center">
                  +{workSubmissions.length - 2} more submissions
                </div>
              )}
            </div>
          </div>
        )}

        {applications && applications.length > 0 && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Applications ({applications.length})
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsManagingApplications(true)}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                Manage
              </Button>
            </div>
            <div className="space-y-2">
              {applications.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  className="text-xs text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">
                      {app.applicantUser?.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        app.status === "accepted"
                          ? "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                          : app.status === "rejected"
                            ? "text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
                            : "text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800"
                      }
                    >
                      {app.status || "pending"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-500 line-clamp-1">
                    {app.message}
                  </p>
                </div>
              ))}
              {applications.length > 3 && (
                <div className="text-xs text-slate-500 dark:text-slate-500 text-center">
                  +{applications.length - 3} more applications
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Shield className="w-4 h-4" />
              <span className="font-medium">Admin Controls</span>
            </div>
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Bounty</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-amount">Bounty Amount (ZEC)</Label>
                    <Input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      value={editForm.bountyAmount}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          bountyAmount: Number.parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-due">Due Date</Label>
                    <Input
                      id="edit-due"
                      type="date"
                      value={editForm.timeToComplete}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          timeToComplete: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-assignee">Assignee</Label>
                    <Select
                      value={editForm.assignee}
                      onValueChange={(value) =>
                        setEditForm((prev) => ({ ...prev, assignee: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Assignee</SelectItem>
                        {users
                          .filter((u) => u.role === "CLIENT")
                          .map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsEditDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleEditBounty}>Save Changes</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Status
              </label>
              <Select
                value={formatStatus(bounty.status)}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TO_DO">To Do</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Approval
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={bounty.isApproved ? "default" : "outline"}
                  onClick={() => handleApprovalChange(true)}
                  disabled={isUpdating || bounty.isApproved}
                  className="flex-1 h-8 text-xs"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant={!bounty.isApproved ? "destructive" : "outline"}
                  onClick={() => handleApprovalChange(false)}
                  disabled={isUpdating || !bounty.isApproved}
                  className="flex-1 h-8 text-xs"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 border-t bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {bounty.assignee ? (
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
              <StableAvatar
                className="h-5 w-5 border-white"
                src={bounty.assigneeUser?.avatar}
                alt={bounty.assigneeUser?.name || "Assignee"}
                fallbackChar={bounty.assigneeUser?.name?.charAt(0) || "?"}
              />
              <span className="text-[10px] font-bold text-primary">
                {bounty.assigneeUser?.name || "Unknown"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <Settings className="h-3 w-3 text-green-600" />
              <span className="text-[10px] font-semibold text-green-600">
                Manage
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{format(bounty.dateCreated, "MMM dd, yyyy")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs md:text-sm">
            {bounty.bountyAmount} ZEC
          </span>
        </div>
      </CardFooter>
    </Card>
  );

  return (
    <>
      {variant === "compact" ? <CompactCard /> : <DetailedCard />}

      {/* Work Submissions Management Dialog */}
      <Dialog
        open={isManagingSubmissions}
        onOpenChange={setIsManagingSubmissions}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Review Work Submissions
            </DialogTitle>
            <DialogDescription className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-xs">
                <Shield className="h-3 w-3" /> {bounty.title}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
            <div className="md:col-span-2 space-y-6">
              {submissionsLoading ? (
                <div className="flex justify-center py-8">
                  <Clock className="w-6 h-6 animate-spin" />
                </div>
              ) : workSubmissions && workSubmissions.length > 0 ? (
                <div className="space-y-6">
                  {workSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="border rounded-lg p-6 space-y-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <StableAvatar
                            className="h-10 w-10 border"
                            src={submission.submitterUser?.avatar}
                            alt={submission.submitterUser?.name || "Submitter"}
                            fallbackChar={
                              submission.submitterUser?.name?.charAt(0) || "?"
                            }
                          />
                          <div>
                            <p className="text-sm font-semibold">
                              {submission.submitterUser?.name || "Unknown User"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(
                                new Date(submission.submittedAt),
                                "MMM dd, yyyy 'at' h:mm a",
                              )}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            submission.status === "approved"
                              ? "text-green-600 border-green-200"
                              : submission.status === "rejected"
                                ? "text-red-600 border-red-200"
                                : submission.status === "needs_revision"
                                  ? "text-orange-600 border-orange-200"
                                  : "text-yellow-600 border-yellow-200"
                          }
                        >
                          {submission.status}
                        </Badge>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Code className="h-4 w-4 text-primary" /> Work
                          Description
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {submission.description}
                        </p>
                      </div>

                      {submission.deliverableUrl && (
                        <div>
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <ExternalLink className="h-4 w-4 text-primary" />{" "}
                            Deliverable Link
                          </h4>
                          <a
                            href={submission.deliverableUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 break-all"
                          >
                            {submission.deliverableUrl}
                          </a>
                        </div>
                      )}

                      {submission.reviewNotes && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <h4 className="font-semibold mb-2 text-sm">
                            Review Notes
                          </h4>
                          <p className="text-sm">{submission.reviewNotes}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Reviewed by:{" "}
                            {submission.reviewerUser?.name || "Admin"}{" "}
                            {submission.reviewedAt &&
                              `on ${format(new Date(submission.reviewedAt), "MMM dd, yyyy")}`}
                          </p>
                        </div>
                      )}

                      {submission.status === "pending" && (
                        <div className="border-t pt-4 space-y-4">
                          <div>
                            <Label htmlFor={`review-notes-${submission.id}`}>
                              Review Notes (optional)
                            </Label>
                            <Textarea
                              id={`review-notes-${submission.id}`}
                              placeholder="Add feedback for the submitter..."
                              className="mt-2 min-h-[100px]"
                            />
                          </div>

                          <div className="flex gap-3">
                            <Button
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
                              className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Approve
                            </Button>

                            <Button
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
                              <FileText className="w-4 h-4 mr-2" />
                              Request Revision
                            </Button>

                            <Button
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
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}

                      {submission.status === "approved" && (
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                            <div>
                              <p className="font-semibold text-green-800 dark:text-green-200">
                                Submission Approved
                              </p>
                              <p className="text-sm text-green-600 dark:text-green-400">
                                Work approved and bounty marked as done
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {submission.status === "rejected" && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <XCircle className="w-6 h-6 text-red-600" />
                            <div>
                              <p className="font-semibold text-red-800 dark:text-red-200">
                                Submission Rejected
                              </p>
                              <p className="text-sm text-red-600 dark:text-red-400">
                                Bounty status changed to "In Progress"
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {submission.status === "needs_revision" && (
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-6 h-6 text-orange-600" />
                            <div>
                              <p className="font-semibold text-orange-800 dark:text-orange-200">
                                Revision Requested
                              </p>
                              <p className="text-sm text-orange-600 dark:text-orange-400">
                                Bounty status changed to "In Progress"
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No Work Submissions Yet
                  </h3>
                  <p className="text-muted-foreground">
                    This bounty hasn't received any work submissions yet.
                  </p>
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
                  <StableAvatar
                    className="h-10 w-10 border"
                    src={bounty.createdByUser?.avatar}
                    alt={bounty.createdByUser?.name || "Issuer"}
                    fallbackChar={bounty.createdByUser?.name?.charAt(0) || "?"}
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {bounty.createdByUser?.name || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>

              {bounty.assignee && (
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Assigned To
                  </h4>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <StableAvatar
                      className="h-10 w-10 border-2 border-primary/20"
                      src={bounty.assigneeUser?.avatar}
                      alt={bounty.assigneeUser?.name || "Assignee"}
                      fallbackChar={bounty.assigneeUser?.name?.charAt(0) || "?"}
                    />
                    <div>
                      <p className="text-sm font-bold text-primary">
                        {bounty.assigneeUser?.name || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Applications Management Dialog */}
      <Dialog
        open={isManagingApplications}
        onOpenChange={setIsManagingApplications}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Manage Applications
            </DialogTitle>
            <DialogDescription className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-xs">
                <Shield className="h-3 w-3" /> {bounty.title}
              </span>
              <span className="flex items-center gap-1 text-xs">
                <Users className="h-3 w-3" /> {applications?.length || 0}{" "}
                Applications
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {applications && applications.length > 0 ? (
              <div className="space-y-4">
                {applications.map((application) => (
                  <div
                    key={application.id}
                    className="p-6 border rounded-lg space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <StableAvatar
                          className="h-10 w-10 border"
                          src={application.applicantUser?.avatar}
                          alt={application.applicantUser?.name || "Applicant"}
                          fallbackChar={
                            application.applicantUser?.name?.charAt(0) || "?"
                          }
                        />
                        <div>
                          <p className="text-sm font-semibold">
                            {application.applicantUser?.name || "Unknown User"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(
                              new Date(application.appliedAt),
                              "MMM dd, yyyy 'at' h:mm a",
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          application.status === "accepted"
                            ? "text-green-600 border-green-200"
                            : application.status === "rejected"
                              ? "text-red-600 border-red-200"
                              : "text-yellow-600 border-yellow-200"
                        }
                      >
                        {application.status || "pending"}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />{" "}
                        Application Message
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {application.message}
                      </p>
                    </div>

                    {application.status === "pending" && (
                      <div className="flex gap-3 pt-3 border-t">
                        <Button
                          onClick={() =>
                            handleApplicationAction(application.id, "accept")
                          }
                          disabled={isUpdating}
                          className="flex-1"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Accept Application
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleApplicationAction(application.id, "reject")
                          }
                          disabled={isUpdating}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Message
                        </Button>
                      </div>
                    )}

                    {application.status === "accepted" && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                            Application Accepted - Applicant assigned to bounty
                          </span>
                        </div>
                      </div>
                    )}

                    {application.status === "rejected" && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-5 h-5 text-red-600" />
                          <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                            Application Rejected
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No Applications Yet
                </h3>
                <p className="text-muted-foreground">
                  This bounty hasn't received any applications yet.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detailed Management Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
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
                <Users className="h-3 w-3" /> {applications?.length || 0}{" "}
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

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Dialog
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" className="h-12">
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Bounty
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Edit Bounty</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="edit-title">Title</Label>
                          <Input
                            id="edit-title"
                            value={editForm.title}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                title: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-description">Description</Label>
                          <Textarea
                            id="edit-description"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-amount">
                            Bounty Amount (ZEC)
                          </Label>
                          <Input
                            id="edit-amount"
                            type="number"
                            step="0.01"
                            value={editForm.bountyAmount}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                bountyAmount: Number.parseFloat(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-due">Due Date</Label>
                          <Input
                            id="edit-due"
                            type="date"
                            value={editForm.timeToComplete}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                timeToComplete: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-assignee">Assignee</Label>
                          <Select
                            value={editForm.assignee}
                            onValueChange={(value) =>
                              setEditForm((prev) => ({
                                ...prev,
                                assignee: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Assignee</SelectItem>
                              {users
                                .filter((u) => u.role === "CLIENT")
                                .map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setIsEditDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleEditBounty}>
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={() => setIsManagingApplications(true)}
                    disabled={!applications || applications.length === 0}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Applications ({applications?.length || 0})
                  </Button>

                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={() => setIsManagingSubmissions(true)}
                    disabled={!hasWorkSubmissions}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Submissions ({workSubmissions.length})
                    {pendingSubmissions > 0 && (
                      <Badge className="ml-1 bg-yellow-500 text-white text-xs px-1">
                        {pendingSubmissions}
                      </Badge>
                    )}
                  </Button>

                  <Button
                    variant={bounty.isApproved ? "default" : "outline"}
                    className="h-12"
                    onClick={() => handleApprovalChange(!bounty.isApproved)}
                    disabled={isUpdating}
                  >
                    {bounty.isApproved ? (
                      <>
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Status Management</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    "TO_DO",
                    "IN_PROGRESS",
                    "IN_REVIEW",
                    "DONE",
                    "CANCELLED",
                  ].map((status) => (
                    <Button
                      key={formatStatus(status)}
                      variant={bounty.status === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleStatusChange(status as BountyStatus)}
                      disabled={isUpdating}
                      className="h-10"
                    >
                      {formatStatus(status)}
                    </Button>
                  ))}
                </div>
              </div>

              {bounty.status === "DONE" && bounty.isApproved && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Payment Status</h3>
                  {bounty.paymentAuthorized ? (
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                      <div>
                        <div className="font-semibold text-green-800 dark:text-green-200">
                          {bounty.isPaid ? "Payment Sent" : "Payment Authorized"}
                        </div>
                        <div className="text-sm text-green-600 dark:text-green-400 font-mono">
                          {bounty.paymentTxId
                            ? `${bounty.bountyAmount} ZEC — tx ${bounty.paymentTxId.slice(0, 16)}…`
                            : `${bounty.bountyAmount} ZEC`}
                        </div>
                      </div>
                    </div>
                  ) : bounty.paymentInFlight ? (
                    <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      <div>
                        <div className="font-semibold text-amber-800 dark:text-amber-200">
                          Payment Settling
                        </div>
                        <div className="text-sm text-amber-600 dark:text-amber-400">
                          A send is in flight or awaiting manual resolution —
                          locked against retry
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                      <div className="flex-1">
                        <div className="font-semibold text-yellow-800 dark:text-yellow-200">
                          Payment Pending Authorization
                        </div>
                        <div className="text-sm text-yellow-600 dark:text-yellow-400">
                          {bounty.bountyAmount} ZEC ready for payment
                        </div>
                      </div>
                      <PaymentAuthorizationModal bounty={bounty}>
                        <Button
                          disabled={isUpdating}
                          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Authorize Payment
                        </Button>
                      </PaymentAuthorizationModal>
                    </div>
                  )}
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
                  <StableAvatar
                    className="h-10 w-10 border"
                    src={bounty.createdByUser?.avatar}
                    alt={bounty.createdByUser?.name || "Issuer"}
                    fallbackChar={bounty.createdByUser?.name?.charAt(0) || "?"}
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {bounty.createdByUser?.name || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>

              {bounty.assignee && (
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Assigned To
                  </h4>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <StableAvatar
                      className="h-10 w-10 border-2 border-primary/20"
                      src={bounty.assigneeUser?.avatar}
                      alt={bounty.assigneeUser?.name || "Assignee"}
                      fallbackChar={bounty.assigneeUser?.name?.charAt(0) || "?"}
                    />
                    <div>
                      <p className="text-sm font-bold text-primary">
                        {bounty.assigneeUser?.name || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
