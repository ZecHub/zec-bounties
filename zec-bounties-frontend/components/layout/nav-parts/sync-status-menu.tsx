"use client";

import { Activity, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SyncStatus } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";
import { SyncStatusSummary } from "./sync-status-summary";

export function SyncStatusMenu({
  syncStatus,
  syncStatusError,
  isSyncing,
  onCheckSync,
}: {
  syncStatus: SyncStatus | null;
  syncStatusError: string | null | undefined;
  isSyncing: boolean;
  onCheckSync: () => void;
}) {
  const hasError = !!syncStatusError;
  const pct =
    syncStatus?.percentage_total_blocks_scanned ||
    syncStatus?.percentage_total_outputs_scanned;
  const done = pct === 100 || syncStatus?.in_progress === false;

  const dotClass = hasError
    ? "bg-destructive"
    : done
      ? "bg-emerald-500"
      : syncStatus
        ? "bg-amber-400 animate-pulse"
        : "bg-muted-foreground/30";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 relative"
              aria-label="Sync status"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Activity className="h-4 w-4" />
              )}
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full",
                  dotClass,
                )}
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Sync status
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Sync status</DropdownMenuLabel>
        <div className="px-2 pb-2 text-xs space-y-2">
          {hasError ? (
            <div className="flex items-start gap-1.5 text-destructive font-mono">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{syncStatusError}</span>
            </div>
          ) : (
            <SyncStatusSummary status={syncStatus} />
          )}
        </div>
        <div className="px-2 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs h-8"
            onClick={onCheckSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            Check sync
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
