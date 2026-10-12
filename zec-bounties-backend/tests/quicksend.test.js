const { describe, it, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.ZINGO_CLI = path.join(__dirname, "helpers", "fake-zingo-cli.js");

const ZingoProcess = require("../utils/zingo/ZingoProcess");
const { getZingo } = require("../utils/zingo/getZingo");

const RECIPIENT = {
  address: "u1recipient",
  amount: 30000000,
  memo: "Bounty: t (ID: b1)",
};

let logDir;
const spawned = [];

// Each process reads FAKE_ZINGO_* from the environment it is spawned with.
function spawnZingo(mode, extraEnv = {}) {
  Object.assign(process.env, { FAKE_ZINGO_MODE: mode }, extraEnv);
  const zingo = new ZingoProcess({
    chain: "mainnet",
    serverUrl: "http://fake",
    dataDir: logDir,
  });
  spawned.push(zingo);
  return zingo;
}

before(() => {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-zingo-"));
  // The existing commands log every chunk; keep test output readable.
  console.log = () => {};
});

afterEach(() => {
  while (spawned.length) spawned.pop().destroy();
  delete process.env.FAKE_ZINGO_ERROR;
  delete process.env.FAKE_ZINGO_LOG;
});

describe("quicksend result contract", () => {
  it("reads the txid out of zingo-cli 6's nested send result", async () => {
    const result = await spawnZingo("v6").quicksend([RECIPIENT]);
    assert.deepEqual(result.txids, ["1".padStart(64, "0")]);
    assert.equal(result.error, null);
    assert.equal(result.timedOut, false);
  });

  it("does not fail a send over zingo's stderr heartbeat", async () => {
    const result = await spawnZingo("ironwood").quicksend([RECIPIENT]);
    assert.deepEqual(result.txids, ["1".padStart(64, "0")]);
    assert.match(result.stderr, /transmitting/);
  });

  it("reports zingo's error without txids", async () => {
    const result = await spawnZingo("error").quicksend([RECIPIENT]);
    assert.deepEqual(result.txids, []);
    assert.match(result.error, /Insufficient balance/);
    assert.equal(result.timedOut, false);
  });

  it("keeps an error whose text contains braces", async () => {
    // e.g. zingolib's "Failed to read transaction. {0:?}"
    const result = await spawnZingo("error", {
      FAKE_ZINGO_ERROR: "Failed to read transaction. Io { kind: UnexpectedEof }",
    }).quicksend([RECIPIENT]);
    assert.deepEqual(result.txids, []);
    assert.equal(result.error, "Failed to read transaction. Io { kind: UnexpectedEof }");
  });

  it("strips quotes from the memo so the REPL can parse the command", async () => {
    const log = path.join(logDir, "apostrophe.log");
    const result = await spawnZingo("v6", { FAKE_ZINGO_LOG: log }).quicksend([
      { ...RECIPIENT, memo: "Bounty: ZecHub's governance guide" },
    ]);
    assert.equal(result.txids.length, 1);
    assert.match(fs.readFileSync(log, "utf8"), /ZecHubs governance guide/);
  });

  it("refuses a malformed address before writing anything", async () => {
    const log = path.join(logDir, "malformed.log");
    const zingo = spawnZingo("v6", { FAKE_ZINGO_LOG: log });
    await assert.rejects(
      zingo.quicksend([{ ...RECIPIENT, address: "u1x' 'u1attacker" }]),
      /malformed address/,
    );
    assert.equal(fs.existsSync(log), false);
  });

  it("times out as unknown, never as failed, and retires the process", async () => {
    const zingo = spawnZingo("hang");
    const result = await zingo.quicksend([RECIPIENT], 300);
    assert.equal(result.timedOut, true);
    assert.equal(result.error, null);
    assert.deepEqual(result.txids, []);
    await new Promise((resolve) => zingo.proc.once("exit", resolve));
    assert.equal(zingo.exited, true);
  });
});

describe("commands sharing one zingo process", () => {
  it("does not take a concurrent sync status as the send result", async () => {
    // Before: the send resolved with the sync block, which has no error, so
    // the payout route marked the bounties paid although zingo refused it.
    const zingo = spawnZingo("error");
    const [status, result] = await Promise.all([
      zingo.sync("sync status"),
      zingo.quicksend([RECIPIENT]),
    ]);
    assert.equal(status.sync_status, "complete");
    assert.deepEqual(result.txids, []);
    assert.match(result.error, /Insufficient balance/);
  });

  it("gives overlapping sends their own txids", async () => {
    const zingo = spawnZingo("v6");
    const [first, second] = await Promise.all([
      zingo.quicksend([RECIPIENT]),
      zingo.quicksend([RECIPIENT]),
    ]);
    assert.deepEqual(first.txids, ["1".padStart(64, "0")]);
    assert.deepEqual(second.txids, ["2".padStart(64, "0")]);
  });

  it("will not send on a process a read gave up on, and getZingo replaces it", async () => {
    process.env.FAKE_ZINGO_MODE = "v6";
    const params = { chain: "mainnet", serverUrl: "http://fake", dataDir: logDir };
    const zingo = getZingo(params);
    spawned.push(zingo);

    // balance rejects on its stderr line; its stdout is still on the way.
    await assert.rejects(zingo.balance("balance"));
    assert.equal(zingo.tainted, true);
    await assert.rejects(zingo.quicksend([RECIPIENT]), /nothing was sent/);

    // Reads keep the process; a sender gets a fresh one.
    assert.equal(getZingo(params), zingo);
    const fresh = getZingo(params, { forSend: true });
    spawned.push(fresh);
    assert.notEqual(fresh, zingo);
    const result = await fresh.quicksend([RECIPIENT]);
    assert.equal(result.txids.length, 1);

    // The retired process exiting must not evict its replacement.
    if (!zingo.exited) await new Promise((r) => zingo.proc.once("exit", r));
    assert.equal(getZingo(params), fresh);
  });

  it("refuses a send queued behind one that timed out, before writing it", async () => {
    const log = path.join(logDir, "queued.log");
    const zingo = spawnZingo("hang", { FAKE_ZINGO_LOG: log });
    const [first, second] = await Promise.allSettled([
      zingo.quicksend([RECIPIENT], 300),
      zingo.quicksend([RECIPIENT], 300),
    ]);
    assert.equal(first.value.timedOut, true);
    assert.equal(second.status, "rejected");
    const written = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(written.length, 1);
  });
});
