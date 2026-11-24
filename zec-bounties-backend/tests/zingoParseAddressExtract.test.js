const { test } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const { promisify } = require("node:util");

let nextStdout = "";
const fakeExecFile = () => {};
fakeExecFile[promisify.custom] = async (_file, args) => ({
  stdout: nextStdout,
  stderr: "",
  args,
});
childProcess.execFile = fakeExecFile;

const executeZingoParseAddress = require("../utils/zingo/zingoLibParseAddress");
const { extractJsonObjects } = executeZingoParseAddress;

test("extractJsonObjects parses nested JSON objects and braces inside strings", () => {
  const output = [
    "Starting zingo-cli {banner}",
    '{"status":"success","address_kind":"unified","meta":{"network":"main","note":"brace } inside string"}}',
    "Done.",
  ].join("\n");

  const parsed = extractJsonObjects(output);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    status: "success",
    address_kind: "unified",
    meta: { network: "main", note: "brace } inside string" },
  });
});

test("executeZingoParseAddress parses nested CLI response and tolerates omitted params", async () => {
  const prev = process.env.ZINGO_CLI;
  process.env.ZINGO_CLI = process.execPath;
  nextStdout =
    '\u001b[32m{"status":"success","receivers":{"orchard":true,"sapling":true}}\u001b[0m\n';
  try {
    const result = await executeZingoParseAddress("u1abc123");
    assert.deepEqual(result, {
      status: "success",
      receivers: { orchard: true, sapling: true },
    });
  } finally {
    if (prev === undefined) delete process.env.ZINGO_CLI;
    else process.env.ZINGO_CLI = prev;
  }
});

test("executeZingoParseAddress reports missing ZINGO_CLI cleanly instead of ERR_INVALID_ARG_TYPE", async () => {
  const prev = process.env.ZINGO_CLI;
  delete process.env.ZINGO_CLI;
  try {
    await assert.rejects(
      () => executeZingoParseAddress("u1abc123", {}),
      /zingo-cli not found at undefined/,
    );
  } finally {
    if (prev !== undefined) process.env.ZINGO_CLI = prev;
  }
});
