// Live ZEC/USD quote for USD-tracked bounty payouts.
//
// Mirrors the frontend hook: Coinbase, then Kraken, then Binance, first valid
// price wins. The last successful quote is persisted so a payout round can
// still open (with a stale warning) when every source is temporarily down.
const prisma = require("../prisma/client");

const CACHE_TTL_MS = Number(process.env.ZEC_USD_CACHE_TTL_MS || 60_000);
const REQUEST_TIMEOUT_MS = Number(process.env.ZEC_USD_TIMEOUT_MS || 5_000);
const SETTING_KEY = "zec_usd:last_quote";

const SOURCES = [
  {
    name: "coinbase",
    url: "https://api.exchange.coinbase.com/products/ZEC-USD/ticker",
    parse: (d) => parseFloat(d?.price),
  },
  {
    name: "kraken",
    url: "https://api.kraken.com/0/public/Ticker?pair=ZECUSD",
    parse: (d) => parseFloat(Object.values(d?.result ?? {})[0]?.c?.[0]),
  },
  {
    name: "binance",
    url: "https://api.binance.com/api/v3/ticker/price?symbol=ZECUSDT",
    parse: (d) => parseFloat(d?.price),
  },
];

let cached = null;
let cachedAt = 0;

function normalize(quote) {
  return {
    rate: Number(quote.rate),
    source: quote.source || "unknown",
    quotedAt: new Date(quote.quotedAt || Date.now()).toISOString(),
    stale: Boolean(quote.stale),
  };
}

async function fetchLive() {
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const rate = source.parse(await res.json());
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, source: source.name, quotedAt: new Date().toISOString(), stale: false };
      }
    } catch {
      // Network/CORS/timeout: try the next source.
    }
  }
  return null;
}

async function readPersisted() {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value);
    if (!Number.isFinite(Number(parsed.rate)) || Number(parsed.rate) <= 0) return null;
    return normalize({ ...parsed, stale: true });
  } catch {
    return null;
  }
}

async function persist(quote) {
  try {
    const value = JSON.stringify(quote);
    await prisma.platformSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value },
      update: { value },
    });
  } catch {
    // A failed write must not break a payout quote; memory cache still works.
  }
}

async function getZecUsdQuote({ allowStale = true } = {}) {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return normalize(cached);

  const live = await fetchLive();
  if (live) {
    cached = live;
    cachedAt = now;
    await persist(live);
    return normalize(live);
  }

  if (cached) return normalize({ ...cached, stale: true });

  if (allowStale) {
    const persisted = await readPersisted();
    if (persisted) {
      cached = persisted;
      cachedAt = now;
      return persisted;
    }
  }

  const err = new Error("No ZEC/USD price available");
  err.status = 503;
  throw err;
}

function clearQuoteCache() {
  cached = null;
  cachedAt = 0;
}

// USD value for a ZEC amount, rounded to cents so the snapshot is stable.
function usdValueForZec(zecAmount, rate) {
  return Math.round(Number(zecAmount) * Number(rate) * 100) / 100;
}

module.exports = {
  getZecUsdQuote,
  clearQuoteCache,
  usdValueForZec,
  SOURCES,
  SETTING_KEY,
};
