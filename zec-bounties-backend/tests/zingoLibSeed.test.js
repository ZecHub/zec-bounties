const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const executeZingoCliSeed = require("../utils/zingo/zingoLibSeed");
const { parseBirthday } = executeZingoCliSeed;

test("parseBirthday accepts non-negative integers and defaults blank values to 0", () => {
  assert.equal(parseBirthday(undefined), "0");
  assert.equal(parseBirthday(null), "0");
  assert.equal(parseBirthday(""), "0");
  assert.equal(parseBirthday("   "), "0");
  assert.equal(parseBirthday(0), "0");
  assert.equal(parseBirthday(2500000), "2500000");
  assert.equal(parseBirthday(" 2500000 "), "2500000");
});

test("parseBirthday rejects negative, fractional, oversized, and flag-like inputs", () => {
  for (const bad of [-1, 1.5, NaN, Infinity, "999999999999999999999999", "--evil", "123abc", {}, []]) {
    assert.throws(() => parseBirthday(bad), /Invalid wallet birthday/);
  }
});

test("executeZingoCliSeed schedules quit once and clears timers on process exit", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zingo-seed-test-"));
  const fakeCli = path.join(tmpDir, "fake-zingo.js");
  fs.writeFileSync(
    fakeCli,
    `#!${process.execPath}
process.stdout.write("Launching save task\\n");
process.stdout.write("Extra chunk 1\\n");
process.stderr.write("Extra chunk 2\\n");
let stdinBuf = "";
process.stdin.on("data", (d) => {
  stdinBuf += d.toString();
  if (stdinBuf.includes("quit\\n")) {
    process.stdout.write("ARGS:" + JSON.stringify(process.argv.slice(2)) + "\\n");
    process.exit(0);
  }
});
`,
    { mode: 0o755 },
  );

  const prevCli = process.env.ZINGO_CLI;
  process.env.ZINGO_CLI = fakeCli;
  try {
    const res = await executeZingoCliSeed(
      undefined,
      "abandon abandon abandon",
      "2450000",
      10000,
    );
    assert.equal(res.message, "Wallet restored");
    assert.match(res.output, /"--birthday","2450000"/);
  } finally {
    if (prevCli === undefined) delete process.env.ZINGO_CLI;
    else process.env.ZINGO_CLI = prevCli;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
