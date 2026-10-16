const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");

function createFakeProc() {
  return {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write() {}, on() {} },
    on() {},
    kill() {},
  };
}

test("wallet recovery output is never logged", async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));

  const childProcess = require("node:child_process");
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = () => createFakeProc();

  const originalExists = fs.existsSync;
  fs.existsSync = () => true;

  const ZingoProcess = require("../utils/zingo/ZingoProcess");
  const proc = new ZingoProcess({
    zingoPath: "/fake/zingo",
    chain: "mainnet",
    serverUrl: "http://127.0.0.1:8137",
    dataDir: "/tmp",
  });

  const seed =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  proc.proc.stdout.emit("data", Buffer.from(`{"seed":"${seed}"}\n`));

  await new Promise((r) => setImmediate(r));

  console.log = originalLog;
  childProcess.spawn = originalSpawn;
  fs.existsSync = originalExists;

  assert.ok(!logs.join("\n").includes(seed), "seed phrase must not appear in logs");
});
