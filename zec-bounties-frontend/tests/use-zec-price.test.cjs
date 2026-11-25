const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadUseZecPrice({ fetchImpl, abortSignalImpl = AbortSignal, nowFn } = {}) {
  const filename = path.resolve(__dirname, "..", "hooks/useZecPrice.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "react") {
      return {
        useState: (v) => [v, () => {}],
        useEffect: () => {},
      };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  };
  const DateShim = nowFn
    ? Object.assign(function (...args) { return new Date(...args); }, { now: nowFn })
    : Date;
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      require: customRequire,
      fetch: fetchImpl,
      AbortSignal: abortSignalImpl,
      AbortController,
      setTimeout,
      clearTimeout,
      Date: DateShim,
    },
    { filename },
  );
  return mod.exports;
}

test("fetchZecPrice falls back across sources when earlier sources fail or return invalid prices", async () => {
  const urls = [];
  const { fetchZecPrice, resetZecPriceCache } = loadUseZecPrice({
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes("coinbase")) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      if (url.includes("kraken")) {
        return { ok: true, status: 200, json: async () => ({ result: { XZECZUSD: { c: ["-5"] } } }) };
      }
      return { ok: true, status: 200, json: async () => ({ price: "42.75" }) };
    },
  });

  resetZecPriceCache();
  const price = await fetchZecPrice();
  assert.equal(price, 42.75);
  assert.equal(urls.length, 3);
  assert.match(urls[0], /coinbase/);
  assert.match(urls[1], /kraken/);
  assert.match(urls[2], /binance/);
});

test("fetchZecPrice falls back to AbortController when AbortSignal.timeout is unavailable", async () => {
  const receivedSignals = [];
  const { fetchZecPrice, resetZecPriceCache } = loadUseZecPrice({
    abortSignalImpl: {},
    fetchImpl: async (_url, init) => {
      receivedSignals.push(init.signal);
      return { ok: true, status: 200, json: async () => ({ price: "55.25" }) };
    },
  });

  resetZecPriceCache();
  const price = await fetchZecPrice();
  assert.equal(price, 55.25);
  assert.equal(receivedSignals.length, 1);
  assert.ok(receivedSignals[0] instanceof AbortSignal);
  assert.equal(receivedSignals[0].aborted, false);
});

test("fetchZecPrice deduplicates concurrent calls, caches within TTL, and serves stale price on refresh failure", async () => {
  let now = 1_000_000;
  let calls = 0;
  let failAll = false;

  const { fetchZecPrice, resetZecPriceCache } = loadUseZecPrice({
    nowFn: () => now,
    fetchImpl: async () => {
      calls += 1;
      if (failAll) {
        throw new Error("network down");
      }
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, status: 200, json: async () => ({ price: "61.50" }) };
    },
  });

  resetZecPriceCache();
  const [p1, p2] = await Promise.all([fetchZecPrice(), fetchZecPrice()]);
  assert.equal(p1, 61.5);
  assert.equal(p2, 61.5);
  assert.equal(calls, 1);

  // Within 60s TTL -> cached
  now += 30_000;
  assert.equal(await fetchZecPrice(), 61.5);
  assert.equal(calls, 1);

  // After TTL expiry, if all sources fail, return stale cached price
  now += 40_000;
  failAll = true;
  assert.equal(await fetchZecPrice(), 61.5);
  assert.equal(calls, 4); // 1 initial + 3 failed sources
});
