"use client";

import { useZecPrice } from "@/hooks/useZecPrice";
import { cn } from "@/lib/utils";

type ZecToUsdProps = {
  /** Bounty reward amount, in ZEC */
  zecAmount: number;
  /** Show the ZEC amount alongside the USD conversion, e.g. "12.5 ZEC (~$450.00)" */
  showZec?: boolean;
  className?: string;
};

/**
 * Converts a ZEC amount to USD using the live CoinGecko rate.
 * Drop into a bounty card as: <ZecToUsd zecAmount={bounty.rewardAmount} />
 */
export function ZecToUsd({
  zecAmount,
  showZec = true,
  className,
}: ZecToUsdProps) {
  const { price, isLoading, error } = useZecPrice();

  if (isLoading) {
    return (
      <span
        className={cn(
          "inline-block h-4 w-20 animate-pulse rounded bg-muted",
          className,
        )}
      />
    );
  }

  if (error || price === null) {
    // Fail quietly — a missing USD estimate shouldn't block the ZEC amount from rendering
    return showZec ? (
      <span className={cn("text-muted-foreground", className)}>
        {zecAmount} ZEC
      </span>
    ) : null;
  }

  const usdValue = (zecAmount * price).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      {showZec && (
        <span className="font-medium text-foreground">{zecAmount} ZEC</span>
      )}
      {showZec && " "}
      <span>(~{usdValue})</span>
    </span>
  );
}
