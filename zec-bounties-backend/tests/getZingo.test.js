const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("events");
const Module = require("module");
const path = require("path");

function loadWithFakeZingo() {
  const created = [];
  class FakeZingoProcess {
    constructor(opts) {
      this.opts = opts;
      this.exited = false;
      this.destroyed = false;
      this.proc = new EventEmitter();
      this.proc.killed = false;
      created.push(this);
    }
    destroy() {
      this.destroyed = true;
      this.exited = true;
      if (this.proc) {
        this.proc.killed = true;
        this.proc.emit("exit", 0);
      }
    }
  }

  const getZingoPath = require.resolve("../utils/zingo/getZingo");
  const zingoProcPath = require.resolve("../utils/zingo/ZingoProcess");
  const savedGetZingo = require.cache[getZingoPath];
  const savedZingoProc = require.cache[zingoProcPath];

  require.cache[zingoProcPath] = {
    id: zingoProcPath,
    filename: zingoProcPath,
    loaded: true,
    exports: FakeZingoProcess,
  };
  delete require.cache[getZingoPath];

  const mod = require(getZingoPath);
  const restore = () => {
    delete require.cache[getZingoPath];
    if (savedGetZingo) require.cache[getZingoPath] = savedGetZingo;
    if (savedZingoProc) require.cache[zingoProcPath] = savedZingoProc;
    else delete require.cache[zingoProcPath];
  };

  return { mod, created, restore };
}

let cleanup = null;
afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

describe("getZingo / invalidateZingo / withSendLock", () => {
  it("normalizes defaults identically for zingoKey, getZingo, and invalidateZingo", () => {
    const { mod, created, restore } = loadWithFakeZingo();
    cleanup = restore;

    assert.equal(
      mod.zingoKey({ dataDir: "/tmp/w1" }),
      mod.zingoKey({
        chain: "testnet",
        serverUrl: "https://testnet.zec.rocks:443",
        dataDir: "/tmp/w1",
      }),
    );

    const first = mod.getZingo({ dataDir: "/tmp/w1" });
    assert.equal(mod.getZingo({ dataDir: "/tmp/w1" }), first);
    assert.equal(created.length, 1);

    // Previously invalidateZingo({ dataDir }) failed to normalize chain/serverUrl
    // and silently missed the pooled process.
    mod.invalidateZingo({ dataDir: "/tmp/w1" });
    assert.equal(first.destroyed, true);

    const second = mod.getZingo({ dataDir: "/tmp/w1" });
    assert.notEqual(second, first);
    assert.equal(created.length, 2);

    // Calling invalidateZingo() with no args evicts the default-keyed entry cleanly.
    const defProc = mod.getZingo();
    mod.invalidateZingo();
    assert.equal(defProc.destroyed, true);
  });

  it("serializes concurrent withSendLock callers, recovers from rejections, and evicts idle keys", async () => {
    const { mod, restore } = loadWithFakeZingo();
    cleanup = restore;

    const order = [];
    const p1 = mod.withSendLock("wallet-a", async () => {
      order.push("start-1");
      await new Promise((r) => setTimeout(r, 20));
      order.push("end-1");
      throw new Error("boom");
    });
    const p2 = mod.withSendLock("wallet-a", async () => {
      order.push("start-2");
      await new Promise((r) => setTimeout(r, 10));
      order.push("end-2");
      return "ok-2";
    });

    await assert.rejects(p1, /boom/);
    assert.equal(await p2, "ok-2");
    assert.deepEqual(order, ["start-1", "end-1", "start-2", "end-2"]);

    // Wait a microtask turn for .finally() cleanup
    await new Promise((r) => setImmediate(r));
    assert.equal(mod._sendLocks.has("wallet-a"), false);
  });

  it("replaces pooled process on forSend and handles missing proc gracefully", () => {
    const { mod, restore } = loadWithFakeZingo();
    cleanup = restore;

    const p1 = mod.getZingo({ chain: "mainnet", serverUrl: "https://s", dataDir: "/tmp/w2" });
    p1.proc = null;
    assert.equal(mod.getZingo({ chain: "mainnet", serverUrl: "https://s", dataDir: "/tmp/w2" }), p1);

    const p2 = mod.getZingo(
      { chain: "mainnet", serverUrl: "https://s", dataDir: "/tmp/w2" },
      { forSend: true },
    );
    assert.notEqual(p2, p1);
    assert.equal(p1.destroyed, true);
  });
});
