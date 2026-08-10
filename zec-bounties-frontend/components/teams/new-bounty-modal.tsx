// components/new-bounty-modal.tsx
"use client";

import type React from "react";

import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useBounty } from "@/lib/bounty-context";
import type { BountyFormData } from "@/lib/types";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface CreateBountyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-locks the bounty to a community — used when launched from a team console. */
  defaultTeamId?: string;
  defaultTeamName?: string;
}

function formatZec(amount: number) {
  if (!amount) return "0.00 ZEC";
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ZEC`;
}

export function TeamsNewBountyModal({
  onSuccess,
  onCancel,
  open,
  onOpenChange,
  defaultTeamId,
  defaultTeamName,
}: CreateBountyFormProps) {
  const { createBounty, categories } = useBounty();
  const [formData, setFormData] = useState<
    BountyFormData & { teamId?: string }
  >({
    title: "",
    description: "",
    assignee: "none",
    bountyAmount: 0,
    timeToComplete: new Date(),
    category: "",
    teamId: defaultTeamId,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deadlineLabel = useMemo(() => {
    if (
      !(formData.timeToComplete instanceof Date) ||
      isNaN(formData.timeToComplete.getTime())
    )
      return "No deadline set";
    return formData.timeToComplete.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [formData.timeToComplete]);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      assignee: "none",
      bountyAmount: 0,
      timeToComplete: new Date(),
      category: "",
      teamId: defaultTeamId,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Title is required", {
        description: "Give the bounty a clear, specific title.",
      });
      return;
    }
    if (!formData.category) {
      toast.error("Category is required", {
        description: "Select the category this bounty belongs to.",
      });
      return;
    }
    if (!formData.bountyAmount || formData.bountyAmount <= 0) {
      toast.error("Invalid reward amount", {
        description: "Enter a reward amount greater than 0.",
      });
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required", {
        description: "Describe what needs to be delivered.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createBounty(formData);
      toast.success("Bounty created", {
        description: `"${formData.title}" is now live.`,
      });
      onSuccess?.();
      resetForm();
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
      timeToComplete: new Date(e.target.value),
    }));
  };

  const fieldLabel =
    "mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground";
  const fieldInput =
    "h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border bg-card p-0 text-foreground sm:max-w-[520px]"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-start justify-between border-b px-6 py-5">
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-primary">
                New bounty
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                {defaultTeamName
                  ? `Post to ${defaultTeamName}`
                  : "Post a bounty"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-4 px-6 py-6">
            {defaultTeamName && (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Posting to {defaultTeamName}
              </div>
            )}

            <div>
              <label className={fieldLabel} htmlFor="title">
                Title
              </label>
              <input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. Fix z-address validation edge case"
                autoComplete="off"
                required
                className={fieldInput}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabel} htmlFor="category">
                  Category
                </label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  required
                  className={`${fieldInput} appearance-none`}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {categories.map((category, index) => (
                    <option key={index} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={fieldLabel} htmlFor="reward">
                  Reward (ZEC)
                </label>
                <input
                  id="reward"
                  type="number"
                  step="any"
                  min={0}
                  value={formData.bountyAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      bountyAmount: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                  required
                  className={fieldInput}
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel} htmlFor="timeToComplete">
                Deadline
              </label>
              <input
                id="timeToComplete"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={
                  formData.timeToComplete instanceof Date &&
                  !isNaN(formData.timeToComplete.getTime())
                    ? formData.timeToComplete.toISOString().split("T")[0]
                    : ""
                }
                onChange={handleDateChange}
                required
                className={fieldInput}
              />
            </div>

            <div>
              <label className={fieldLabel} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Requirements, deliverables, and any specifics a contributor needs to get started…"
                rows={4}
                required
                className={`${fieldInput} min-h-[100px] resize-none py-2 leading-relaxed`}
              />
            </div>

            {/* Live receipt preview */}
            <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Preview
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">
                    {formData.title || "Untitled bounty"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formData.category || "uncategorized"} · {deadlineLabel}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primary">
                  {formatZec(formData.bountyAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t px-6 py-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="h-10 rounded-md border px-4 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create bounty"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
