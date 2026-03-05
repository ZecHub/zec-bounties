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
import { CalendarIcon } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import type { BountyFormData } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
      timeToComplete: new Date(e.target.value),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create & Assign Bounty</DialogTitle>
            <DialogDescription>
              Create a new bounty and assign it directly to a hunter.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-title">Bounty Title</Label>
              <Input
                id="admin-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Enter bounty title..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="admin-category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
                  required
                >
                  <SelectTrigger id="admin-category">
                    <SelectValue placeholder="Select" />
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
              <div className="grid gap-2">
                <Label htmlFor="admin-difficulty">Difficulty</Label>
                <Select required>
                  <SelectTrigger id="admin-difficulty">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="admin-reward">Reward (ZEC)</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="timeToComplete">Completion Deadline</Label>
                <div className="relative">
                  <Input
                    id="timeToComplete"
                    type="datetime-local"
                    value={formData.timeToComplete.toISOString().slice(0, 16)}
                    onChange={handleDateChange}
                    required
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
                className="min-h-[100px]"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assignee">Assign to (Optional)</Label>
              <Select
                value={formData.assignee}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, assignee: value }))
                }
                disabled={usersLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      usersLoading
                        ? "Loading users..."
                        : "Select a user to assign this bounty to..."
                    }
                  />
                  {usersLoading && <Loader2 className="w-4 h-4 animate-spin" />}
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
          <DialogFooter>
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
