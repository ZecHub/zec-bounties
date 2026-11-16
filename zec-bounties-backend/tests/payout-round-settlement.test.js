// The platform payout routes move the approved payout round along with the
// send: a clean failure hands the round back (DECIDED) so it can fund the
// retry, a success leaves it EXECUTED, and a manual "failed" cancels it.
// PayoutProposal has `bountyIds String[]` and no `bountyId`; the stub rejects
// unknown fields the way Prisma does, so a query on a missing field fails here
// as it does against the database.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// Field names of the PayoutProposal model, read from the schema itself.
const schema = fs.readFileSync(
  path.join(__dirname, "..", "prisma", "schema.prisma"),
  "utf8",
);
const proposalFields = new Set(
  schema
    .match(/model PayoutProposal \{([\s\S]*?)\n\}/)[1]
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => /^[a-zA-Z]\w*$/.test(name)),
);

// ─── In-memory stand-ins for the route's collaborators ─────────────────────

let bounties;
let txRows;
let rounds;
let sendImpl;

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object") {
      if ("in" in cond) return cond.in.includes(row[key]);
      if ("has" in cond) return row[key].includes(cond.has);
      if ("hasSome" in cond)
        return cond.hasSome.some((id) => row[key].includes(id));
    }
    return row[key] === cond;
  });

const prisma = {
  bounty: {
    findMany: async ({ where }) =>
      bounties.filter((b) => matches(b, where)).map((b) => ({ ...b })),
    update: async ({ where, data }) =>
      Object.assign(bounties.find((b) => b.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const hit = bounties.filter((b) => matches(b, where));
      hit.forEach((b) => Object.assign(b, data));
      return { count: hit.length };
    },
  },
  transaction: {
    findUnique: async ({ where }) =>
      txRows.find((r) => r.id === where.id) || null,
    createMany: async ({ data }) => {
      data.forEach((row, i) =>
        txRows.push({ id: `tx${txRows.length + i}`, status: "PENDING", ...row }),
      );
      return { count: data.length };
    },
    updateMany: async ({ where, data }) => {
      const hit = txRows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  },
  payoutProposal: {
    updateMany: async ({ where, data }) => {
      for (const key of Object.keys(where)) {
        if (!proposalFields.has(key))
          throw new Error(`Unknown argument \`${key}\` on PayoutProposal`);
      }
      const hit = rounds.filter((r) => matches(r, where));
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
  bumpVersion: async () => {},
});
stub("utils/notifyUser.js", async () => {});
stub("utils/sendMail.js", async () => {});
// One DECIDED round per bounty; consuming it is the DECIDED -> EXECUTED swap.
stub("utils/payoutProposals.js", {
  loadDecidedProposals: async (db, rows) => {
    const usable = new Map();
    for (const bounty of rows) {
      const round = rounds.find(
        (r) => r.status === "DECIDED" && r.bountyIds.includes(bounty.id),
      );
      if (round) usable.set(bounty.id, { ...round, recipient: "u1recipient" });
    }
    return { usable, rejected: new Map() };
  },
  consumeProposals: async (tx, proposals) => {
    for (const p of proposals)
      Object.assign(
        rounds.find((r) => r.id === p.id),
        { status: "EXECUTED", executedAt: new Date() },
      );
  },
});
let adminWallet;
stub("helpers/zcash/zcashHelper.js", {
  getDefaultZcashParams: async () => adminWallet,
  getLatestZcashParams: async () => null,
});
stub("utils/zingo/zingoLibQuickSend.js", (...args) => sendImpl(...args));
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
  adminWallet = {
    accountName: "Main",
    chain: "mainnet",
    serverUrl: "http://fake",
    dataDir: "/tmp/unused",
    teamId: null,
  };
  bounties = [
    {
      id: "b1",
      title: "Guide",
      teamId: null,
      chain: "MAIN",
      bountyAmount: 0.3,
      status: "DONE",
      isApproved: true,
      isPaid: false,
      paymentInFlight: false,
      exportedAt: null,
    },
  ];
  txRows = [];
  rounds = [
    { id: "round1", bountyIds: ["b1"], status: "DECIDED", executedAt: null },
  ];
});

const post = async (url, body) => {
  const res = await fetch(`${baseUrl}/api/transactions${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const TXID = "a".repeat(64);

describe("payout round follows the platform send", () => {
  it("a successful send marks the bounty paid and keeps the round EXECUTED", async () => {
    sendImpl = async () => ({ txids: [TXID], error: null, timedOut: false, raw: "{}" });
    const { status } = await post("/authorize-payment", { bountyIds: ["b1"] });

    assert.equal(status, 200);
    assert.equal(bounties[0].isPaid, true);
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(txRows[0].status, "BROADCAST");
    assert.equal(txRows[0].txid, TXID);
    assert.equal(rounds[0].status, "EXECUTED");
  });

  it("a clean failure hands the round back so it can fund the retry", async () => {
    sendImpl = async () => ({
      txids: [],
      error: "Insufficient balance",
      timedOut: false,
      raw: "",
    });
    const { status } = await post("/authorize-payment", { bountyIds: ["b1"] });

    assert.equal(status, 422);
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(txRows[0].status, "FAILED");
    assert.equal(rounds[0].status, "DECIDED");
    assert.equal(rounds[0].executedAt, null);
  });

  it("resolving an unknown send as failed cancels the round", async () => {
    sendImpl = async () => ({ txids: [], error: null, timedOut: true, raw: "" });
    const paid = await post("/authorize-payment", { bountyIds: ["b1"] });
    assert.equal(paid.status, 502);
    assert.equal(rounds[0].status, "EXECUTED");
    txRows[0].createdAt = new Date(Date.now() - 60 * 60 * 1000);

    const { status } = await post(`/records/${txRows[0].id}/resolve`, {
      outcome: "failed",
      confirm: true,
    });

    assert.equal(status, 200);
    assert.equal(txRows[0].status, "FAILED");
    assert.equal(bounties[0].paymentInFlight, false);
    assert.equal(rounds[0].status, "CANCELLED");
  });
});
