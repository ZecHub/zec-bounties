"use client";

import { Building2, User } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBounty } from "@/lib/bounty-context";

export function ActiveWalletTypePill({
  label,
  isTeam: isTeamOverride,
}: {
  /** Display name override, e.g. the team name on the team console. */
  label?: string;
  /** Force team styling regardless of the default wallet. */
  isTeam?: boolean;
}) {
  const { zcashParams, currentTeam } = useBounty();
  if (!zcashParams || zcashParams.length === 0) return null;
  const active =
    zcashParams.find((p) => p.isDefault) ?? zcashParams[zcashParams.length - 1];
  if (!active) return null;

  const isTeam = isTeamOverride ?? !!(active.isTeam && active.teamId);
  const teamName = label ?? (isTeam && currentTeam ? currentTeam.name : null);
  const accountLabel = active.accountName || "Wallet";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold cursor-default select-none transition-colors",
            isTeam
              ? "text-violet-700 dark:text-violet-300"
              : "text-sky-700 dark:text-sky-300",
          )}
        >
          {isTeam ? (
            <Building2 className="h-3 w-3 shrink-0" />
          ) : (
            <User className="h-3 w-3 shrink-0" />
          )}
          <span className="hidden 2xl:inline">
            {isTeam ? (teamName ?? "Team") : accountLabel}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-[200px]">
        <p className="font-semibold mb-0.5">
          {isTeam ? "Team wallet" : "Personal wallet"}
        </p>
        {!label && <p className="text-muted-foreground">{accountLabel}</p>}
        {teamName && <p className="text-muted-foreground">Team: {teamName}</p>}
        <p className="text-muted-foreground capitalize">
          {active.chain ?? "mainnet"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
