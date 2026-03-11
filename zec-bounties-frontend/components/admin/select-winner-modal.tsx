"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, CheckCircle2, Loader2, Coins } from "lucide-react";
import { Bounty } from "@/lib/types";

interface SelectWinnerModalProps {
  bounty: Bounty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (bountyId: string, winnerId: string) => Promise<void>;
}

export function SelectWinnerModal({
  bounty,
  open,
  onOpenChange,
  onConfirm,
}: SelectWinnerModalProps) {
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!bounty || !selectedWinnerId) return;
    setIsConfirming(true);
    try {
      await onConfirm(bounty.id, selectedWinnerId);
      onOpenChange(false);
      setSelectedWinnerId(null);
    } catch (err) {
      console.error("Failed to mark done with winner:", err);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setSelectedWinnerId(null);
    onOpenChange(open);
  };

  if (!bounty) return null;

  const assignees = bounty.assignees ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold">
            <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-amber-500" />
            </div>
            Select Payment Recipient
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            This bounty has multiple assignees. Choose who receives the{" "}
            <span className="font-semibold text-foreground">
              {bounty.bountyAmount} ZEC
            </span>{" "}
            payment when marked as Done.
          </p>
        </DialogHeader>

        {/* Assignee list */}
        <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {assignees.map((a) => {
            const user = a.user;
            const isSelected = selectedWinnerId === a.userId;

            return (
              <button
                key={a.userId}
                onClick={() => setSelectedWinnerId(a.userId)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                  isSelected
                    ? "border-amber-500 bg-amber-500/8 shadow-sm"
                    : "border-transparent bg-muted/40 hover:bg-muted/70 hover:border-muted-foreground/20"
                }`}
              >
                <Avatar className="h-10 w-10 border-2 border-background shadow-sm flex-shrink-0">
                  <AvatarImage src={user?.avatar || "/placeholder-user.jpg"} />
                  <AvatarFallback className="text-sm font-semibold">
                    {user?.name?.[0] ?? "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {user?.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>

                {/* Selection indicator */}
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected
                      ? "border-amber-500 bg-amber-500"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected preview */}
        {selectedWinnerId && (
          <div className="mx-4 mb-1 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">
                {
                  assignees.find((a) => a.userId === selectedWinnerId)?.user
                    ?.name
                }
              </span>{" "}
              will receive{" "}
              <span className="font-semibold">{bounty.bountyAmount} ZEC</span>
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-4 border-t flex gap-2 bg-muted/20">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            disabled={!selectedWinnerId || isConfirming}
            onClick={handleConfirm}
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            {isConfirming ? "Marking Done…" : "Mark as Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
