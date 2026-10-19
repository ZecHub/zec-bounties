"use client";

import type React from "react";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBounty } from "@/lib/bounty-context";
import type { BountyFormData } from "@/lib/types";
import { Loader2, Plus, Clock, Tag, AlignLeft, Users, Ban } from "lucide-react";
import { SiZcash } from "react-icons/si";
import { toast } from "sonner";
import { toDateInputValue, parseDateInputValue } from "@/lib/utils";
import { REPOS } from "@/lib/repos";
import { RepoMenuLabel } from "@/components/repo-filter";

interface CreateBountyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
type FieldErrors = {
  title?: string;
  category?: string;
  reward?: string;
  description?: string;
  team?: string;
};

export function NewBountyModal({
  onSuccess,
  onCancel,
  open,
  onOpenChange,
}: CreateBountyFormProps) {
  const {
    createBounty,
    currentUser,
    categories,
    bountyQuota,
    fetchBountyQuota,
    communities,
    fetchCommunities,
    favoriteTeamIds,
  } = useBounty();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    bountyAmount: 0,
    timeToComplete: new Date(),
    category: "",
    teamId: "",
    targetRepo: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorSummary, setErrorSummary] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;

      const next = { ...prev };
      delete next[field];
      return next;
    });

    setErrorSummary("");
  };

  useEffect(() => {
    if (!open) return;
    fetchBountyQuota();
    if (currentUser?.role === "HUNTER") fetchCommunities();
  }, [open, currentUser?.role]);
  const isAdmin = currentUser?.role === "ADMIN";
  const isHunter = currentUser?.role === "HUNTER";
  const blocked = currentUser?.canCreateTasks === false;
  const eligibility = isHunter ? bountyQuota?.postEligibility : null;
  const notEligible = eligibility?.allowed === false;
  const atLimit =
    !isAdmin &&
    !notEligible &&
    bountyQuota?.remaining !== null &&
    bountyQuota?.remaining === 0;

  const joinedTeams = communities.filter((t) => favoriteTeamIds.has(t.id));

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

    if (blocked) {
      toast.error("Task creation disabled", {
        description: "An admin has blocked your account from creating tasks.",
      });
      return false;
    }

    if (notEligible && eligibility) {
      const desc =
        eligibility.mode === "closed"
          ? "Bounty suggestions are currently closed."
          : `Complete ${eligibility.required} bounties first (${eligibility.completed}/${eligibility.required} done).`;
      toast.error(
        eligibility.mode === "closed" ? "Suggestions closed" : "Not eligible to post yet",
        { description: desc },
      );
      return false;
    }

    if (atLimit) {
      toast.error("Weekly bounty limit reached", {
        description: `You've used your ${bountyQuota?.limit} bount${
          bountyQuota?.limit === 1 ? "y" : "ies"
        } for this week.`,
      });
      return;
    }

    if (!formData.title.trim()) {
      nextErrors.title = "Enter a bounty title.";
    }

    if (!formData.category) {
      nextErrors.category = "Select a category.";
    }

    if (!formData.bountyAmount || formData.bountyAmount <= 0) {
      nextErrors.reward = "Enter a reward amount greater than 0.";
    }

    if (!formData.description.trim()) {
      nextErrors.description = "Describe the bounty requirements.";
    }

    setFieldErrors(nextErrors);

    const firstInvalid = (
      ["title", "category", "reward", "description"] as (keyof FieldErrors)[]
    ).find((field) => Boolean(nextErrors[field]));

    if (firstInvalid) {
      setErrorSummary(
        "Please correct the highlighted fields before continuing.",
      );

      requestAnimationFrame(() => {
        document.getElementById(firstInvalid)?.focus();
      });

      return false;
    }

    setErrorSummary("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await createBounty({
        ...formData,
        teamId: formData.teamId || undefined,
      });
      toast.success(isHunter ? "Suggestion sent" : "Bounty created!", {
        description: isHunter
          ? formData.teamId
            ? `"${formData.title}" was sent to the selected team for review.`
            : `"${formData.title}" was submitted for review.`
          : `"${formData.title}" is now live.`,
      });
      onSuccess?.();
      setFormData({
        title: "",
        description: "",
        bountyAmount: 0,
        timeToComplete: new Date(),
        category: "",
        teamId: "",
        targetRepo: "",
      });
    } catch (error: any) {
      toast.error("Failed to create bounty", {
        description: error?.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      timeToComplete: parseDateInputValue(e.target.value),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto overflow-x-hidden rounded-2xl border p-0 shadow-xl"
        onOpenAutoFocus={() => {
          if (
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
          ) {
            openerRef.current = document.activeElement;
          }
        }}
        onCloseAutoFocus={(event) => {
          if (!openerRef.current) return;

          event.preventDefault();
          openerRef.current.focus();
          openerRef.current = null;
        }}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col max-h-[70vh] imd:max-h-full min-w-0"
        >
          <DialogHeader className="space-y-3 border-b border-border px-5 py-5 text-left sam:px-6 sam:py-6">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight sam:text-xl">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus className="h-4 w-4" />
                </span>
                Create New Bounty
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Provide the details for your technical challenge.
              </DialogDescription>
            </div>
            {!isAdmin && !blocked && !notEligible && bountyQuota && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span
                  className={`h-2 w-2 rounded-full ${
                    (bountyQuota.remaining ?? 0) > 0
                      ? "bg-emerald-500"
                      : "bg-destructive"
                  }`}
                />
                {(bountyQuota.remaining ?? 0) > 0
                  ? `${bountyQuota.remaining} of ${bountyQuota.limit} bount${
                      bountyQuota.limit === 1 ? "y" : "ies"
                    } left this week.`
                  : "You've reached your weekly bounty limit."}
              </div>
            )}

            {notEligible && eligibility && (
              <div
                role="status"
                className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>
                    {eligibility.mode === "closed"
                      ? "Bounty suggestions are closed"
                      : `Complete ${eligibility.required} bounties to post your own`}
                  </span>
                  <span className="tabular-nums">
                    {eligibility.completed}/{eligibility.required}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-500/20">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        eligibility.required
                          ? (eligibility.completed / eligibility.required) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {blocked && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  An admin has blocked your account from creating tasks.
                </span>
              </div>
            )}
          </DialogHeader>

          {errorSummary && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {errorSummary}
            </div>
          )}

          <div className="grid gap-5 px-5 py-5 sam:gap-6 sam:px-6 sam:py-6">
            {/* Title */}
            <div className="space-y-2">
              <Label
                htmlFor="title"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                Bounty Title
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, title: e.target.value }));
                  clearFieldError("title");
                }}
                placeholder="Enter bounty title..."
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? "title-error" : undefined}
                required
                className="h-11 rounded-xl"
              />
              {fieldErrors.title && (
                <p id="title-error" className="text-sm text-destructive">
                  {fieldErrors.title}
                </p>
              )}
            </div>

            {/* Category + Reward */}
            {isHunter && (
              <div className="space-y-2">
                <Label
                  htmlFor="team"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Team{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Select
                  value={formData.teamId || "none"}
                  onValueChange={(value) => {
                    const teamId = value === "none" ? "" : value;
                    setFormData((prev) => ({ ...prev, teamId }));
                    clearFieldError("team");
                  }}
                >
                  <SelectTrigger
                    id="team"
                    className="h-11 rounded-xl"
                    aria-invalid={Boolean(fieldErrors.team)}
                  >
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {joinedTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.team && (
                  <p className="text-sm text-destructive">{fieldErrors.team}</p>
                )}
              </div>
            )}

            {/* Category + Reward */}
            <div className="grid grid-cols-1 gap-5 imd:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="category"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  Category
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => {
                    setFormData((prev) => ({ ...prev, category: value }));
                    clearFieldError("category");
                  }}
                  required
                >
                  <SelectTrigger
                    id="category"
                    className="h-11 rounded-xl"
                    aria-invalid={Boolean(fieldErrors.category)}
                    aria-describedby={
                      fieldErrors.category ? "category-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category, index) => (
                      <SelectItem key={index} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.category && (
                  <p id="category-error" className="text-sm text-destructive">
                    {fieldErrors.category}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="targetRepo"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  Repository
                </Label>
                <Select
                  value={formData.targetRepo || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      targetRepo: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="targetRepo"
                    className="h-11 w-full rounded-xl"
                  >
                    <SelectValue placeholder="Select repository" />
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

              <div className="space-y-2">
                <Label
                  htmlFor="reward"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <SiZcash className="h-3.5 w-3.5 text-muted-foreground" />
                  Reward (ZEC)
                </Label>
                <Input
                  id="reward"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.bountyAmount}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      bountyAmount: Number.parseFloat(e.target.value) || 0,
                    }));
                    clearFieldError("reward");
                  }}
                  placeholder="0.00"
                  aria-invalid={Boolean(fieldErrors.reward)}
                  aria-describedby={
                    fieldErrors.reward ? "reward-error" : undefined
                  }
                  required
                  className="h-11 rounded-xl"
                />
                {fieldErrors.reward && (
                  <p id="reward-error" className="text-sm text-destructive">
                    {fieldErrors.reward}
                  </p>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label
                htmlFor="date"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Time to Complete
              </Label>
              <Input
                id="date"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={toDateInputValue(formData.timeToComplete)}
                onChange={handleDateChange}
                required
                className="h-11 rounded-xl"
              />
            </div>

            {/* Description */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }));
                  clearFieldError("description");
                }}
                placeholder="Describe the bounty requirements, deliverables, and any specific instructions..."
                rows={4}
                className="min-h-[120px] w-full min-w-0 resize-none rounded-xl"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description ? "description-error" : undefined
                }
                required
              />
              {fieldErrors.description && (
                <p id="description-error" className="text-sm text-destructive">
                  {fieldErrors.description}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-3 border-t border-border px-5 py-4 imd:flex-row imd:items-center imd:justify-end sam:px-6">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="h-11 w-full rounded-xl px-6 w-auto"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || atLimit || blocked || notEligible}
              className="h-11 w-full rounded-xl px-6 w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : blocked ? (
                "Task creation disabled"
              ) : notEligible ? (
                `Complete ${eligibility?.required} bounties to post`
              ) : atLimit ? (
                "Weekly limit reached"
              ) : (
                "Create Bounty"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
