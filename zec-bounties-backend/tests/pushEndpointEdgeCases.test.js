const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { isAllowedPushEndpoint } = require("../utils/pushEndpoint");

describe("isAllowedPushEndpoint edge cases", () => {
  it("rejects non-string inputs including arrays and custom toString objects", () => {
    const valid = "https://fcm.googleapis.com/fcm/send/abc";
    for (const bad of [
      null,
      undefined,
      123,
      [valid],
      { toString: () => valid },
      new URL(valid),
    ]) {
      assert.equal(isAllowedPushEndpoint(bad), false);
    }
  });

  it("rejects bare leading-dot and malformed subdomain prefixes on suffix-matched hosts", () => {
    for (const bad of [
      "https://.push.apple.com/token",
      "https://.notify.windows.com/token",
      "https://web..push.apple.com/token",
      "https://-web.push.apple.com/token",
      "https://web-.notify.windows.com/token",
      "https://push.apple.com/token",
      "https://notify.windows.com/token",
    ]) {
      assert.equal(isAllowedPushEndpoint(bad), false, bad);
    }
  });

  it("rejects endpoints containing leading/trailing whitespace or ASCII control characters", () => {
    for (const bad of [
      " https://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com/fcm/send/abc ",
      "https://fcm.googleapis.com/fcm/send/abc\n",
      "https://fcm.google\tapis.com/fcm/send/abc",
      "https://fcm.googleapis.com/fcm/\rsend/abc",
    ]) {
      assert.equal(isAllowedPushEndpoint(bad), false, JSON.stringify(bad));
    }
  });

  it("accepts multi-level valid subdomains on allowed push suffixes", () => {
    for (const ok of [
      "https://a.web.push.apple.com/QGuQ",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
      "https://fcm.googleapis.com/fcm/send/abc:def",
    ]) {
      assert.equal(isAllowedPushEndpoint(ok), true, ok);
    }
  });
});
