const ZingoProcess = require("./ZingoProcess");

/**
 * Generate a stable key for a zingo process
 */
function zingoKey({ chain, serverUrl, dataDir }) {
  return `${chain}::${serverUrl}::${dataDir}`;
}

/**
 * Zingo process pool
 * One warm process per unique (chain, serverUrl, dataDir)
 */
const pool = new Map();

// Per-key lock so only one forSend can be active for a given wallet.
// A second payout waits for the first to finish instead of destroying
// the process the first is still using.
const sendLocks = new Map();

function withSendLock(key, fn) {
  const prev = sendLocks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  // Keep the chain alive even if fn rejects, so later callers are not stuck.
  sendLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// `forSend`: a send needs an output window nobody else can write into.
// Always hand it a fresh process. A prior read may have timed out and
// left output pending (ZingoProcess#tainted), or may still be printing;
// either way a send must not share that window. Reads keep reusing the
// warm process; the worst they see is a garbled display.
function getZingo(params = {}, { forSend = false } = {}) {
  const normalized = {
    chain: params.chain || "testnet",
    serverUrl: params.serverUrl || "https://testnet.zec.rocks:443",
    dataDir: params.dataDir || "./backup/trash",
  };

  const key = zingoKey(normalized);

  // Reuse only for reads, and only if the process is still alive.
  // Sends always get a new process.
  const existing = pool.get(key);
  const dead = existing && (existing.exited || existing.proc.killed);
  if (existing && !dead && !forSend) {
    return existing;
  }
  if (existing) {
    existing.destroy();
    pool.delete(key);
  }

  // Spawn new warm process
  const zingo = new ZingoProcess(normalized);

  pool.set(key, zingo);

  // Auto-cleanup if process exits — but not if it was already replaced.
  zingo.proc.on("exit", () => {
    if (pool.get(key) === zingo) pool.delete(key);
  });

  return zingo;
}

function invalidateZingo(params) {
  const key = zingoKey(params);
  const proc = pool.get(key);

  if (proc) {
    proc.destroy();
    pool.delete(key);
  }
}

module.exports = {
  getZingo,
  invalidateZingo,
  withSendLock,
  zingoKey,
};
