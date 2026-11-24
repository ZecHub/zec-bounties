"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBounty } from "@/lib/bounty-context";
import { displayName } from "@/lib/displayName";
import type { Bounty, WorkSubmission } from "@/lib/types";
import { parseLinks } from "@/lib/links";

interface SubmitOnBehalfModalProps {
  bounty: Bounty | null;
  submission?: WorkSubmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const MAX_LINKS = 5;

const isValidUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export function SubmitOnBehalfModal({
  bounty,
  open,
  onOpenChange,
  submission,
  onSaved,
}: SubmitOnBehalfModalProps) {
  const { submitWork, editSubmission } = useBounty();
  const isEdit = !!submission;

  const [assigneeId, setAssigneeId] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  // Assignee join table first, legacy single `assignee` as fallback
  // (same precedence the dashboard uses elsewhere). When editing an existing
  // submission whose submitter is no longer listed as an assignee, keep that
  // submitter in the options so the disabled select still displays them.
  const candidates = useMemo(() => {
    const list: Array<{ id: string; user: Bounty["assigneeUser"] }> = [];
    if (bounty?.assignees?.length) {
      for (const a of bounty.assignees) {
        list.push({ id: a.userId, user: a.user });
      }
    } else if (bounty?.assignee && bounty.assigneeUser) {
      list.push({ id: bounty.assignee, user: bounty.assigneeUser });
    }
    if (
      submission &&
      !list.some((candidate) => candidate.id === submission.submittedBy)
    ) {
      list.push({
        id: submission.submittedBy,
        user: submission.submitterUser ?? {
          id: submission.submittedBy,
          name: submission.submittedBy,
          email: "",
          role: "HUNTER",
        },
      });
    }
    return list;
  }, [bounty, submission]);

  // Reset the form each time the dialog opens for a bounty.
  useEffect(() => {
    if (!open || !bounty) return;
    if (submission) {
      const existing = parseLinks(submission.deliverableUrl);
      setAssigneeId(submission.submittedBy);
      setDescription(submission.description);
      setLinks(existing.length ? existing : [""]);
    } else {
      setAssigneeId(candidates.length === 1 ? candidates[0].id : "");
      setDescription("");
      setLinks([""]);
    }
  }, [open, bounty?.id, submission?.id]);

  const cleanedLinks = links.map((l) => l.trim()).filter(Boolean);
  const hasInvalidLink = cleanedLinks.some((l) => !isValidUrl(l));

  const updateLink = (index: number, value: string) =>
    setLinks((prev) => prev.map((l, i) => (i === index ? value : l)));
  const addLink = () =>
    setLinks((prev) => (prev.length < MAX_LINKS ? [...prev, ""] : prev));
  const removeLink = (index: number) =>
    setLinks((prev) =>
      prev.length === 1 ? [""] : prev.filter((_, i) => i !== index),
    );

  const canSubmit =
    !submitting && !!assigneeId && !!description.trim() && !hasInvalidLink;

  const handleSubmit = async () => {
    if (!bounty || !canSubmit) return;
    setSubmitting(true);
    try {
      const deliverableUrl = cleanedLinks.length
        ? cleanedLinks.join("\n")
        : undefined;
      if (submission) {
        await editSubmission(submission.id, {
          description: description.trim(),
          deliverableUrl,
        });
        toast.success("Submission updated");
      } else {
        await submitWork(bounty.id, {
          description: description.trim(),
          deliverableUrl,
          onBehalfOf: assigneeId,
        });
        toast.success("Work submitted on behalf of assignee");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit work");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEdit ? "Edit submission" : "Submit on behalf of assignee"}
          </DialogTitle>
          {bounty && (
            <p className="text-xs text-muted-foreground">{bounty.title}</p>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="proxy-assignee" className="text-xs">
              Assignee
            </Label>
            <select
              id="proxy-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={isEdit}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select assignee…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayName(c.user)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proxy-desc" className="text-xs">
              Work description
            </Label>
            <Textarea
              id="proxy-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proxy-url-0" className="text-xs">
              Deliverable links{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            {links.map((link, i) => {
              const invalid = link.trim() !== "" && !isValidUrl(link.trim());
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    id={`proxy-url-${i}`}
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={link}
                    onChange={(e) => updateLink(i, e.target.value)}
                    aria-invalid={invalid}
                    className={`h-9 w-full rounded-md border bg-background px-2 text-sm ${
                      invalid ? "border-destructive" : ""
                    }`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => removeLink(i)}
                    aria-label={`Remove link ${i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {hasInvalidLink && (
              <p className="text-[11px] text-destructive">
                Links must start with http:// or https://
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={addLink}
              disabled={links.length >= MAX_LINKS}
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </Button>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Submit work"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
