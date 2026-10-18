const crypto = require("crypto");

// Recovery OTP policy. These were previously inlined in routes/auth.js.
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

// Six-digit code from a CSPRNG. Leading zeros are kept so every code is 6 chars.
function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

// Length-safe, constant-time compare. Returns false instead of throwing on a
// type or length mismatch so a caller can feed it untrusted input directly.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// In-memory, single-use OTP store keyed by user id. Each code expires, is
// consumed on the first correct match (replay protection). Wrong guesses are
// counted per key across codes for LOCKOUT_MS, so requesting a new code does not
// reset the count; MAX_ATTEMPTS of them lock the key for LOCKOUT_MS.
// Checks and the delete run synchronously, so concurrent verify calls for one
// key cannot both succeed.
class OtpStore {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs ?? OTP_TTL_MS;
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.resendCooldownMs = options.resendCooldownMs ?? RESEND_COOLDOWN_MS;
    this.lockoutMs = options.lockoutMs ?? LOCKOUT_MS;
    this.store = new Map();
    this.locks = new Map();
    this.failures = new Map();
  }

  // Milliseconds left on the key's lockout, or 0 when it is not locked.
  lockedFor(key, now) {
    const until = this.locks.get(key);
    if (until === undefined) return 0;
    if (now >= until) {
      this.locks.delete(key);
      return 0;
    }
    return until - now;
  }

  lock(key, now) {
    this.store.delete(key);
    this.failures.delete(key);
    this.locks.set(key, now + this.lockoutMs);
  }

  // Counts a wrong guess and returns the total inside the current window.
  recordFailure(key, now) {
    let entry = this.failures.get(key);
    if (!entry || now - entry.since >= this.lockoutMs) {
      entry = { count: 0, since: now };
      this.failures.set(key, entry);
    }
    entry.count += 1;
    return entry.count;
  }

  // Issues a code unless the key is locked or one was sent within the cooldown
  // window. Returns { otp } or { error: "locked" | "cooldown", retryAfterMs }.
  issue(key, now = Date.now()) {
    const lockedMs = this.lockedFor(key, now);
    if (lockedMs > 0) {
      return { error: "locked", retryAfterMs: lockedMs };
    }
    const existing = this.store.get(key);
    if (existing && now - existing.issuedAt < this.resendCooldownMs) {
      return {
        error: "cooldown",
        retryAfterMs: this.resendCooldownMs - (now - existing.issuedAt),
      };
    }
    const otp = generateOtp();
    this.store.set(key, { otp, issuedAt: now, expiresAt: now + this.ttlMs });
    return { otp };
  }

  // Returns { status: "ok" | "none" | "expired" | "locked" | "incorrect",
  // attemptsLeft?, retryAfterMs? }.
  verify(key, candidate, now = Date.now()) {
    const lockedMs = this.lockedFor(key, now);
    if (lockedMs > 0) return { status: "locked", retryAfterMs: lockedMs };

    const record = this.store.get(key);
    if (!record) return { status: "none" };

    if (now > record.expiresAt) {
      this.store.delete(key);
      return { status: "expired" };
    }

    if (
      !safeEqual(record.otp, typeof candidate === "string" ? candidate : "")
    ) {
      const failures = this.recordFailure(key, now);
      if (failures >= this.maxAttempts) {
        this.lock(key, now);
        return { status: "locked", retryAfterMs: this.lockoutMs };
      }
      return { status: "incorrect", attemptsLeft: this.maxAttempts - failures };
    }

    this.store.delete(key);
    this.failures.delete(key);
    return { status: "ok" };
  }

  clear(key) {
    this.store.delete(key);
  }
}

module.exports = {
  OtpStore,
  generateOtp,
  safeEqual,
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  LOCKOUT_MS,
};
