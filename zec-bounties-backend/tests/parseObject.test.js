const test = require("node:test");
const assert = require("node:assert/strict");
const { parseZingoObject } = require("../helpers/zcash/parseObject");

test("parseZingoObject preserves colons and underscores inside quoted string values", () => {
  const stdout = `
    Connecting to lightwalletd...
    {
      server: "https://zec.rocks:443",
      timestamp: "2026-11-24T12:30:00Z",
      memo: "tx_1_2 note: verified",
      balance: 29_000,
    }
    Done.
  `;
  const parsed = parseZingoObject(stdout);
  assert.deepEqual(parsed, {
    server: "https://zec.rocks:443",
    timestamp: "2026-11-24T12:30:00Z",
    memo: "tx_1_2 note: verified",
    balance: 29000,
  });
});

test("parseZingoObject handles multi-underscore numbers, digit keys, and trailing commas", () => {
  const stdout = `{
    total: 1_2_3_4,
    zats: 1_000_000_000,
    v1_2: 4_5,
    items: [1_0, 2_0,],
  }`;
  assert.deepEqual(parseZingoObject(stdout), {
    total: 1234,
    zats: 1000000000,
    v1_2: 45,
    items: [10, 20],
  });
});

test("parseZingoObject safely returns null for non-string or empty inputs", () => {
  assert.equal(parseZingoObject(null), null);
  assert.equal(parseZingoObject(undefined), null);
  assert.equal(parseZingoObject(""), null);
  assert.equal(parseZingoObject(12345), null);
  assert.equal(parseZingoObject("no json here"), null);
});
