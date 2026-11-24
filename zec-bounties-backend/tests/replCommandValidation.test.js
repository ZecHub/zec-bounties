const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { quicksendLine } = require("../utils/zingo/replCommand");

describe("replCommand quicksendLine validation", () => {
  it("rejects null, primitive, and array recipients with a clean error", () => {
    for (const bad of [null, undefined, "u1abc", 42, []]) {
      assert.throws(() => quicksendLine([bad]), /Invalid recipient/);
    }
  });

  it("rejects coerced non-numeric, non-positive, non-finite, and unsafe amounts", () => {
    for (const badAmount of [
      true,
      false,
      null,
      undefined,
      "",
      "   ",
      [10],
      { valueOf: () => 10 },
      "1e5",
      "-5",
      0,
      -1,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1000,
    ]) {
      assert.throws(
        () => quicksendLine([{ address: "u1abc123", amount: badAmount, memo: "ok" }]),
        /Invalid amount/,
      );
    }

    // Valid numeric strings and positive decimals continue to work
    const line = quicksendLine([{ address: "u1abc123", amount: "10.2", memo: "ok" }]);
    assert.equal(line, `quicksend '[{"address":"u1abc123","amount":11,"memo":"ok"}]'`);
  });

  it("enforces the 512-byte UTF-8 memo limit rather than UTF-16 code-unit length", () => {
    // 200 4-byte emojis = 400 UTF-16 code units (< 512) but 800 UTF-8 bytes (> 512)
    const tooManyBytes = "🚀".repeat(200);
    assert.ok(tooManyBytes.length < 512);
    assert.ok(Buffer.byteLength(tooManyBytes, "utf8") > 512);
    assert.throws(
      () => quicksendLine([{ address: "u1abc123", amount: 1000, memo: tooManyBytes }]),
      /Invalid memo/,
    );

    // 128 4-byte emojis = exactly 512 UTF-8 bytes -> accepted
    const exact512Bytes = "🚀".repeat(128);
    assert.equal(Buffer.byteLength(exact512Bytes, "utf8"), 512);
    const line = quicksendLine([{ address: "u1abc123", amount: 1000, memo: exact512Bytes }]);
    assert.ok(line.startsWith("quicksend "));
  });
});
