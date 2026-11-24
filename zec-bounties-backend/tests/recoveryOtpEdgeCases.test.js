const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  OtpStore,
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  LOCKOUT_MS,
} = require("../helpers/recoveryOtp");

describe("OtpStore edge cases and pruning", () => {
  it("handles null or invalid constructor options safely", () => {
    const fromNull = new OtpStore(null);
    assert.equal(fromNull.ttlMs, OTP_TTL_MS);
    assert.equal(fromNull.maxAttempts, MAX_ATTEMPTS);
    assert.equal(fromNull.resendCooldownMs, RESEND_COOLDOWN_MS);
    assert.equal(fromNull.lockoutMs, LOCKOUT_MS);

    const fromBad = new OtpStore({
      ttlMs: -5,
      maxAttempts: 0,
      resendCooldownMs: -10,
      lockoutMs: Number.NaN,
    });
    assert.equal(fromBad.ttlMs, OTP_TTL_MS);
    assert.equal(fromBad.maxAttempts, MAX_ATTEMPTS);
    assert.equal(fromBad.resendCooldownMs, RESEND_COOLDOWN_MS);
    assert.equal(fromBad.lockoutMs, LOCKOUT_MS);
  });

  it("evicts expired codes, lockouts, and stale failure windows via prune()", () => {
    const store = new OtpStore({
      ttlMs: 1000,
      maxAttempts: 2,
      resendCooldownMs: 0,
      lockoutMs: 5000,
    });
    const { otp: otp1 } = store.issue("u1", 0);
    const { otp: otp2 } = store.issue("u2", 0);
    const { otp: otp3 } = store.issue("u3", 0);

    // u1 fails once (stays in failures)
    store.verify("u1", otp1 === "000000" ? "111111" : "000000", 10);
    // u2 fails twice (moves to locks)
    const wrong2 = otp2 === "000000" ? "111111" : "000000";
    store.verify("u2", wrong2, 10);
    store.verify("u2", wrong2, 20);
    // u3 is untouched and abandoned
    assert.ok(otp3);

    const evicted = store.prune(6000);
    assert.equal(evicted, 4);
    assert.equal(store.store.size, 0);
    assert.equal(store.locks.size, 0);
    assert.equal(store.failures.size, 0);
  });

  it("lazily evicts abandoned entries during issue() while preserving recent expired status", () => {
    const store = new OtpStore({
      ttlMs: 1000,
      lockoutMs: 5000,
      resendCooldownMs: 0,
    });
    const { otp: otpRecent } = store.issue("recent", 5500);
    store.issue("stale", 0);

    // At t=6600, "stale" expired at 1000 (past expiresAt + lockoutMs = 6000) so it is pruned,
    // while "recent" expired at 6500 (still within grace) so verify still reports "expired".
    store.issue("fresh", 6600);
    assert.equal(store.store.has("stale"), false);
    assert.equal(store.verify("recent", otpRecent, 6600).status, "expired");
  });

  it("allows immediate reissue when an existing OTP already expired and clamps clock-skew cooldown", () => {
    const store = new OtpStore({ ttlMs: 1000, resendCooldownMs: 5000 });
    store.issue("u1", 1000);
    // Backward clock skew should not report retryAfterMs > resendCooldownMs
    const skewed = store.issue("u1", 500);
    assert.equal(skewed.error, "cooldown");
    assert.equal(skewed.retryAfterMs, 5000);

    // Past expiry (t=2001 > expiresAt=2000), reissue is permitted even if cooldown > ttlMs
    const reissued = store.issue("u1", 2001);
    assert.ok(reissued.otp);
  });
});
