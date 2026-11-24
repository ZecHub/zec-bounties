const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadCacheWithMock(redisClient) {
  const targetPath = require.resolve("../utils/cache");
  const redisConfigPath = require.resolve("../config/redis");
  delete require.cache[targetPath];

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../config/redis" || Module._resolveFilename(request, parent, isMain) === redisConfigPath) {
      return { redisClient };
    }
    return origLoad.apply(this, arguments);
  };

  try {
    return require(targetPath);
  } finally {
    Module._load = origLoad;
  }
}

test("setCache skips undefined values and invalid TTLs, and floors fractional TTLs", async () => {
  const calls = [];
  const cache = loadCacheWithMock({
    setEx: async (key, ttl, val) => calls.push({ key, ttl, val }),
  });

  await cache.setCache("k1", undefined, 60);
  await cache.setCache("k2", { ok: true }, 0);
  await cache.setCache("k3", { ok: true }, -10);
  await cache.setCache("k4", { ok: true }, Number.NaN);
  await cache.setCache("", { ok: true }, 60);
  assert.equal(calls.length, 0);

  await cache.setCache("k5", { ok: true }, 42.9);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { key: "k5", ttl: 42, val: '{"ok":true}' });
});

test("delCache flattens arrays and filters out empty/non-string keys", async () => {
  const deleted = [];
  const cache = loadCacheWithMock({
    del: async (keys) => deleted.push(keys),
  });

  await cache.delCache(undefined, "", null);
  assert.equal(deleted.length, 0);

  await cache.delCache(["a", "b"], "c", "", null);
  assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0], ["a", "b", "c"]);
});

test("deleteCacheByPattern guards invalid pattern and chunks large keysets", async () => {
  const batches = [];
  const totalKeys = Array.from({ length: 1050 }, (_, i) => `bounty:${i}`);
  const cache = loadCacheWithMock({
    async *scanIterator() {
      yield totalKeys;
    },
    del: async (keys) => batches.push(keys.length),
  });

  await cache.deleteCacheByPattern("");
  await cache.deleteCacheByPattern(null);
  assert.equal(batches.length, 0);

  await cache.deleteCacheByPattern("bounty:*");
  assert.deepEqual(batches, [500, 500, 50]);
});

test("getVersion handles missing, valid, and corrupted non-numeric values without returning NaN", async () => {
  const store = new Map([
    ["v:valid", "17"],
    ["v:corrupt", "not-a-number"],
    ["v:neg", "-5"],
  ]);
  const cache = loadCacheWithMock({
    get: async (k) => (store.has(k) ? store.get(k) : null),
  });

  assert.equal(await cache.getVersion("missing"), 0);
  assert.equal(await cache.getVersion("valid"), 17);

  const corruptVersion = await cache.getVersion("corrupt");
  assert.ok(Number.isInteger(corruptVersion) && corruptVersion > 0);

  const negVersion = await cache.getVersion("neg");
  assert.ok(Number.isInteger(negVersion) && negVersion > 0);
});
