// Payouts cut off by a restart.
//
// A payout claims its bounties and writes PENDING records, sends, then
// settles the records. If the process stops in between (a deploy, a crash),
// the records stay PENDING with the bounties locked, and a PENDING record
// cannot be resolved by hand (see POST /api/transactions/records/:id/resolve).
// Shutdown therefore waits for running payouts, and some minutes after the
// next start any record left PENDING moves to the UNKNOWN resolve flow.
//
// Assumes a single backend instance, with the old process stopped before the
// new one starts: a record claimed before this process started belongs to a
// process that has stopped, and its send queue with it. With several
// instances, another live instance's record is protected only by the send
// timeout, which a send queued behind another can outlast.
const prisma = require("../prisma/client");
const { SEND_TIMEOUT_MS } = require("./zingo/sendTimeout");

// Prisma stamps createdAt in this process, so both come from the same clock.
// A raw-SQL insert would use the database's local time instead.
const bootedAt = new Date();

// A record's createdAt is its claim time, and a send queued behind another
// may have reached the wallet much later, up to the moment the old process
// stopped. Waiting a full send timeout (plus a margin) after this start
// covers any send handed over before then.
const RECOVERY_DELAY_MS = SEND_TIMEOUT_MS + 60000;

// Moves PENDING records claimed before this process started to UNKNOWN. The
// bounties stay locked until an admin resolves each record after checking
// the wallet history.
async function recoverInterruptedPayouts() {
  const { count } = await prisma.transaction.updateMany({
    where: { status: "PENDING", createdAt: { lt: bootedAt } },
    data: {
      status: "UNKNOWN",
      errorDetail:
        "Process restarted during the send; check the wallet history before resolving",
    },
  });
  if (count > 0) {
    console.warn(
      `⚠️ ${count} payout record(s) cut off by a restart are now UNKNOWN; resolve them after checking the wallet history`,
    );
  }
  return count;
}

function startPayoutRecovery() {
  setTimeout(() => {
    recoverInterruptedPayouts().catch((err) =>
      console.error("Payout recovery failed:", err.message),
    );
  }, RECOVERY_DELAY_MS).unref();
}

let running = 0;
let shuttingDown = false;
let drained = null;
let onIdle = () => {};

// Wraps a payout route handler. Once shutdown has begun it refuses new
// payouts; until then it counts the running ones, from claim to settle.
function trackPayout(handler) {
  return async (req, res, next) => {
    if (shuttingDown) {
      return res.status(503).json({
        error: "The server is shutting down. Try the payout again in a minute.",
      });
    }
    running++;
    try {
      return await handler(req, res, next);
    } finally {
      running--;
      if (running === 0) onIdle();
    }
  };
}

// Refuses new payouts and waits up to `timeoutMs` for the running ones.
// Resolves true once none is left, false if some were still running.
function drainPayouts(timeoutMs = SEND_TIMEOUT_MS + 15000) {
  shuttingDown = true;
  drained ??= new Promise((resolve) => {
    if (running === 0) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    onIdle = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
  return drained;
}

// The send went out but writing its result failed. PENDING would leave the
// bounties locked with no way to resolve them; UNKNOWN keeps them locked and
// resolvable, with the txid to resolve them with. The record becomes UNKNOWN
// if the database accepts this write (tried twice); otherwise the recovery
// after the next start does it.
async function markSentButUnrecorded(batchKey, txid, raw) {
  const write = () =>
    prisma.transaction.updateMany({
      where: { batchKey, status: "PENDING" },
      data: {
        status: "UNKNOWN",
        txid,
        ...(raw !== undefined && { rawResult: raw || null }),
        errorDetail: `Sent with txid ${txid}, but recording the result failed; resolve as broadcast with this txid`,
      },
    });
  try {
    await write();
  } catch {
    await write();
  }
}

module.exports = {
  bootedAt,
  recoverInterruptedPayouts,
  startPayoutRecovery,
  trackPayout,
  drainPayouts,
  markSentButUnrecorded,
};
