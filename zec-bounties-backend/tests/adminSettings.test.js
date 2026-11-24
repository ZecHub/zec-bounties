const test = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function loadAdminSettingsWithStub(stubSettings) {
  const settingsPath = require.resolve("../utils/suggestionSettings");
  const routePath = require.resolve("../routes/adminSettings");
  const originalSettings = require.cache[settingsPath];
  const originalRoute = require.cache[routePath];

  require.cache[settingsPath] = {
    id: settingsPath,
    filename: settingsPath,
    loaded: true,
    exports: stubSettings,
  };
  delete require.cache[routePath];

  const router = require(routePath);
  const cleanup = () => {
    if (originalSettings) {
      require.cache[settingsPath] = originalSettings;
    } else {
      delete require.cache[settingsPath];
    }
    if (originalRoute) {
      require.cache[routePath] = originalRoute;
    } else {
      delete require.cache[routePath];
    }
  };

  return { router, cleanup };
}

function getPatchHandler(router) {
  const layer = router.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === "/suggestion-settings" &&
      entry.route.methods.patch,
  );
  assert.ok(layer, "PATCH /suggestion-settings route must exist");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test("parseThreshold: accepts integers 0..1000 as numbers or digit strings", () => {
  const router = require("../routes/adminSettings");
  assert.equal(router.parseThreshold(0), 0);
  assert.equal(router.parseThreshold(5), 5);
  assert.equal(router.parseThreshold(1000), 1000);
  assert.equal(router.parseThreshold("0"), 0);
  assert.equal(router.parseThreshold(" 42 "), 42);
  assert.equal(router.parseThreshold("1000"), 1000);
});

test("parseThreshold: rejects null, empty strings, booleans, floats, scientific notation, and out-of-range values", () => {
  const router = require("../routes/adminSettings");
  const invalidValues = [
    undefined,
    null,
    "",
    "   ",
    false,
    true,
    1.5,
    "1.5",
    "1e2",
    "+5",
    "-1",
    -1,
    1001,
    "1001",
    NaN,
    Infinity,
    -Infinity,
    {},
    [],
  ];
  for (const val of invalidValues) {
    assert.equal(
      router.parseThreshold(val),
      null,
      `expected ${JSON.stringify(val)} to be rejected`,
    );
  }
});

test("PATCH /suggestion-settings: rejects coerced non-integer thresholds and saves valid integer thresholds", async () => {
  const calls = [];
  const { router, cleanup } = loadAdminSettingsWithStub({
    VALID_MODES: new Set(["closed", "open", "threshold"]),
    getSuggestionSettings: async () => ({ mode: "threshold", threshold: 5 }),
    setSuggestionSettings: async (payload) => {
      calls.push(payload);
      return payload;
    },
  });

  try {
    const patchHandler = getPatchHandler(router);

    for (const badThreshold of [null, "", "  ", false, true, 2.5, -1, 1001]) {
      const res = mockRes();
      await patchHandler(
        { body: { mode: "threshold", threshold: badThreshold } },
        res,
      );
      assert.equal(
        res.statusCode,
        400,
        `expected 400 for threshold=${JSON.stringify(badThreshold)}`,
      );
      assert.deepEqual(res.body, {
        error: "threshold must be an integer 0–1000",
      });
    }
    assert.equal(calls.length, 0);

    const okRes = mockRes();
    await patchHandler({ body: { mode: "threshold", threshold: "25" } }, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.deepEqual(okRes.body, { mode: "threshold", threshold: 25 });
    assert.deepEqual(calls[0], { mode: "threshold", threshold: 25 });

    const openRes = mockRes();
    await patchHandler({ body: { mode: "open", threshold: null } }, openRes);
    assert.equal(openRes.statusCode, 200);
    assert.deepEqual(openRes.body, { mode: "open", threshold: 0 });
  } finally {
    cleanup();
  }
});
