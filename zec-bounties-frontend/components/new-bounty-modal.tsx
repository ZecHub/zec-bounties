"use client";

import type React from "react";

import { useRef, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toDateInputValue, parseDateInputValue } from "@/lib/utils";

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
};

export function NewBountyModal({
  onSuccess,
  onCancel,
  open,
  onOpenChange,
}: CreateBountyFormProps) {
  const {
    createBounty,
    users,
    nonAdminUsers,
    usersLoading,
    currentUser,
    categories,
  } = useBounty();
  const [formData, setFormData] = useState<BountyFormData>({
    title: "",
    description: "",
    assignee: "none",
    bountyAmount: 0,
    timeToComplete: new Date(),
    category: "",
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

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

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
        "Please correct the highlighted fields before continuing."
      );

      requestAnimationFrame(() => {
        document.getElementById(firstInvalid)?.focus();
      });

      return false;
    }

    setErrorSummary("");
    return true;
  };

  // Users are already filtered to exclude admins in the context
  const availableUsers = nonAdminUsers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await createBounty(formData);
      toast.success("Bounty created!", {
        description: `"${formData.title}" is now live.`,
      });
      onSuccess?.();
      setFormData({
        title: "",
        description: "",
        assignee: "none",
        bountyAmount: 0,
        timeToComplete: new Date(),
        category: "",
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
        className="sm:max-w-[500px]"
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
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Create New Bounty</DialogTitle>
            <DialogDescription>
              Provide the details for your technical challenge.
            </DialogDescription>
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

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Bounty Title</Label>
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
              />
              {fieldErrors.title && (
                <p id="title-error" className="text-sm text-destructive">
                  {fieldErrors.title}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
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
                    aria-invalid={Boolean(fieldErrors.category)}
                    aria-describedby={
                      fieldErrors.category ? "category-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Select" />
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
              <div className="grid gap-2">
                <Label htmlFor="reward">Reward (ZEC)</Label>
                <Input
                  id="reward"
                  type="number"
                  step="any"
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
                  aria-describedby={fieldErrors.reward ? "reward-error" : undefined}
                  required
                />
                {fieldErrors.reward && (
                  <p id="reward-error" className="text-sm text-destructive">
                    {fieldErrors.reward}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="timeToComplete">Time to Complete</Label>
              <Input
                id="timeToComplete"
                type="date"
                min={toDateInputValue(new Date())}
                value={toDateInputValue(formData.timeToComplete)}
                onChange={handleDateChange}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
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
                className="min-h-[100px]"
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
          <DialogFooter>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
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
