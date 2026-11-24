const test = require("node:test");
const assert = require("node:assert/strict");

const store = new Map();
const prismaPath = require.resolve("../prisma/client");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    platformSetting: {
      findMany: async ({ where }) => {
        const keys = where?.key?.in || [];
        return keys
          .filter((k) => store.has(k))
          .map((k) => ({ key: k, value: store.get(k) }));
      },
      upsert: ({ where, update, create }) => ({
        key: where.key,
        value: store.has(where.key) ? update.value : create.value,
      }),
    },
    $transaction: async (ops) => {
      for (const op of ops) {
        store.set(op.key, op.value);
      }
      return ops;
    },
  },
};

const {
  getSuggestionSettings,
  setSuggestionSettings,
  invalidateSuggestionSettingsCache,
  parseThreshold,
  normalizeThreshold,
} = require("../utils/suggestionSettings");

test("parseThreshold preserves explicit zero and valid non-negative integers", () => {
  assert.equal(parseThreshold("0"), 0);
  assert.equal(parseThreshold(" 0 "), 0);
  assert.equal(parseThreshold(0), 0);
  assert.equal(parseThreshold("7"), 7);
  assert.equal(parseThreshold("1000"), 1000);
});

test("parseThreshold falls back to default on missing, negative, or non-integer values", () => {
  assert.equal(parseThreshold(undefined), 5);
  assert.equal(parseThreshold(null), 5);
  assert.equal(parseThreshold(""), 5);
  assert.equal(parseThreshold("   "), 5);
  assert.equal(parseThreshold("-3"), 5);
  assert.equal(parseThreshold("3.5"), 5);
  assert.equal(parseThreshold("3xyz"), 5);
  assert.equal(parseThreshold("Infinity"), 5);
  assert.equal(parseThreshold("not-a-number", 9), 9);
});

test("normalizeThreshold clamps negative, blank, and non-finite inputs to zero", () => {
  assert.equal(normalizeThreshold(0), 0);
  assert.equal(normalizeThreshold("0"), 0);
  assert.equal(normalizeThreshold(7.9), 7);
  assert.equal(normalizeThreshold(-5), 0);
  assert.equal(normalizeThreshold(""), 0);
  assert.equal(normalizeThreshold("   "), 0);
  assert.equal(normalizeThreshold(Infinity), 0);
  assert.equal(normalizeThreshold("Infinity"), 0);
  assert.equal(normalizeThreshold(-Infinity), 0);
  assert.equal(normalizeThreshold(NaN), 0);
});

test("getSuggestionSettings and setSuggestionSettings round-trip zero and reject Infinity", async () => {
  store.clear();
  invalidateSuggestionSettingsCache();

  const savedZero = await setSuggestionSettings({ mode: "threshold", threshold: 0 });
  assert.deepEqual(savedZero, { mode: "threshold", threshold: 0 });
  assert.equal(store.get("suggestionThreshold"), "0");

  const loadedZero = await getSuggestionSettings();
  assert.deepEqual(loadedZero, { mode: "threshold", threshold: 0 });

  const savedInf = await setSuggestionSettings({ mode: "threshold", threshold: Infinity });
  assert.deepEqual(savedInf, { mode: "threshold", threshold: 0 });
  assert.equal(store.get("suggestionThreshold"), "0");
});
