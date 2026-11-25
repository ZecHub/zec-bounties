const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const childProcess = require("node:child_process");

function createFakeProc() {
  const written = [];
  const proc = new EventEmitter();
  proc.pid = 424242;
  proc.killed = false;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = new EventEmitter();
  proc.stdin.write = (line) => {
    written.push(line);
    return true;
  };
  proc.kill = () => {
    proc.killed = true;
    proc.emit("exit", null, "SIGTERM");
  };
  proc.written = written;
  return proc;
}

const origSpawn = childProcess.spawn;
const origExists = fs.existsSync;

function createUnitZingo() {
  const fake = createFakeProc();
  childProcess.spawn = () => fake;
  fs.existsSync = () => true;
  process.env.ZINGO_CLI = "/fake/zingo-cli";

  delete require.cache[require.resolve("../utils/zingo/ZingoProcess")];
  const ZingoProcess = require("../utils/zingo/ZingoProcess");
  const zingo = new ZingoProcess({
    chain: "mainnet",
    serverUrl: "http://127.0.0.1:8137",
    dataDir: "/tmp/fake-zingo-unit",
  });
  return { ZingoProcess, zingo, fake };
}

afterEach(() => {
  childProcess.spawn = origSpawn;
  fs.existsSync = origExists;
});

describe("ZingoProcess JSON extraction helpers", () => {
  it("keeps braces inside JSON string values in extractJson", () => {
    const { ZingoProcess } = createUnitZingo();
    const raw =
      'prefix {"status":"ok","detail":"Io { kind: UnexpectedEof }","nested":{"a":1}} trailing';
    const extracted = ZingoProcess.extractJson(raw);
    assert.deepEqual(JSON.parse(extracted), {
      status: "ok",
      detail: "Io { kind: UnexpectedEof }",
      nested: { a: 1 },
    });
  });

  it("keeps brackets and escaped quotes inside JSON strings in extractJsonAddress", () => {
    const { ZingoProcess } = createUnitZingo();
    const raw =
      'info [{"address":"u1validaddr","note":"bracket ] and \\"quote\\""}] done';
    const extracted = ZingoProcess.extractJsonAddress(raw);
    assert.deepEqual(JSON.parse(extracted), [
      { address: "u1validaddr", note: 'bracket ] and "quote"' },
    ]);
  });
});

describe("ZingoProcess quicksend input validation", () => {
  it("rejects null, undefined, short, and non-string addresses before writing", async () => {
    const { zingo, fake } = createUnitZingo();
    for (const badAddress of [undefined, null, 12345678, "", "short", "u1bad'addr"]) {
      await assert.rejects(
        zingo.quicksend([{ address: badAddress, amount: 10000, memo: "test" }]),
        /malformed address/,
      );
    }
    assert.equal(fake.written.length, 0);
  });

  it("rejects empty recipients and non-positive or non-finite amounts", async () => {
    const { zingo, fake } = createUnitZingo();
    await assert.rejects(zingo.quicksend([]), /No recipients/);
    await assert.rejects(zingo.quicksend(null), /No recipients/);
    for (const badAmount of [0, -100, NaN, Infinity, "abc", undefined]) {
      await assert.rejects(
        zingo.quicksend([
          { address: "u1validrecipient", amount: badAmount, memo: "test" },
        ]),
        /invalid amount/,
      );
    }
    assert.equal(fake.written.length, 0);
  });
});

describe("ZingoProcess listener and waiter lifecycle cleanup", () => {
  it("removes waiters after sync, addresses, and parseAddress settle or time out", async () => {
    const { zingo, fake } = createUnitZingo();

    const syncPromise = zingo.sync("sync status", 2000);
    await new Promise((r) => setImmediate(r));
    assert.equal(zingo.waiters.length, 1);
    fake.stdout.emit("data", Buffer.from('{"sync_status":"complete"}\n'));
    const syncRes = await syncPromise;
    assert.equal(syncRes.sync_status, "complete");
    assert.equal(zingo.waiters.length, 0);

    const addrPromise = zingo.addresses("addresses", 2000);
    await new Promise((r) => setImmediate(r));
    assert.equal(zingo.waiters.length, 1);
    fake.stdout.emit("data", Buffer.from('[{"address":"u1abc12345"}]\n'));
    const addrRes = await addrPromise;
    assert.equal(addrRes[0].address, "u1abc12345");
    assert.equal(zingo.waiters.length, 0);

    const parsePromise = zingo.parseAddress("u1validaddr123", 100);
    await assert.rejects(parsePromise, /parse_address timeout/);
    assert.equal(zingo.waiters.length, 0);
  });

  it("detaches rescan listeners once rescan launch banner is observed", async () => {
    const { zingo, fake } = createUnitZingo();
    const baseStdoutListeners = fake.stdout.listenerCount("data");
    const baseStderrListeners = fake.stderr.listenerCount("data");

    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
      origSetTimeout(fn, ms === 3000 ? 10 : ms, ...args);

    try {
      const promise = zingo.rescan("rescan", 5000);
      await new Promise((r) => setImmediate(r));
      assert.equal(fake.stdout.listenerCount("data"), baseStdoutListeners + 1);
      assert.equal(fake.stderr.listenerCount("data"), baseStderrListeners + 1);

      fake.stdout.emit("data", Buffer.from("Launching rescan...\n"));
      // Listeners should already be cleaned up before the settle delay completes
      assert.equal(fake.stdout.listenerCount("data"), baseStdoutListeners);
      assert.equal(fake.stderr.listenerCount("data"), baseStderrListeners);

      // Late stderr noise during settle window must not reject rescan
      fake.stderr.emit("data", Buffer.from("progress update\n"));

      const result = await promise;
      assert.equal(result.message, "Rescan launched");
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});
