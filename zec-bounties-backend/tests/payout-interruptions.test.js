// A payout claims its bounties (PENDING records), sends, then settles. These
// tests boot the real server.js, with in-memory stand-ins for the database
// and the wallet, and check what happens when that sequence is cut short: by
// a restart, by a shutdown signal, or by a settle write that fails after the
// money went out. Each case must end with the bounties locked and the record
// resolvable, never PENDING forever and never re-payable.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// ─── In-memory stand-ins ───────────────────────────────────────────────────

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
const TEN_SECONDS_AGO = new Date(Date.now() - 10 * 1000);
const TXID = "a".repeat(64);

const bounty = (id, extra = {}) => ({
  id,
  title: `Bounty ${id}`,
  teamId: null,
  chain: "MAIN",
  bountyAmount: 0.3,
  status: "DONE",
  isApproved: true,
  isPaid: false,
  paymentInFlight: false,
  assigneeUser: { id: `u-${id}`, UA_address: `u${id}recipient` },
  ...extra,
});

// b1 and b2 were claimed by an earlier process that stopped mid-send: b1 an
// hour ago, b2 ten seconds before this start. The rest are payable.
const bounties = [
  bounty("b1", { paymentInFlight: true }),
  bounty("b2", { paymentInFlight: true }),
  bounty("b3"),
  bounty("b4"),
  bounty("b5"),
  bounty("b6"),
];
const txRows = [
  { id: "r-old", bountyId: "b1", batchKey: "old", status: "PENDING", createdAt: HOUR_AGO },
  { id: "r-young", bountyId: "b2", batchKey: "young", status: "PENDING", createdAt: TEN_SECONDS_AGO },
];
let nextId = 1;

// A field the fixture leaves out reads as null, as an unset column would.
const matches = (row, where = {}) =>
  Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && "in" in cond) return cond.in.includes(row[key]);
    if (cond && typeof cond === "object" && "lt" in cond) return row[key] < cond.lt;
    return (row[key] ?? null) === cond;
  });

// Prisma queries run only when awaited or handed to $transaction, which is
// what lets a failed $transaction leave every row untouched.
const lazy = (fn) => {
  let run;
  const start = () => (run ??= Promise.resolve().then(fn));
  return {
    then: (ok, fail) => start().then(ok, fail),
    catch: (fail) => start().catch(fail),
  };
};

let failNextSettle = false;
let failRecordWrites = 0;
let disconnected = false;
let cacheBumps = 0;

const prisma = {
  bounty: {
    findMany: ({ where }) =>
      lazy(() => bounties.filter((b) => matches(b, where)).map((b) => ({ ...b }))),
    updateMany: ({ where, data }) =>
      lazy(() => {
        const hit = bounties.filter((b) => matches(b, where));
        hit.forEach((b) => Object.assign(b, data));
        return { count: hit.length };
      }),
    update: ({ where, data }) =>
      lazy(() => Object.assign(bounties.find((b) => b.id === where.id), data)),
  },
  transaction: {
    createMany: ({ data }) =>
      lazy(() => {
        data.forEach((row) =>
          txRows.push({ id: `r${nextId++}`, status: "PENDING", createdAt: new Date(), ...row }),
        );
        return { count: data.length };
      }),
    updateMany: ({ where, data }) =>
      lazy(() => {
        if (failRecordWrites > 0) {
          failRecordWrites--;
          throw new Error("Can't reach database server");
        }
        const hit = txRows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    findUnique: ({ where }) => lazy(() => txRows.find((r) => r.id === where.id) || null),
  },
  $transaction: async (arg) => {
    if (typeof arg === "function") return arg(prisma);
    if (failNextSettle) {
      failNextSettle = false;
      throw new Error("Can't reach database server");
    }
    return Promise.all(arg);
  },
  $disconnect: async () => {
    disconnected = true;
  },
};

let sendImpl;
const sentBatches = [];

stub("prisma/client.js", prisma);
stub("middleware/auth.js", {
  authenticate: (req, res, next) => {
    req.user = { id: "admin1", role: "ADMIN" };
    next();
  },
  isAdmin: (req, res, next) => next(),
  optionalAuthenticate: (req, res, next) => next(),
});
stub("middleware/websocket.js", {
  handleWebSocket: () => {},
  sendRealtimeUpdate: () => {},
  sendToUser: () => {},
});
stub("middleware/hideOtherUsersEmails.js", {
  hideOtherUsersEmails: (req, res, next) => next(),
});
stub("config/redis.js", { connectRedis: async () => {}, redisClient: {} });
stub("utils/deadlineReminders.js", { startDeadlineReminderJob: () => {} });
stub("utils/cache.js", {
  delCache: async () => {},
  deleteCacheByPattern: async () => {},
  bumpVersion: async () => {
    cacheBumps++;
  },
});
stub("utils/notifyUser.js", async () => {});
stub("utils/sendMail.js", async () => {});
stub("helpers/zcash/zcashHelper.js", {
  getDefaultZcashParams: async () => ({
    accountName: "Main",
    chain: "mainnet",
    serverUrl: "http://fake",
    dataDir: "/tmp/unused",
    teamId: null,
    isDefault: true,
  }),
  getLatestZcashParams: async () => null,
});
stub("utils/zingo/zingoLibQuickSend.js", (recipients, params) => {
  sentBatches.push(recipients.map((r) => r.bountyId));
  return sendImpl(recipients, params);
});
stub("helpers/db-query.js", {});
stub("zcash/init.js", {});
stub("helpers/zcash/resolvePayingWallet.js", {});

// Only the payout routes are under test; the others are empty routers.
const express = require("express");
for (const name of [
  "auth", "bounties", "bountyChat", "zcash", "teams", "kpis", "users",
  "notifications", "leaderboard", "versions", "adminSettings",
]) {
  stub(`routes/${name}.js`, express.Router());
}

// ─── Harness ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
const exitCalls = [];
const realExit = process.exit;
const realCreateServer = http.createServer;
const realSetTimeout = global.setTimeout;
const realConsoleError = console.error;
// Timers of a minute or more that the server sets while starting. The test
// runs them itself instead of waiting.
const startupTimers = [];

const waitFor = async (check, ms = 1000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => realSetTimeout(resolve, 5));
  }
  return check();
};

before(async () => {
  let started;
  const ready = new Promise((resolve) => (started = resolve));
  console.log = (message) => {
    if (String(message).startsWith("Server running")) started();
  };
  console.warn = () => {};
  // The settle-failure test logs this on purpose; anything else still shows.
  console.error = (...args) => {
    if (!/but not recorded/.test(String(args[0]))) realConsoleError(...args);
  };
  process.exit = (code) => {
    exitCalls.push(code);
  };
  global.setTimeout = (fn, ms, ...args) => {
    if (ms >= 60 * 1000) {
      startupTimers.push({ fn, ms });
      return { unref() {}, ref() {} };
    }
    return realSetTimeout(fn, ms, ...args);
  };
  // server.js keeps its http server to itself; catch it on the way out.
  http.createServer = (...args) => (server = realCreateServer(...args));
  process.env.PORT = "0";
  try {
    require("../server");
    await ready;
  } finally {
    http.createServer = realCreateServer;
    global.setTimeout = realSetTimeout;
  }
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  process.exit = realExit;
  server.closeAllConnections();
  server.close();
});

const post = async (url, body) => {
  const res = await fetch(baseUrl + url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const pay = (bountyIds) => post("/api/transactions/authorize-payment", { bountyIds });
const find = (id) => bounties.find((b) => b.id === id);
const recordFor = (bountyId) => txRows.find((r) => r.bountyId === bountyId);

const sent = async () => ({ txids: [TXID], error: null, timedOut: false, raw: `{"txids":["${TXID}"]}` });

describe("payouts cut off before they settle", () => {
  it("a payout left PENDING by an earlier process becomes resolvable a send timeout after the next start", async () => {
    // Nothing moves at start: a send the old process handed to the wallet
    // just before it stopped may still land.
    assert.equal(recordFor("b1").status, "PENDING");
    assert.equal(recordFor("b2").status, "PENDING");
    assert.equal(startupTimers.length, 1, "no recovery was scheduled at start");

    const { SEND_TIMEOUT_MS } = require("../utils/zingo/sendTimeout");
    assert.ok(startupTimers[0].ms > SEND_TIMEOUT_MS);

    // This process's own claim, made after the start.
    txRows.push({ id: "r-live", bountyId: "b-live", batchKey: "live", status: "PENDING", createdAt: new Date() });
    startupTimers[0].fn();
    const old = recordFor("b1");
    await waitFor(() => old.status !== "PENDING");

    assert.equal(old.status, "UNKNOWN");
    assert.match(old.errorDetail, /restarted during the send/);
    assert.equal(recordFor("b2").status, "UNKNOWN");
    assert.equal(recordFor("b-live").status, "PENDING");
    // Still locked until an admin checks the wallet history.
    assert.equal(find("b1").paymentInFlight, true);

    const resolved = await post(`/api/transactions/records/${old.id}/resolve`, {
      outcome: "broadcast",
      txid: TXID,
    });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assert.equal(old.status, "BROADCAST");
    assert.equal(find("b1").isPaid, true);
    assert.equal(find("b1").paymentInFlight, false);
  });

  it("records who paid and from which wallet", async () => {
    sendImpl = sent;
    const { status } = await pay(["b3"]);

    assert.equal(status, 200);
    const record = recordFor("b3");
    assert.equal(record.status, "BROADCAST");
    assert.equal(record.initiatedBy, "admin1");
    assert.equal(record.walletAccount, "Main");
    assert.equal(record.chain, "MAIN");
  });

  it("keeps the txid and a resolvable record when the settle write fails after the send", async () => {
    sendImpl = sent;
    failNextSettle = true;
    failRecordWrites = 1; // the first fallback write fails too
    const bumpsBefore = cacheBumps;
    const { status, body } = await pay(["b4"]);

    assert.equal(status, 502);
    assert.equal(body.outcome, "unknown");
    assert.deepEqual(body.txids, [TXID]);
    const record = recordFor("b4");
    assert.equal(record.status, "UNKNOWN");
    assert.equal(record.txid, TXID);
    assert.ok(record.errorDetail.includes(TXID), record.errorDetail);
    assert.ok(record.rawResult.includes(TXID));
    // Locked, not released: the money went out.
    assert.equal(find("b4").paymentInFlight, true);
    assert.equal(find("b4").isPaid, false);
    assert.ok(cacheBumps > bumpsBefore, "bounty caches were not refreshed");
  });

  it("shutdown waits for a running payout to settle, refuses new ones, and a second signal exits at once", async () => {
    let finishSend;
    sendImpl = () => new Promise((resolve) => (finishSend = () => resolve(sent())));
    const running = pay(["b5"]);
    assert.ok(await waitFor(() => finishSend), "the send did not start");

    process.emit("SIGTERM");
    await new Promise((resolve) => realSetTimeout(resolve, 50));
    assert.deepEqual(exitCalls, [], "exited while a payout was still sending");
    assert.equal(disconnected, false);

    const refused = await pay(["b6"]);
    assert.equal(refused.status, 503);
    assert.equal(recordFor("b6"), undefined);
    assert.equal(find("b6").paymentInFlight, false);

    process.emit("SIGINT");
    assert.deepEqual(exitCalls, [1], "a second signal did not exit at once");

    finishSend();
    assert.equal((await running).status, 200);
    assert.ok(await waitFor(() => exitCalls.length > 1), "never exited");
    assert.deepEqual(exitCalls, [1, 0]);
    assert.equal(recordFor("b5").status, "BROADCAST");
    assert.equal(find("b5").isPaid, true);
    assert.equal(disconnected, true);
    assert.deepEqual(sentBatches.at(-1), ["b5"]);
  });
});
