const crypto = require("crypto");

// Recovery OTP policy. These were previously inlined in routes/auth.js.
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

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
// consumed on the first correct match (replay protection) and is burned after
// too many wrong guesses (brute-force protection). Checks and the delete run
// synchronously, so concurrent verify calls for one key cannot both succeed.
class OtpStore {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs ?? OTP_TTL_MS;
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.resendCooldownMs = options.resendCooldownMs ?? RESEND_COOLDOWN_MS;
    this.store = new Map();
  }

  // Issues a code unless one was sent within the cooldown window.
  // Returns { otp } or { error: "cooldown", retryAfterMs }.
  issue(key, now = Date.now()) {
    const existing = this.store.get(key);
    if (existing && now - existing.issuedAt < this.resendCooldownMs) {
      return { error: "cooldown", retryAfterMs: this.resendCooldownMs - (now - existing.issuedAt) };
    }
    const otp = generateOtp();
    this.store.set(key, { otp, issuedAt: now, expiresAt: now + this.ttlMs, attempts: 0 });
    return { otp };
  }

  // Returns { status: "ok" | "none" | "expired" | "locked" | "incorrect", attemptsLeft? }.
  verify(key, candidate, now = Date.now()) {
    const record = this.store.get(key);
    if (!record) return { status: "none" };

    if (now > record.expiresAt) {
      this.store.delete(key);
      return { status: "expired" };
    }

    if (record.attempts >= this.maxAttempts) {
      this.store.delete(key);
      return { status: "locked" };
    }

    if (!safeEqual(record.otp, typeof candidate === "string" ? candidate : "")) {
      record.attempts += 1;
      if (record.attempts >= this.maxAttempts) {
        this.store.delete(key);
        return { status: "locked" };
      }
      return { status: "incorrect", attemptsLeft: this.maxAttempts - record.attempts };
    }

    this.store.delete(key);
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
};
