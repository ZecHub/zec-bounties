// Moves a payout from Broadcast to Confirmed by asking the paying wallet
// whether its transaction has been mined.
//
// The wallet process talks to a lightwalletd-style server (Zaino / Zebrad
// behind it) that can be down or slow. That must never break the bounty page:
// every failure is caught and reported as `backend.reachable === false`, and
// the payout keeps its last known state.

const MIN_INTERVAL_MS = 60 * 1000;
const WALLET_TIMEOUT_MS = 15 * 1000;

// Last outcome per payout row, so a throttled request can still tell the
// page whether the node was reachable the last time we looked.
const lastBackend = new Map();
// Wallets with a check running. Wallet commands share one process, so never
// stack a second `transactions` call behind the first.
const inFlight = new Set();

const toBlockHeight = (entry) =>
  Number(entry.block_height ?? entry.blockheight ?? entry.height ?? 0);

// zingo-cli prints each transaction as a block with a `txid` and a `status`
// ("confirmed" once mined, "pending" before). Also accept a block height or a
// confirmation count in case a build reports those instead.
function isTxConfirmed(entries, txid) {
  if (!Array.isArray(entries) || !txid) return false;
  const wanted = String(txid).toLowerCase();
  const entry = entries.find(
    (e) => e && String(e.txid ?? "").toLowerCase() === wanted,
  );
  if (!entry) return false;

  const status = String(entry.status ?? "").toLowerCase();
  if (/unconfirmed|pending|mempool/.test(status)) return false;
  if (/confirmed|completed/.test(status)) return true;
  if (toBlockHeight(entry) > 0) return true;
  return Number(entry.confirmations ?? 0) > 0;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Wallet did not respond in time")),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Real wallet lookup, loaded lazily so tests never touch zingo.
async function fetchWalletTransactions(walletId) {
  const prisma = require("../prisma/client");
  const path = require("path");
  const executeZingoCliTransactions = require("./zingo/zingoLibTransactions");

  const row = await prisma.zcashParams.findFirst({ where: { walletId } });
  if (!row) throw new Error("Paying wallet not found");

  return executeZingoCliTransactions({
    chain: row.chain,
    serverUrl: row.serverUrl,
    dataDir: path.join(process.cwd(), "wallets", walletId),
  });
}

// Returns { record, backend }. `backend` is null when no check was attempted
// (nothing to confirm, throttled before any result, or no wallet recorded).
async function refreshConfirmation(
  record,
  {
    prisma = require("../prisma/client"),
    fetchTransactions = fetchWalletTransactions,
    now = () => new Date(),
    minIntervalMs = MIN_INTERVAL_MS,
    timeoutMs = WALLET_TIMEOUT_MS,
  } = {},
) {
  if (
    !record ||
    record.status !== "BROADCAST" ||
    record.confirmedAt ||
    !record.txid ||
    !record.walletAccount
  ) {
    return { record, backend: null };
  }

  const checkedAt = now();
  const last = record.lastCheckedAt ? new Date(record.lastCheckedAt) : null;
  if (
    (last && checkedAt - last < minIntervalMs) ||
    inFlight.has(record.walletAccount)
  ) {
    return { record, backend: lastBackend.get(record.id) ?? null };
  }

  inFlight.add(record.walletAccount);
  try {
    let entries;
    try {
      entries = await withTimeout(
        fetchTransactions(record.walletAccount),
        timeoutMs,
      );
    } catch (error) {
      // Node, indexer or wallet unreachable. Remember that we looked so the
      // page isn't retried on every refresh, and keep the last known state.
      const backend = { reachable: false, checkedAt };
      lastBackend.set(record.id, backend);
      const updated = await prisma.transaction.update({
        where: { id: record.id },
        data: { lastCheckedAt: checkedAt },
      });
      return { record: { ...record, ...updated }, backend };
    }

    const backend = { reachable: true, checkedAt };
    lastBackend.set(record.id, backend);
    const confirmed = isTxConfirmed(entries, record.txid);
    const updated = await prisma.transaction.update({
      where: { id: record.id },
      data: {
        lastCheckedAt: checkedAt,
        ...(confirmed ? { confirmedAt: checkedAt } : {}),
      },
    });
    return { record: { ...record, ...updated }, backend };
  } finally {
    inFlight.delete(record.walletAccount);
  }
}

module.exports = {
  MIN_INTERVAL_MS,
  isTxConfirmed,
  refreshConfirmation,
  _resetForTests: () => {
    lastBackend.clear();
    inFlight.clear();
  },
};
