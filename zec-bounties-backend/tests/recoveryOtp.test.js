const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  OtpStore,
  generateOtp,
  safeEqual,
  MAX_ATTEMPTS,
} = require("../helpers/recoveryOtp");

describe("generateOtp", () => {
  it("returns a six-character numeric string", () => {
    for (let i = 0; i < 1000; i++) {
      const otp = generateOtp();
      assert.match(otp, /^[0-9]{6}$/);
    }
  });

  it("keeps leading zeros so the space is the full 000000-999999", () => {
    // With 2000 draws a padded generator produces some codes below 100000.
    const codes = Array.from({ length: 2000 }, generateOtp);
    assert.ok(codes.some((c) => c[0] === "0"));
  });
});

describe("safeEqual", () => {
  it("matches equal strings and rejects everything else", () => {
    assert.equal(safeEqual("123456", "123456"), true);
    assert.equal(safeEqual("123456", "123457"), false);
    assert.equal(safeEqual("123456", "12345"), false);
    assert.equal(safeEqual("123456", undefined), false);
    assert.equal(safeEqual(123456, "123456"), false);
  });
});

describe("OtpStore.verify", () => {
  it("returns none when no code was issued", () => {
    const store = new OtpStore();
    assert.equal(store.verify("u1", "000000").status, "none");
  });

  it("accepts the correct code once, then reports none (single use / replay)", () => {
    const store = new OtpStore();
    const { otp } = store.issue("u1", 0);
    assert.equal(store.verify("u1", otp, 1).status, "ok");
    assert.equal(store.verify("u1", otp, 2).status, "none");
  });

  it("expires after the ttl", () => {
    const store = new OtpStore({ ttlMs: 1000 });
    const { otp } = store.issue("u1", 0);
    assert.equal(store.verify("u1", otp, 1001).status, "expired");
    assert.equal(store.verify("u1", otp, 1002).status, "none");
  });

  it("burns the code after MAX_ATTEMPTS wrong guesses (brute-force)", () => {
    const store = new OtpStore();
    const { otp } = store.issue("u1", 0);
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      assert.equal(store.verify("u1", wrong, i).status, "incorrect");
    }
    assert.equal(store.verify("u1", wrong, MAX_ATTEMPTS).status, "locked");
    // Even the right code no longer works once the record is burned.
    assert.equal(store.verify("u1", otp, MAX_ATTEMPTS + 1).status, "none");
  });

  it("reports attemptsLeft while the code is still alive", () => {
    const store = new OtpStore({ maxAttempts: 3 });
    const { otp } = store.issue("u1", 0);
    const wrong = otp === "000000" ? "111111" : "000000";
    assert.equal(store.verify("u1", wrong, 1).attemptsLeft, 2);
    assert.equal(store.verify("u1", wrong, 2).attemptsLeft, 1);
    assert.equal(store.verify("u1", wrong, 3).status, "locked");
  });
});

describe("OtpStore.issue", () => {
  it("refuses to resend within the cooldown window", () => {
    const store = new OtpStore({ resendCooldownMs: 30000 });
    assert.ok(store.issue("u1", 0).otp);
    const second = store.issue("u1", 10000);
    assert.equal(second.error, "cooldown");
    assert.equal(second.retryAfterMs, 20000);
  });

  it("issues again once the cooldown passes", () => {
    const store = new OtpStore({ resendCooldownMs: 30000 });
    store.issue("u1", 0);
    assert.ok(store.issue("u1", 30000).otp);
  });
});
