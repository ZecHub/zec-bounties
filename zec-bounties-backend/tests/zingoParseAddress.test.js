const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const { promisify } = require("node:util");

const REPLY = '{"status":"success","chain_name":"main","address_kind":"unified"}\n';
const calls = [];

// Stands in for zingo-cli. promisify uses this hook, as it does for the real execFile.
const fakeExecFile = () => {};
fakeExecFile[promisify.custom] = async (file, args) => {
  calls.push(args);
  return { stdout: REPLY, stderr: "" };
};
childProcess.execFile = fakeExecFile;
mock.method(childProcess, "execSync", () => {
  throw new Error("execSync must not be used");
});

// zingoLibParseAddress reads execFile when it loads, so mock it before the require.
process.env.ZINGO_CLI = process.execPath;
const executeZingoParseAddress = require("../utils/zingo/zingoLibParseAddress");

test("passes the address to zingo-cli as one argument", async () => {
  calls.length = 0;
  const result = await executeZingoParseAddress("u1abc123", { dataDir: "/tmp/w x" });

  assert.equal(result.status, "success");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(-3), ["/tmp/w x", "parse_address", "u1abc123"]);
});

test("rejects input that is not a plain address without running zingo-cli", async () => {
  calls.length = 0;
  for (const input of ["u1abc def", "u1abc;", "u1abc\n", "-h", 42, { a: 1 }]) {
    const result = await executeZingoParseAddress(input, {});
    assert.equal(result.status, "invalid");
  }
  assert.equal(calls.length, 0);
});
