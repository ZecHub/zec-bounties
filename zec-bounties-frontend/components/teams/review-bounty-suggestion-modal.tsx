"use client";

import { useEffect, useState } from "react";
import type { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ReviewBountySuggestionModalProps {
  bounty: Bounty | null;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewBountySuggestionModal({
  bounty,
  teamId,
  open,
  onOpenChange,
}: ReviewBountySuggestionModalProps) {
  const { reviewBountySuggestion, fetchTeamBounties } = useBounty();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!bounty || !open) return;
    setTitle(bounty.title);
    setDescription(bounty.description);
    setBountyAmount(String(bounty.bountyAmount));
    const dueDate = new Date(bounty.timeToComplete);
    setDeadline(
      Number.isNaN(dueDate.getTime()) ? "" : dueDate.toISOString().slice(0, 10),
    );
    setReason("");
  }, [bounty, open]);

  if (!bounty) return null;

  const submitReview = async (action: "approve" | "edit" | "decline") => {
    if (!reason.trim()) {
      toast.error("Add a short reason for this decision.");
      return;
    }

    setIsSaving(true);
    try {
      await reviewBountySuggestion(bounty.id, {
        action,
        reason,
        ...(action === "edit" && {
          title,
          description,
          bountyAmount: Number(bountyAmount),
          timeToComplete: new Date(`${deadline}T23:59:59`),
        }),
      });
      await fetchTeamBounties(teamId);
      toast.success(
        action === "approve"
          ? "Suggestion approved"
          : action === "decline"
            ? "Suggestion declined"
            : "Suggestion edits saved",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to review suggestion",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review bounty suggestion</DialogTitle>
          <p className="text-sm text-muted-foreground">{bounty.title}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suggestion-title">Title</Label>
              <Input id="suggestion-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suggestion-reward">Reward (ZEC)</Label>
              <Input
                id="suggestion-reward"
                type="number"
                min="0"
                step="0.0001"
                value={bountyAmount}
                onChange={(event) => setBountyAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="suggestion-description">Description</Label>
            <Textarea
              id="suggestion-description"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="suggestion-deadline">Deadline</Label>
            <Input
              id="suggestion-deadline"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="suggestion-review-reason">Reason shown to the hunter</Label>
            <Textarea
              id="suggestion-review-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Briefly explain the decision or requested changes."
            />
            <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="destructive" disabled={isSaving} onClick={() => submitReview("decline")}>
            Decline
          </Button>
          <Button variant="outline" disabled={isSaving} onClick={() => submitReview("edit")}>
            Save edits
          </Button>
          <Button disabled={isSaving} onClick={() => submitReview("approve")}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}