const prisma = require("../prisma/client");

const DEFAULT_MODE = "threshold";
const DEFAULT_THRESHOLD = 5;
const VALID_MODES = new Set(["closed", "open", "threshold"]);

let cache = null;
let cacheAt = 0;
const CACHE_MS = 10_000;

function parseThreshold(raw, fallback = DEFAULT_THRESHOLD) {
  if (raw === undefined || raw === null) return fallback;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeThreshold(threshold) {
  if (typeof threshold === "string" && threshold.trim() === "") return 0;
  const num = Number(threshold);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
}

async function loadSettings() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;

  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ["suggestionMode", "suggestionThreshold"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const mode = VALID_MODES.has(map.suggestionMode)
    ? map.suggestionMode
    : DEFAULT_MODE;
  const threshold = parseThreshold(map.suggestionThreshold, DEFAULT_THRESHOLD);

  cache = { mode, threshold };
  cacheAt = now;
  return cache;
}

function invalidateSuggestionSettingsCache() {
  cache = null;
  cacheAt = 0;
}

async function getSuggestionSettings() {
  return loadSettings();
}

async function setSuggestionSettings({ mode, threshold }) {
  if (!VALID_MODES.has(mode)) {
    throw new Error("Invalid suggestion mode");
  }
  const t = normalizeThreshold(threshold);

  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: "suggestionMode" },
      update: { value: mode },
      create: { key: "suggestionMode", value: mode },
    }),
    prisma.platformSetting.upsert({
      where: { key: "suggestionThreshold" },
      update: { value: String(t) },
      create: { key: "suggestionThreshold", value: String(t) },
    }),
  ]);

  invalidateSuggestionSettingsCache();
  return { mode, threshold: t };
}

module.exports = {
  getSuggestionSettings,
  setSuggestionSettings,
  invalidateSuggestionSettingsCache,
  parseThreshold,
  normalizeThreshold,
  VALID_MODES,
};
