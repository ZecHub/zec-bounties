"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, User, Check } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "CLIENT" | "HUNTER" | "TEAM";

interface WalletSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetRole: Role;
  onConfirm: (selection: { accountName: string; teamId?: string } | null) => void;
}

export function WalletSwitchDialog({
  open,
  onOpenChange,
  targetRole,
  onConfirm,
}: WalletSwitchDialogProps) {
  const { zcashParams, teams } = useBounty();
  const [selected, setSelected] = useState<string | null>(null);

  const personal = zcashParams.filter((p) => !p.isTeam || !p.teamId);
  const teamWallets = zcashParams.filter((p) => p.isTeam && p.teamId);

  const recommendedType = targetRole === "TEAM" ? "team" : "personal";

  const handleConfirm = () => {
    if (!selected) {
      onConfirm(null);
      return;
    }
    const w = zcashParams.find((p) => p.accountName === selected);
    if (!w) {
      onConfirm(null);
      return;
    }
    onConfirm({
      accountName: w.accountName,
      teamId: w.isTeam && w.teamId ? w.teamId : undefined,
    });
  };

  const renderItem = (p: (typeof zcashParams)[number], isTeam: boolean) => {
    const teamName = isTeam
      ? teams.find((t) => t.id === p.teamId)?.name ?? "Team"
      : null;
    const isSelected = selected === p.accountName;
    const isRecommended =
      (recommendedType === "team" && isTeam) ||
      (recommendedType === "personal" && !isTeam);

    return (
      <button
        key={p.accountName + (p.teamId ?? "")}
        type="button"
        onClick={() => setSelected(p.accountName)}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-colors",
          isSelected
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/40",
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            isTeam
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
          )}
        >
          {isTeam ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {p.accountName || "Unnamed"}
            </span>
            {isRecommended && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Suggested
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {isTeam ? `Team · ${teamName}` : "Personal"}
          </span>
        </div>
        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose wallet for {targetRole} mode</DialogTitle>
          <DialogDescription>
            Pick which wallet to activate after switching. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto py-1">
          {personal.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Personal
              </p>
              {personal.map((p) => renderItem(p, false))}
            </div>
          )}
          {teamWallets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Team
              </p>
              {teamWallets.map((p) => renderItem(p, true))}
            </div>
          )}
          {personal.length === 0 && teamWallets.length === 0 && (
            <p className="text-sm text-muted-foreground">No wallets available.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onConfirm(null)}>
            Skip
          </Button>
          <Button onClick={handleConfirm} disabled={!selected && personal.length + teamWallets.length > 0}>
            Use selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
