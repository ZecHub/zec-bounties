"use client";

import { useEffect, useState } from "react";
import { useBounty } from "@/lib/bounty-context";
import type { Team } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface CreateTeamPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the team is created, with the new team. */
  onSuccess?: (team: Team) => void;
}

export function CreateTeamPanel({
  open,
  onOpenChange,
  onSuccess,
}: CreateTeamPanelProps) {
  const { createTeam } = useBounty();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setTwitterUrl("");
    setDiscordUrl("");
    setAdditionalLinks([""]);
    setError(null);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const updateLink = (index: number, value: string) => {
    setAdditionalLinks((prev) => prev.map((l, i) => (i === index ? value : l)));
  };

  const addLinkField = () => setAdditionalLinks((prev) => [...prev, ""]);

  const removeLinkField = (index: number) =>
    setAdditionalLinks((prev) => prev.filter((_, i) => i !== index));

  const handleCreate = async () => {
    if (submitting || !name.trim()) return;
    if (!twitterUrl.trim() || !discordUrl.trim()) {
      setError("Twitter and Discord links are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const team = await createTeam({
        name: name.trim(),
        description: description.trim() || undefined,
        twitterUrl: twitterUrl.trim(),
        discordUrl: discordUrl.trim(),
        additionalLinks: additionalLinks.map((l) => l.trim()).filter(Boolean),
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">
              Team name
            </Label>
            <input
              id="team-name"
              type="text"
              placeholder="e.g. Orchard Collective"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs">
              Description
            </Label>
            <textarea
              id="team-description"
              placeholder="What does this team work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-twitter" className="text-xs">
              Twitter / X link <span className="text-red-500">*</span>
            </Label>
            <input
              id="team-twitter"
              type="url"
              placeholder="https://x.com/yourteam"
              value={twitterUrl}
              onChange={(e) => setTwitterUrl(e.target.value)}
              disabled={submitting}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-discord" className="text-xs">
              Discord link <span className="text-red-500">*</span>
            </Label>
            <input
              id="team-discord"
              type="url"
              placeholder="https://discord.gg/yourteam"
              value={discordUrl}
              onChange={(e) => setDiscordUrl(e.target.value)}
              disabled={submitting}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Additional links</Label>
              <button
                type="button"
                onClick={addLinkField}
                disabled={submitting}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Add link
              </button>
            </div>
            {additionalLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://..."
                  value={link}
                  onChange={(e) => updateLink(i, e.target.value)}
                  disabled={submitting}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                {additionalLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLinkField(i)}
                    disabled={submitting}
                    className="shrink-0 px-2 text-sm text-muted-foreground hover:text-red-500 disabled:opacity-50"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || submitting}>
            {submitting ? "Creating..." : "Create team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
