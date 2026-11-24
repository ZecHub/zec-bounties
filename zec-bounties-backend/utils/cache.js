const { redisClient } = require("../config/redis");

// Centralised TTLs — one place to tune them all
const TTL = {
  BOUNTY_LIST: 300, // seconds
  BOUNTY_SINGLE: 120,
  CATEGORIES: 300, // categories change rarely
  USERS: 120,
  ASSIGNEES: 60,
  APPLICATIONS: 30,
  SUBMISSIONS: 300,
  BALANCE: 15,
  ADDRESSES: 120,
};

const DEL_BATCH_SIZE = 500;

// Wrap every cache op so a Redis blip never crashes a request
const getCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis getCache error:", err);
    return null; // fall through to DB
  }
};

const setCache = async (key, value, ttl = TTL.BOUNTY_SINGLE) => {
  try {
    if (!key || typeof key !== "string" || value === undefined) return;
    const ttlSeconds = Math.floor(Number(ttl));
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return;
    await redisClient.setEx(key, ttlSeconds, serialized);
  } catch (err) {
    console.error("Redis setCache error:", err);
    // non-fatal — request still succeeds
  }
};

const delCache = async (...keys) => {
  try {
    const validKeys = keys
      .flat()
      .filter((k) => typeof k === "string" && k.length > 0);
    if (validKeys.length) await redisClient.del(validKeys); // single round-trip
  } catch (err) {
    console.error("Redis delCache error:", err);
  }
};

// SCAN-based pattern delete — never blocks Redis like KEYS does
const deleteCacheByPattern = async (pattern) => {
  try {
    if (!pattern || typeof pattern !== "string") return;
    const keys = [];

    for await (const batch of redisClient.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (Array.isArray(batch)) {
        keys.push(...batch);
      } else if (batch) {
        keys.push(batch);
      }
    }

    for (let i = 0; i < keys.length; i += DEL_BATCH_SIZE) {
      await redisClient.del(keys.slice(i, i + DEL_BATCH_SIZE));
    }
  } catch (err) {
    console.error("Redis deleteCacheByPattern error:", err);
  }
};

// ── Version tags ──────────────────────────────────────────────────────────
// A namespace's version is bumped atomically on every mutation. Readers
// snapshot the version *before* querying the DB and bake it into their cache
// key. A slow request that read stale DB data can only ever write into an
// old version's key — never the one current readers are hitting — so a
// late write can no longer "re-poison" a freshly invalidated cache.
//
// Falls back to Date.now() if Redis is unreachable, so cache keys still
// vary (degrading to effectively-uncached rather than serving something
// that could be permanently stale).
const getVersion = async (namespace) => {
  try {
    const v = await redisClient.get(`v:${namespace}`);
    if (v === null || v === undefined || v === "") return 0;
    const parsed = Number.parseInt(v, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : Date.now();
  } catch (err) {
    console.error("Redis getVersion error:", err);
    return Date.now();
  }
};

const bumpVersion = async (namespace) => {
  try {
    return await redisClient.incr(`v:${namespace}`);
  } catch (err) {
    console.error("Redis bumpVersion error:", err);
    return null;
  }
};

const invalidateUserDirectory = async () => {
  await delCache("users:all", "users:public");
};

module.exports = {
  getCache,
  setCache,
  delCache,
  deleteCacheByPattern,
  getVersion,
  bumpVersion,
  invalidateUserDirectory,
  TTL,
};
