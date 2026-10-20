-- Monthly ZEC/USD derived from zechub-wiki shieldedStatsJSON.json
-- Source: weekly Closing_Price, bucketed by calendar month.
-- avg_usd = mean of weekly closes. close_usd = last weekly close of the month.
-- Current month is provisional until the wiki file advances past month-end.

INSERT INTO zec_usd_monthly (month, avg_usd, close_usd, source, provisional, fetched_at)
VALUES
  ('2024-11-01', 48.55, 52.64, 'zechub-wiki', FALSE, now()),
  ('2024-12-01', 62.50, 60.46, 'zechub-wiki', FALSE, now()),
  ('2025-01-01', 49.44, 44.71, 'zechub-wiki', FALSE, now()),
  ('2025-02-01', 33.89, 35.84, 'zechub-wiki', FALSE, now()),
  ('2025-03-01', 34.50, 37.53, 'zechub-wiki', FALSE, now()),
  ('2025-04-01', 34.30, 32.64, 'zechub-wiki', FALSE, now()),
  ('2025-05-01', 44.10, 54.57, 'zechub-wiki', FALSE, now()),
  ('2025-06-01', 44.73, 40.06, 'zechub-wiki', FALSE, now()),
  ('2025-07-01', 42.11, 41.86, 'zechub-wiki', FALSE, now()),
  ('2025-08-01', 39.20, 40.76, 'zechub-wiki', FALSE, now()),
  ('2025-09-01', 53.37, 62.69, 'zechub-wiki', FALSE, now()),
  ('2025-10-01', 246.89, 325.11, 'zechub-wiki', FALSE, now()),
  ('2025-11-01', 546.76, 427.71, 'zechub-wiki', FALSE, now()),
  ('2025-12-01', 429.47, 529.65, 'zechub-wiki', FALSE, now()),
  ('2026-01-01', 378.90, 305.71, 'zechub-wiki', FALSE, now()),
  ('2026-02-01', 248.84, 213.36, 'zechub-wiki', FALSE, now()),
  ('2026-03-01', 214.98, 214.81, 'zechub-wiki', FALSE, now()),
  ('2026-04-01', 316.06, 355.14, 'zechub-wiki', FALSE, now()),
  ('2026-05-01', 554.46, 568.51, 'zechub-wiki', FALSE, now()),
  ('2026-06-01', 430.99, 375.95, 'zechub-wiki', FALSE, now()),
  ('2026-07-01', 512.72, 507.80, 'zechub-wiki', FALSE, now()),
  ('2026-08-01', 634.94, 834.96, 'zechub-wiki', FALSE, now()),
  ('2026-09-01', 1346.34, 1587.09, 'zechub-wiki', FALSE, now()),
  ('2026-10-01', 1252.14, 1129.42, 'zechub-wiki', TRUE, now())
ON CONFLICT (month) DO UPDATE SET
  avg_usd     = EXCLUDED.avg_usd,
  close_usd   = EXCLUDED.close_usd,
  source      = EXCLUDED.source,
  provisional = EXCLUDED.provisional,
  fetched_at  = now();
