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
    "mb-1.5 block font-mono text-xs uppercase tracking-widest text-ledger-text-muted";
  const fieldInput =
    "h-10 w-full rounded-md border border-ledger-border bg-transparent px-3 text-sm text-ledger-text outline-none transition focus:border-ledger-gold";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-ledger-border bg-ledger-bg p-0 text-ledger-text sm:max-w-[520px]"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-start justify-between border-b border-ledger-border px-6 py-5">
            <div>
              <span className="mb-1.5 block font-mono text-xs uppercase tracking-widest text-ledger-gold">
                New bounty
              </span>
              <h2 className="font-mono text-lg font-medium text-ledger-text">
                {defaultTeamName
                  ? `Post to ${defaultTeamName}`
                  : "Post a bounty"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-ledger-text-muted transition hover:text-ledger-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-4 px-6 py-6">
            {defaultTeamName && (
              <div className="flex items-center gap-2 rounded-md border border-ledger-gold/30 bg-ledger-gold/10 px-3 py-2 font-mono text-xs text-ledger-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-ledger-gold" />
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
                  className={`${fieldInput} font-mono`}
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

            {/* Live receipt preview — the ledger metaphor made literal */}
            <div className="rounded-md border border-dashed border-ledger-border bg-ledger-panel px-4 py-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ledger-text-muted">
                Preview
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ledger-text">
                    {formData.title || "Untitled bounty"}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-ledger-text-muted">
                    {formData.category || "uncategorized"} · {deadlineLabel}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm text-ledger-gold">
                  {formatZec(formData.bountyAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-ledger-border px-6 py-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="h-10 rounded-md border border-ledger-border px-4 font-mono text-sm text-ledger-text-muted transition hover:text-ledger-text disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 items-center gap-2 rounded-md border border-ledger-gold bg-ledger-gold/10 px-4 font-mono text-sm text-ledger-gold transition hover:bg-ledger-gold/20 disabled:opacity-50"
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
