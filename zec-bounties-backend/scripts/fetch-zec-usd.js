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

const { PrismaClient } = require("@prisma/client");

const SOURCE_URL =
  "https://raw.githubusercontent.com/ZecHub/zechub-wiki/main/public/data/zcash/shieldedStatsJSON.json";

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`wiki JSON ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("expected an array");

  const byMonth = new Map();
  for (const row of rows) {
    const price = Number(row.Closing_Price);
    if (!row.Dates || !Number.isFinite(price)) continue;
    const [y, m, d] = row.Dates.split("/").map((n) => parseInt(n, 10));
    if (!y || !m) continue;
    const key = monthKey(y, m - 1);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({ day: d, price });
  }

  const now = new Date();
  const currentKey = monthKey(now.getUTCFullYear(), now.getUTCMonth());

  const prisma = new PrismaClient();
  try {
    let n = 0;
    for (const [month, items] of [...byMonth.entries()].sort()) {
      const avg = items.reduce((s, i) => s + i.price, 0) / items.length;
      const close = items[items.length - 1].price;
      const provisional = month === currentKey;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
