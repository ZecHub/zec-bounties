// POST /api/transactions/authorize-payment settles bounties from what
// quicksend returns. Only a txid proves a payment; everything else must
// leave the bounties either released (nothing sent) or locked (unknown).
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// ─── In-memory stand-ins for the route's collaborators ─────────────────────

let bounties;
let txRows;
let sendImpl;

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, cond]) =>
    cond && typeof cond === "object" && "in" in cond
      ? cond.in.includes(row[key])
      : row[key] === cond,
  );

const prisma = {
  bounty: {
    findMany: async ({ where }) =>
      bounties.filter((b) => matches(b, where)).map((b) => ({ ...b })),
    updateMany: async ({ where, data }) => {
      const hit = bounties.filter((b) => matches(b, where));
      hit.forEach((b) => Object.assign(b, data));
      return { count: hit.length };
    },
  },
  transaction: {
    createMany: async ({ data }) => {
      data.forEach((row) => txRows.push({ status: "PENDING", ...row }));
      return { count: data.length };
    },
    updateMany: async ({ where, data }) => {
      const hit = txRows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  },
  $transaction: async (arg) =>
    typeof arg === "function" ? arg(prisma) : Promise.all(arg),
};

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
  sendRealtimeUpdate: () => {},
  sendToUser: () => {},
});
stub("utils/cache.js", {
  delCache: async () => {},
  deleteCacheByPattern: async () => {},
  // bumpVersion is used by the canonical utils/bountyHelpers.invalidateBounty;
  // stub it so this suite stays green if the payout path is later routed
  // through that shared helper (see coordination issue #9).
  bumpVersion: async () => {},
});
// The canonical invalidateBounty also fans out to email + push notifications
// and web-push's VAPID init throws without keys. Stub both to async noops so
// requiring the router never triggers those side effects.
stub("utils/notifyUser.js", async () => {});
stub("utils/sendMail.js", async () => {});
stub("helpers/zcash/zcashHelper.js", {
  getDefaultZcashParams: async () => ({
    accountName: "Main",
    chain: "mainnet",
    serverUrl: "http://fake",
    dataDir: "/tmp/unused",
  }),
  getLatestZcashParams: async () => null,
});
stub("utils/zingo/zingoLibQuickSend.js", (...args) => sendImpl(...args));
// Imported by the router but unused on this path; each builds its own
// Prisma client.
stub("helpers/db-query.js", {});
stub("zcash/init.js", {});
stub("helpers/zcash/resolvePayingWallet.js", {});

const express = require("express");
const router = require("../routes/transactions");

// ─── Harness ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/transactions", router);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log = () => {};
  console.error = () => {};
});

after(() => server.close());

beforeEach(() => {
  bounties = [
    {
      id: "b1",
      title: "Guide",
      chain: "MAIN",
      bountyAmount: 0.3,
      status: "DONE",
      isApproved: true,
      isPaid: false,
      paymentInFlight: false,
      assigneeUser: { id: "u1", UA_address: "u1recipient" },
    },
  ];
  txRows = [];
});

const pay = async () => {
  const res = await fetch(`${baseUrl}/api/transactions/authorize-payment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bountyIds: ["b1"] }),
  });
  return { status: res.status, body: await res.json() };
};

const TXID = "a".repeat(64);

describe("POST /authorize-payment settlement", () => {
  it("marks the bounty paid only with a txid", async () => {
    sendImpl = async () => ({ txids: [TXID], error: null, timedOut: false, raw: "{}" });
    const { status, body } = await pay();

    assert.equal(status, 200);
    assert.deepEqual(body.txids, [TXID]);
    assert.equal(bounties[0].isPaid, true);
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(txRows[0].status, "BROADCAST");
    assert.equal(txRows[0].txid, TXID);
  });

  for (const [name, result] of [
    ["an unparsable result", []],
    ["another command's output", { sync_status: "complete" }],
    ["a timeout", { txids: [], error: null, timedOut: true, raw: "" }],
  ]) {
    it(`locks the bounty as UNKNOWN on ${name}`, async () => {
      sendImpl = async () => result;
      const { status, body } = await pay();

      assert.equal(status, 502);
      assert.equal(body.outcome, "unknown");
      assert.equal(bounties[0].isPaid, false);
      assert.equal(bounties[0].paymentInFlight, true);
      assert.equal(txRows[0].status, "UNKNOWN");
    });
  }

  it("releases the bounty when zingo reports an error", async () => {
    sendImpl = async () => ({
      txids: [],
      error: "Insufficient balance",
      timedOut: false,
      raw: "",
    });
    const { status } = await pay();

    assert.equal(status, 422);
    assert.equal(bounties[0].isPaid, false);
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(txRows[0].status, "FAILED");
  });

  it("releases the bounty when the send is refused before writing", async () => {
    sendImpl = async () => {
      throw new Error("Refusing to send to malformed address");
    };
    const { status, body } = await pay();

    assert.equal(status, 503);
    assert.match(body.details, /malformed address/);
    assert.equal(bounties[0].isPaid, false);
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(txRows[0].status, "FAILED");
  });
});
