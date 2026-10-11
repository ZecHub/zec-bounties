const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertFixedCommand,
  parseAddressLine,
  quicksendLine,
} = require("../utils/zingo/replCommand");

test("parse_address line is one token and rejects a second command", () => {
  assert.equal(parseAddressLine("u1abc123"), "parse_address u1abc123");
  for (const input of ["u1abc def", "u1abc;", "u1abc\nquicksend", "it's", "-h"]) {
    assert.throws(() => parseAddressLine(input), /Invalid address/);
  }
});

test("quicksend quotes a memo apostrophe for shellwords and stays one line", () => {
  const line = quicksendLine([
    { address: "u1abc123", amount: 1.2, memo: "it's a memo" },
  ]);
  assert.equal(
    line,
    `quicksend '[{"address":"u1abc123","amount":2,"memo":"it'\\''s a memo"}]'`,
  );
  assert.equal(line.includes("\n"), false);
});

test("quicksend does not build a line for a bad address or control memo", () => {
  assert.throws(
    () => quicksendLine([{ address: "u1abc def", amount: 1, memo: "ok" }]),
    /Invalid address/,
  );
  assert.throws(
    () => quicksendLine([{ address: "u1abc", amount: 1, memo: "bad\nquicksend" }]),
    /Invalid memo/,
  );
});

test("fixed repl commands are an allowlist", () => {
  assert.equal(assertFixedCommand("sync status"), "sync status");
  assert.throws(() => assertFixedCommand("rescan\nquicksend"), /Rejected zingo command/);
  assert.throws(() => assertFixedCommand("quit; quicksend"), /Rejected zingo command/);
});
