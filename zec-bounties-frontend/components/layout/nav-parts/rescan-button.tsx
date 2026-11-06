"use client";

import { useState } from "react";
import { FolderSync, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RescanButton({
  rescanStatus,
  rescanLoading,
  rescanHidden,
  onRescan,
}: {
  rescanStatus: unknown;
  rescanLoading: boolean;
  rescanHidden: boolean;
  onRescan: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dotClass = rescanLoading
    ? "bg-amber-400 animate-pulse"
    : rescanStatus
      ? "bg-emerald-500"
      : "bg-muted-foreground/30";

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 relative",
                rescanHidden && "opacity-40 cursor-not-allowed",
              )}
              disabled={rescanLoading || rescanHidden}
              aria-label="Rescan wallet"
            >
              {rescanLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderSync className="h-4 w-4" />
              )}
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full",
                  dotClass,
                )}
              />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[200px]">
          <p>
            {rescanHidden
              ? "Rescan available soon..."
              : "Rescan wallet — resets balance to 0 and rescans the chain"}
          </p>
          {!!rescanStatus && !rescanLoading && (
            <p className="mt-1 text-muted-foreground font-mono break-words">
              {typeof rescanStatus === "string"
                ? rescanStatus
                : JSON.stringify(rescanStatus)}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rescan wallet?</AlertDialogTitle>
          <AlertDialogDescription>
            This resets your wallet balance to 0 and rescans the chain from
            scratch. Your balance will show 0 until the rescan finishes — this
            can take a while.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmOpen(false);
              onRescan();
            }}
          >
            Rescan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
