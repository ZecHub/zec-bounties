const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const redisConfigPath = require.resolve("../config/redis.js");

function loadRedisConfigWithFakeClient(fakeClient) {
  const prevConfig = require.cache[redisConfigPath];
  const origLoad = Module._load;
  let capturedOptions = null;

  delete require.cache[redisConfigPath];
  Module._load = function (request, parent, isMain) {
    if (request === "redis") {
      return {
        createClient: (opts) => {
          capturedOptions = opts;
          return fakeClient;
        },
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  let mod;
  try {
    mod = require(redisConfigPath);
  } finally {
    Module._load = origLoad;
  }

  return {
    mod,
    capturedOptions,
    restore() {
      delete require.cache[redisConfigPath];
      if (prevConfig) require.cache[redisConfigPath] = prevConfig;
    },
  };
}

describe("config/redis", () => {
  it("deduplicates concurrent connectRedis calls while connection is in flight", async () => {
    let connectCalls = 0;
    let resolveConnect;
    const fakeClient = {
      isOpen: false,
      on: () => {},
      connect: () => {
        connectCalls += 1;
        return new Promise((resolve) => {
          resolveConnect = () => {
            fakeClient.isOpen = true;
            resolve();
          };
        });
      },
    };

    const { mod, restore } = loadRedisConfigWithFakeClient(fakeClient);
    try {
      const p1 = mod.connectRedis();
      const p2 = mod.connectRedis();
      assert.equal(connectCalls, 1);
      resolveConnect();
      await Promise.all([p1, p2]);

      // Subsequent call after open is a no-op
      await mod.connectRedis();
      assert.equal(connectCalls, 1);
    } finally {
      restore();
    }
  });

  it("allows retry after a failed connectRedis attempt", async () => {
    let connectCalls = 0;
    const fakeClient = {
      isOpen: false,
      on: () => {},
      connect: async () => {
        connectCalls += 1;
        if (connectCalls === 1) {
          throw new Error("ECONNREFUSED");
        }
        fakeClient.isOpen = true;
      },
    };

    const { mod, restore } = loadRedisConfigWithFakeClient(fakeClient);
    try {
      await assert.rejects(() => mod.connectRedis(), /ECONNREFUSED/);
      await mod.connectRedis();
      assert.equal(connectCalls, 2);
      assert.equal(fakeClient.isOpen, true);
    } finally {
      restore();
    }
  });

  it("uses positive bounded backoff in reconnectDelay", () => {
    const fakeClient = { isOpen: false, on: () => {}, connect: async () => {} };
    const { mod, capturedOptions, restore } =
      loadRedisConfigWithFakeClient(fakeClient);
    try {
      assert.equal(capturedOptions.socket.reconnectStrategy, mod.reconnectDelay);
      assert.equal(mod.reconnectDelay(0), 100);
      assert.equal(mod.reconnectDelay(4), 500);
      assert.equal(mod.reconnectDelay(50), 3000);
      assert.equal(mod.reconnectDelay(-5), 100);
      assert.equal(mod.reconnectDelay(Number.NaN), 100);
    } finally {
      restore();
    }
  });
});
