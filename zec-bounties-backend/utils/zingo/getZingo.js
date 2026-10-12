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

// `forSend`: a send needs an output window nobody else can write into, so
// it gets a fresh process in place of one a read left tainted. Reads keep
// using it; the worst they see is a garbled display.
function getZingo(params = {}, { forSend = false } = {}) {
  const normalized = {
    chain: params.chain || "testnet",
    serverUrl: params.serverUrl || "https://testnet.zec.rocks:443",
    dataDir: params.dataDir || "./backup/trash",
  };

  const key = zingoKey(normalized);

  // Reuse if exists, unless it died or (for a send) a command gave up on it
  // with output possibly still pending (see ZingoProcess#tainted).
  const existing = pool.get(key);
  const dead = existing && (existing.exited || existing.proc.killed);
  if (existing && !dead && !(forSend && existing.tainted)) {
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
};
