const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");

const SEED = "test words only";
const REPLIES = {
  addresses: '[{"address":"u1test"}]\n',
  recovery_info: `Wallet backup info: {\n  seed phrase: ${SEED}\n  birthday: 1\n}\n`,
};

// Stands in for zingo-cli: answers each command with a fixed reply.
function fakeSpawn() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    write: (line) =>
      setImmediate(() => proc.stdout.emit("data", Buffer.from(REPLIES[line.trim()]))),
  };
  return proc;
}

// ZingoProcess reads `spawn` when it loads, so mock it before the require.
mock.method(childProcess, "spawn", fakeSpawn);
process.env.ZINGO_CLI = process.execPath;
const ZingoProcess = require("../utils/zingo/ZingoProcess");

test("wallet recovery output is never logged", async (t) => {
  const logged = [];
  t.mock.method(console, "log", (...args) => logged.push(args.join(" ")));

  const zingo = new ZingoProcess({ dataDir: "unused" });
  await zingo.addresses("addresses");
  const backup = await zingo.recovery_info();

  assert.equal(backup["seed phrase"], SEED);
  assert.ok(!logged.some((line) => line.includes(SEED)));
});
