/**
 * Rebuild zec_usd_monthly from the ZecHub wiki shielded stats JSON.
 *
 * Source (weekly closes):
 *   https://raw.githubusercontent.com/ZecHub/zechub-wiki/main/public/data/zcash/shieldedStatsJSON.json
 *
 * For each calendar month:
 *   avg_usd   = mean of that month's weekly Closing_Price
 *   close_usd = last weekly Closing_Price in the month
 *   provisional = true if the month is the current calendar month
 *
 * Run on the 1st, or whenever the wiki file is updated:
 *   node scripts/fetch-zec-usd.js
 *
 * Env: DATABASE_URL
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/ZecHub/zechub-wiki/main/public/data/zcash/shieldedStatsJSON.json";

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function parseWikiDate(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseClosingPrice(raw) {
  if (raw === null || raw === undefined || typeof raw === "boolean") {
    return null;
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return null;
  }
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return price;
}

function aggregateMonthlyPrices(rows, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error("expected an array");

  const byMonth = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const price = parseClosingPrice(row.Closing_Price);
    const parsed = parseWikiDate(row.Dates);
    if (price === null || !parsed) continue;
    const key = monthKey(parsed.year, parsed.month - 1);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({ day: parsed.day, price });
  }

  const currentKey = monthKey(now.getUTCFullYear(), now.getUTCMonth());
  const results = [];
  for (const [month, items] of [...byMonth.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    items.sort((a, b) => a.day - b.day);
    const avg = items.reduce((s, i) => s + i.price, 0) / items.length;
    const close = items[items.length - 1].price;
    const provisional = month === currentKey;
    results.push({ month, avg, close, provisional });
  }
  return results;
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`wiki JSON ${res.status}`);
  const rows = await res.json();
  const monthly = aggregateMonthlyPrices(rows);

  const prisma = new PrismaClient();
  try {
    let n = 0;
    for (const { month, avg, close, provisional } of monthly) {
      await prisma.$executeRaw`
        INSERT INTO zec_usd_monthly (month, avg_usd, close_usd, source, provisional, fetched_at)
        VALUES (${month}::date, ${avg}, ${close}, 'zechub-wiki', ${provisional}, now())
        ON CONFLICT (month) DO UPDATE SET
          avg_usd = EXCLUDED.avg_usd,
          close_usd = EXCLUDED.close_usd,
          source = EXCLUDED.source,
          provisional = EXCLUDED.provisional,
          fetched_at = now()
      `;
      n++;
    }
    console.log(`upserted ${n} months from zechub-wiki`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  SOURCE_URL,
  monthKey,
  parseWikiDate,
  parseClosingPrice,
  aggregateMonthlyPrices,
  main,
};
