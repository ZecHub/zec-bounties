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
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error("Redis setCache error:", err);
    // non-fatal — request still succeeds
  }
};

const delCache = async (...keys) => {
  try {
    if (keys.length) await redisClient.del(...keys); // single round-trip
  } catch (err) {
    console.error("Redis delCache error:", err);
  }
};

// SCAN-based pattern delete — never blocks Redis like KEYS does
const deleteCacheByPattern = async (pattern) => {
  try {
    const keys = [];

    for await (const batch of redisClient.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (Array.isArray(batch)) {
        keys.push(...batch);
      } else {
        keys.push(batch);
      }
    }

    if (keys.length > 0) {
      await redisClient.del(...keys);
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
    return v ? parseInt(v, 10) : 0;
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

module.exports = {
  getCache,
  setCache,
  delCache,
  deleteCacheByPattern,
  getVersion,
  bumpVersion,
  TTL,
};
