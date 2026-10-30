// POST /api/teams/:teamId/wallet/authorize-payment pays team bounties from
// the team wallet, with the same claim, send and settle steps as the admin
// route. A record must say who paid from which wallet, a send refused before
// anything was written must release the bounties, and an unclear or
// unrecorded send must leave a resolvable UNKNOWN record that says why.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const TEAM = "team1";
const TXID = "c".repeat(64);

let bounties;
let txRows;
let sendImpl;
let failNextSettle;

// A field the fixture leaves out reads as null, as an unset column would.
const matches = (row, where = {}) =>
  Object.entries(where).every(([key, cond]) =>
    cond && typeof cond === "object" && "in" in cond
      ? cond.in.includes(row[key])
      : (row[key] ?? null) === cond,
  );

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

const fakePrisma = {
  teamWallet: {
    findUnique: () =>
      lazy(() => ({
        teamId: TEAM,
        accountName: "TeamMain",
        chain: "mainnet",
        serverUrl: "http://fake",
      })),
  },
  zcashParams: { findFirst: () => lazy(() => ({ walletId: "team-wallet" })) },
  team: { findUnique: () => lazy(() => null) },
  bounty: {
    findMany: ({ where }) =>
      lazy(() => bounties.filter((b) => matches(b, where)).map((b) => ({ ...b }))),
    updateMany: ({ where, data }) =>
      lazy(() => {
        const hit = bounties.filter((b) => matches(b, where));
        hit.forEach((b) => Object.assign(b, data));
        return { count: hit.length };
      }),
  },
  transaction: {
    createMany: ({ data }) =>
      lazy(() => {
        data.forEach((row) => txRows.push({ status: "PENDING", ...row }));
        return { count: data.length };
      }),
    updateMany: ({ where, data }) =>
      lazy(() => {
        const hit = txRows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
  },
  $transaction: async (arg) => {
    if (typeof arg === "function") return arg(fakePrisma);
    if (failNextSettle) {
      failNextSettle = false;
      throw new Error("Can't reach database server");
    }
    return Promise.all(arg);
  },
};

// teams.js does `new PrismaClient()` directly; hand every instance the fake.
{
  const file = require.resolve("@prisma/client");
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: { PrismaClient: function () { return fakePrisma; } },
  };
}
stub("middleware/auth.js", {
  authenticate: (req, res, next) => {
    req.user = { id: "admin1", role: "ADMIN" };
    next();
  },
  optionalAuthenticate: (req, res, next) => next(),
});
stub("middleware/websocket.js", {
  sendRealtimeUpdate: () => {},
  sendToUser: () => {},
});
stub("utils/cache.js", {
  delCache: async () => {},
  deleteCacheByPattern: async () => {},
  getCache: async () => null,
  setCache: async () => {},
  getVersion: async () => 1,
  bumpVersion: async () => {},
});
stub("utils/zingo/zingoLibQuickSend.js", (...args) => sendImpl(...args));
// web-push is pulled in transitively and calls setVapidDetails at load,
// which throws without VAPID env. Stub it — this route sends no push.
{
  const file = require.resolve("web-push");
  require.cache[file] = {
    id: file, filename: file, loaded: true,
    exports: { setVapidDetails() {}, sendNotification: async () => {}, generateVAPIDKeys: () => ({}) },
  };
}

const express = require("express");
const router = require("../routes/teams");

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/teams", router);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log = () => {};
  console.error = () => {};
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  bounties = ["b1", "b2"].map((id) => ({
    id,
    title: `Team bounty ${id}`,
    teamId: TEAM,
    chain: "MAIN",
    bountyAmount: 0.2,
    status: "DONE",
    isApproved: true,
    isPaid: false,
    paymentInFlight: false,
    assigneeUser: { id: `u-${id}`, UA_address: `u${id}recipient` },
  }));
  txRows = [];
  failNextSettle = false;
});

const pay = async (bountyIds = ["b1"]) => {
  const res = await fetch(`${baseUrl}/api/teams/${TEAM}/wallet/authorize-payment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bountyIds }),
  });
  return { status: res.status, body: await res.json() };
};

const sent = async () => ({ txids: [TXID], error: null, timedOut: false, raw: `{"txids":["${TXID}"]}` });

describe("team payout interruptions", () => {
  it("records who paid and from which wallet", async () => {
    sendImpl = sent;
    const { status } = await pay();

    assert.equal(status, 200);
    assert.equal(txRows[0].status, "BROADCAST");
    assert.equal(txRows[0].initiatedBy, "admin1");
    assert.equal(txRows[0].walletAccount, "TeamMain");
    assert.equal(txRows[0].chain, "MAIN");
  });

  it("releases the bounties when the send is refused before anything is written", async () => {
    sendImpl = async () => {
      throw new Error("zingo process has exited");
    };
    const { status } = await pay();

    assert.equal(status, 503);
    assert.equal(txRows[0].status, "FAILED");
    assert.equal(txRows[0].errorDetail, "zingo process has exited");
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(bounties[0].isPaid, false);
  });

  it("keeps a timed-out send locked, with the reason", async () => {
    sendImpl = async () => ({ txids: [], error: null, timedOut: true, raw: "Sending..." });
    const { status } = await pay();

    assert.equal(status, 502);
    assert.equal(txRows[0].status, "UNKNOWN");
    assert.match(txRows[0].errorDetail, /Timed out/);
    assert.equal(bounties[0].paymentInFlight, true);
  });

  it("keeps the txid and a resolvable record when the settle write fails after the send", async () => {
    sendImpl = sent;
    failNextSettle = true;
    const { status, body } = await pay();

    assert.equal(status, 502);
    assert.deepEqual(body.txids, [TXID]);
    assert.equal(txRows[0].status, "UNKNOWN");
    assert.equal(txRows[0].txid, TXID);
    assert.ok(txRows[0].errorDetail.includes(TXID), txRows[0].errorDetail);
    assert.equal(bounties[0].paymentInFlight, true);
    assert.equal(bounties[0].isPaid, false);
  });

  // Runs last: shutdown cannot be undone in this process.
  it("refuses new payouts once shutdown starts, and stops waiting after its bound", async () => {
    const { drainPayouts } = require("../utils/payoutRecovery");
    let finishSend;
    sendImpl = () => new Promise((resolve) => (finishSend = () => resolve(sent())));
    const running = pay(["b1"]);
    const deadline = Date.now() + 1000;
    while (!finishSend && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(finishSend, "the send did not start");

    assert.equal(await drainPayouts(50), false);
    const refused = await pay(["b2"]);
    assert.equal(refused.status, 503);
    assert.equal(bounties[1].paymentInFlight, false);
    assert.equal(txRows.some((r) => r.bountyId === "b2"), false);

    finishSend();
    assert.equal((await running).status, 200);
  });
});
