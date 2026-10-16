// POST /api/teams/:teamId/wallet/payment-records/:id/resolve is the team-wallet
// counterpart of /api/transactions/records/:id/resolve. Resolving as failed
// re-opens the bounty for payment, so the same guards must hold here.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// Shared in-memory data the fake Prisma reads and writes.
let bounties;
let records;

const matches = (row, where = {}) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

// A barrier for the concurrency test: both requests must read the record
// (and capture its UNKNOWN status) before either is allowed to write, so the
// double-resolution race is deterministic instead of dependent on query
// timing. Disabled (null) for every other test.
let readBarrier = null;
function makeReadBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((res) => (release = res));
  return {
    async wait() {
      arrived += 1;
      if (arrived >= parties) release();
      await gate;
    },
  };
}

const fakePrisma = {
  transaction: {
    findUnique: async ({ where }) => {
      const r = records.find((x) => x.id === where.id);
      if (!r) return null;
      const bounty = bounties.find((b) => b.id === r.bountyId) || null;
      // Snapshot before the barrier so both readers return the pre-write row.
      const snapshot = {
        ...r,
        bounty: bounty ? { id: bounty.id, teamId: bounty.teamId } : null,
      };
      if (readBarrier) await readBarrier.wait();
      return snapshot;
    },
    // The current route settles with a plain update() (no status guard); the
    // fix uses updateMany() as a compare-and-swap. Support both so the base
    // handler runs and fails on assertions, not on a missing method.
    update: async ({ where, data }) =>
      Object.assign(records.find((r) => r.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const hit = records.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  },
  bounty: {
    update: async ({ where, data }) =>
      Object.assign(bounties.find((b) => b.id === where.id), data),
  },
  $transaction: async (arg) =>
    typeof arg === "function" ? arg(fakePrisma) : Promise.all(arg),
};

// teams.js does `new PrismaClient()` directly; hand every instance the shared fake.
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
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.error = () => {};
});

after(() => server.close());

const TEAM = "team1";
const TXID = "B".repeat(64);

beforeEach(() => {
  bounties = [{ id: "b1", teamId: TEAM, isPaid: false, paymentInFlight: true }];
  records = [{ id: "r1", bountyId: "b1", status: "UNKNOWN" }];
  readBarrier = null;
});

const resolve = async (body, id = "r1", teamId = TEAM) => {
  const res = await fetch(
    `${baseUrl}/api/teams/${teamId}/wallet/payment-records/${id}/resolve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, body: await res.json() };
};

const assertLocked = () => {
  assert.equal(records[0].status, "UNKNOWN");
  assert.equal(bounties[0].paymentInFlight, true);
  assert.equal(bounties[0].isPaid, false);
};

describe("POST /:teamId/wallet/payment-records/:id/resolve", () => {
  it("marks the bounty paid with the wallet's txid", async () => {
    const { status } = await resolve({ outcome: "broadcast", txid: TXID });
    assert.equal(status, 200);
    assert.equal(records[0].status, "BROADCAST");
    assert.equal(records[0].txid, TXID.toLowerCase());
    assert.equal(bounties[0].isPaid, true);
    assert.equal(bounties[0].paymentInFlight, false);
  });

  it("re-opens the bounty only on a confirmed failure", async () => {
    const { status } = await resolve({ outcome: "failed", confirm: true });
    assert.equal(status, 200);
    assert.equal(records[0].status, "FAILED");
    assert.equal(bounties[0].isPaid, false);
    assert.equal(bounties[0].paymentInFlight, false);
  });

  for (const [name, body] of [
    ["a missing outcome", {}],
    ["a misspelled outcome", { outcome: "Broadcast", txid: TXID }],
    ["a failure without confirm", { outcome: "failed" }],
    ["broadcast without a txid", { outcome: "broadcast" }],
    ["broadcast with a malformed txid", { outcome: "broadcast", txid: "abc" }],
  ]) {
    it(`rejects ${name} and leaves the bounty locked`, async () => {
      const { status } = await resolve(body);
      assert.equal(status, 400);
      assertLocked();
    });
  }

  it("returns 404 for a record on another team", async () => {
    bounties[0].teamId = "other-team";
    const { status } = await resolve({ outcome: "failed", confirm: true });
    assert.equal(status, 404);
    assertLocked();
  });

  it("refuses an already-settled record", async () => {
    records[0].status = "BROADCAST";
    const { status } = await resolve({ outcome: "failed", confirm: true });
    assert.equal(status, 409);
  });

  it("applies only one of two concurrent resolutions", async () => {
    // Force both requests to read UNKNOWN before either settles, so the
    // regression is deterministic: the base route (unconditional update)
    // lets both apply; the fix (CAS on UNKNOWN) lets only one win.
    readBarrier = makeReadBarrier(2);
    const [paid, failed] = await Promise.all([
      resolve({ outcome: "broadcast", txid: TXID }),
      resolve({ outcome: "failed", confirm: true }),
    ]);
    assert.deepEqual([paid.status, failed.status].sort(), [200, 409]);
    if (paid.status === 200) {
      assert.equal(records[0].status, "BROADCAST");
      assert.equal(bounties[0].isPaid, true);
    } else {
      assert.equal(records[0].status, "FAILED");
      assert.equal(bounties[0].isPaid, false);
    }
  });
});
