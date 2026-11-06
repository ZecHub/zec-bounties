"use client";

import { RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Balance } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActiveWalletTypePill } from "./active-wallet-type-pill";
import { confirmedTotal, fmt } from "./wallet-utils";

export function WalletBalanceGroup({
  balance,
  label,
  isTeam,
  isRefreshing,
  onOpen,
  onRefresh,
}: {
  balance: Balance | undefined | null;
  label?: string;
  isTeam?: boolean;
  isRefreshing: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 pl-1 pr-0.5 py-0.5 rounded-lg border bg-muted/30">
      <ActiveWalletTypePill label={label} isTeam={isTeam} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className="gap-2 h-8 text-xs font-mono"
            onClick={onOpen}
          >
            <Wallet className="h-4 w-4" />
            {balance ? `${fmt(confirmedTotal(balance))} ZEC` : `0.0000 ZEC`}
          </Button>
        </TooltipTrigger>
        {balance && (
          <TooltipContent
            side="bottom"
            className="text-xs space-y-1.5 min-w-[180px]"
          >
            <p className="font-semibold text-foreground mb-1">
              Confirmed balances
            </p>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ironwood</span>
              <span className="font-mono">
                {fmt(
                  (balance.confirmed_ironwood_balance ??
                    balance.confirmed_orchard_balance ??
                    0) / 1e8,
                )}{" "}
                ZEC
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Sapling</span>
              <span className="font-mono">
                {fmt(balance.confirmed_sapling_balance / 1e8)} ZEC
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Transparent</span>
              <span className="font-mono">
                {fmt(balance.confirmed_transparent_balance / 1e8)} ZEC
              </span>
            </div>
            <div className="border-t pt-1 flex justify-between gap-4 font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {fmt(confirmedTotal(balance))} ZEC
              </span>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 w-8"
          >
            <RefreshCw
              className={cn("w-4 h-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Refresh balance
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
