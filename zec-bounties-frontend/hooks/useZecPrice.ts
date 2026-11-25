"use client";

import { useEffect, useState } from "react";

type PriceSource = {
  name: string;
  url: string;
  parse: (data: any) => number;
};

// Tried in order; first valid price wins.
const PRICE_SOURCES: PriceSource[] = [
  {
    name: "coinbase",
    url: "https://api.exchange.coinbase.com/products/ZEC-USD/ticker",
    parse: (d) => parseFloat(d?.price),
  },
  {
    name: "kraken",
    url: "https://api.kraken.com/0/public/Ticker?pair=ZECUSD",
    parse: (d) => parseFloat(Object.values<any>(d?.result ?? {})[0]?.c?.[0]),
  },
  {
    name: "binance", // USDT, not true USD; blocked in some regions
    url: "https://api.binance.com/api/v3/ticker/price?symbol=ZECUSDT",
    parse: (d) => parseFloat(d?.price),
  },
];

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

type PriceState = {
  price: number | null;
  isLoading: boolean;
  error: string | null;
};

// Module-level cache so every card on the page shares one fetch.
let cachedPrice: number | null = null;
let cachedAt = 0;
let inFlight: Promise<number> | null = null;
const subscribers = new Set<(price: number) => void>();

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
} {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => {} };
  }
  if (typeof AbortController === "undefined") {
    return { signal: undefined, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function fetchFromSources(): Promise<number> {
  for (const source of PRICE_SOURCES) {
    const { signal, cleanup } = createTimeoutSignal(REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(source.url, {
        headers: { accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
      if (!res.ok) continue;
      const price = source.parse(await res.json());
      if (Number.isFinite(price) && price > 0) return price;
    } catch {
      // network/CORS/timeout: try the next source
    } finally {
      cleanup();
    }
  }
  throw new Error("All ZEC price sources failed");
}

export async function fetchZecPrice(): Promise<number> {
  const now = Date.now();

  if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  if (inFlight) return inFlight;

  inFlight = fetchFromSources()
    .then((price) => {
      cachedPrice = price;
      cachedAt = Date.now();
      subscribers.forEach((cb) => cb(price));
      return price;
    })
    .catch((err) => {
      // A stale price is better than an error in the UI.
      if (cachedPrice !== null) return cachedPrice;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function resetZecPriceCache(): void {
  cachedPrice = null;
  cachedAt = 0;
  inFlight = null;
}

export function useZecPrice(): PriceState {
  const [price, setPrice] = useState<number | null>(cachedPrice);
  const [isLoading, setIsLoading] = useState(cachedPrice === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const onUpdate = (p: number) => {
      if (!cancelled) {
        setPrice(p);
        setError(null);
        setIsLoading(false);
      }
    };
    subscribers.add(onUpdate);

    fetchZecPrice()
      .then((p) => {
        if (!cancelled) {
          setPrice(p);
          setError(null);
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
