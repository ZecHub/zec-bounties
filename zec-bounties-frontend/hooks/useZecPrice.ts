"use client";

import { useEffect, useState } from "react";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";

const CACHE_TTL_MS = 60_000; // CoinGecko's free tier rate-limits aggressively; 60s is a safe floor

type PriceState = {
  price: number | null;
  isLoading: boolean;
  error: string | null;
};

// Module-level cache so every card on the page shares one fetch instead of
// each ZecToUsd instance hitting CoinGecko independently.
let cachedPrice: number | null = null;
let cachedAt = 0;
let inFlight: Promise<number> | null = null;
const subscribers = new Set<(price: number) => void>();

async function fetchZecPrice(): Promise<number> {
  const now = Date.now();

  if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetch(COINGECKO_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
      return res.json();
    })
    .then((data: { zcash?: { usd?: number } }) => {
      const price = data?.zcash?.usd;
      if (typeof price !== "number")
        throw new Error("Unexpected CoinGecko response shape");
      cachedPrice = price;
      cachedAt = Date.now();
      subscribers.forEach((cb) => cb(price));
      return price;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Returns the live ZEC→USD rate, shared and cached across all consumers.
 * Safe to call from many bounty cards on the same page without spamming
 * CoinGecko — only one network request goes out per CACHE_TTL_MS window.
 */
export function useZecPrice(): PriceState {
  const [price, setPrice] = useState<number | null>(cachedPrice);
  const [isLoading, setIsLoading] = useState(cachedPrice === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const onUpdate = (p: number) => {
      if (!cancelled) setPrice(p);
    };
    subscribers.add(onUpdate);

    fetchZecPrice()
      .then((p) => {
        if (!cancelled) {
          setPrice(p);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch ZEC price",
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      subscribers.delete(onUpdate);
    };
  }, []);

  return { price, isLoading, error };
}
