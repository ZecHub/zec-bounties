"use client";

import type React from "react";
import { useState } from "react";
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
import { DUMMY_USERS } from "@/lib/data";
import { REPOS } from "@/lib/repos";
import { RepoMenuLabel } from "@/components/repo-filter";
import { CalendarIcon } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import type { BountyFormData } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toDateInputValue, parseDateInputValue } from "@/lib/utils";
import { RewardAmountHint } from "@/components/reward-amount-hint";

interface CreateBountyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminBountyModal({
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
    categories,
    currentUser,
  } = useBounty();
  const [formData, setFormData] = useState<BountyFormData>({
    title: "",
    description: "",
    assignee: "none",
    bountyAmount: 0,
    timeToComplete: new Date(),
    category: "",
    targetRepo: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState("unassigned");
  const hunters = DUMMY_USERS.filter((u) => u.type === "hunter");
  const availableUsers = nonAdminUsers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Title is required", {
        description: "Please enter a title for the bounty.",
      });
      return;
    }
    if (!formData.category) {
      toast.error("Category is required", {
        description: "Please select a category.",
      });
      return;
    }
    if (!formData.bountyAmount || formData.bountyAmount <= 0) {
      toast.error("Invalid reward amount", {
        description: "Please enter a reward amount greater than 0.",
      });
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required", {
        description: "Please describe the bounty requirements.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await createBounty(formData);
      toast.success("Bounty created!", {
        description: `"${formData.title}" has been created`,
      });
      setFormData({
        title: "",
        description: "",
        assignee: "none",
        bountyAmount: 0,
        timeToComplete: new Date(),
        category: "",
    targetRepo: "",
      });
      onSuccess?.();
      onOpenChange(false);
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
      {/*
        - max-w-[calc(100%-2rem)] keeps a side margin on small screens.
          (We deliberately avoid `sm:` here because your `sm` is 300px,
          which would override that margin on nearly every phone.)
        - md:max-w-[600px] applies the desktop width from 768px up.
        - max-h-[90dvh] + flex-col + overflow-hidden => only the body scrolls.
      */}
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-h-[90dvh] w-full max-w-[calc(100%-2rem)] md:max-w-[600px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="px-4 pt-6 pb-2 text-left sam:px-6">
            <DialogTitle>Create & Assign Bounty</DialogTitle>
            <DialogDescription>
              Create a new bounty and assign it directly to a hunter.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sam:px-6">
            <div className="grid gap-2">
              <Label htmlFor="admin-title">Bounty Title</Label>
              <Input
                id="admin-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Enter bounty title..."
                autoComplete="off"
                required
              />
            </div>

            {/* Stacks on narrow screens, 3 columns from `imd` (725px) up */}
            <div className="grid grid-cols-1 gap-4 imd:grid-cols-3">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="admin-category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
                  required
                >
                  <SelectTrigger id="admin-category" className="w-full min-w-0">
                    <SelectValue placeholder="Select" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.name} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="admin-repo">Repository</Label>
                <Select
                  value={formData.targetRepo || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      targetRepo: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger id="admin-repo" className="w-full min-w-0">
                    <SelectValue placeholder="Select" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {REPOS.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        <RepoMenuLabel repoId={repo.id} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="admin-difficulty">Difficulty</Label>
                <Select required>
                  <SelectTrigger
                    id="admin-difficulty"
                    className="w-full min-w-0"
                  >
                    <SelectValue placeholder="Select" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="admin-chain">Network</Label>
                <Select
                  required
                  value={formData.chain}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      chain: value as "MAIN" | "TEST",
                    }))
                  }
                >
                  <SelectTrigger id="admin-chain" className="w-full min-w-0">
                    <SelectValue placeholder="Select" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEST">Testnet</SelectItem>
                    <SelectItem value="MAIN">Mainnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stacks below `sam` (365px), 2 columns above */}
            <div className="grid grid-cols-1 gap-4 sam:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="admin-reward">Reward (ZEC)</Label>
                  <RewardAmountHint />
                </div>
                <Input
                  id="admin-reward"
                  type="number"
                  value={formData.bountyAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      bountyAmount: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="timeToComplete">Completion Deadline</Label>
                <div className="relative">
                  <Input
                    id="timeToComplete"
                    type="date"
                    min={toDateInputValue(new Date())}
                    value={toDateInputValue(formData.timeToComplete)}
                    onChange={handleDateChange}
                    required
                  />
                  <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-description">Description</Label>
              <Textarea
                id="admin-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe the bounty requirements, deliverables, and any specific instructions..."
                className="min-h-[100px] max-h-[300px] resize-y"
                required
              />
            </div>

            <div className="grid min-w-0 gap-2">
              <Label htmlFor="assignee">Assign to (Optional)</Label>
              <Select
                value={formData.assignee}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, assignee: value }))
                }
                disabled={usersLoading}
              >
                <SelectTrigger id="assignee" className="w-full min-w-0">
                  <SelectValue
                    className="truncate"
                    placeholder={
                      usersLoading
                        ? "Loading users..."
                        : "Select a user to assign this bounty to..."
                    }
                  />
                  {usersLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assignment</SelectItem>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                  {availableUsers.length === 0 && !usersLoading && (
                    <SelectItem value="no-users" disabled>
                      No users available for assignment
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {usersLoading && (
                <p className="text-sm text-slate-500">
                  Loading available users...
                </p>
              )}
            </div>
          </div>

          {/* Pinned footer: always visible */}
          <DialogFooter className="flex-col-reverse gap-2 border-t px-4 py-4 sam:flex-row sam:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Bounty"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
