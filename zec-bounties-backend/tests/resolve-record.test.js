// POST /api/transactions/records/:id/resolve is how an admin settles a send
// whose outcome the server never saw. Resolving as failed re-opens the bounty
// for payment, so anything short of an explicit, checked "failed" must not.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

let bounties;
let records;

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

const prisma = {
  bounty: {
    update: async ({ where, data }) =>
      Object.assign(bounties.find((b) => b.id === where.id), data),
  },
  transaction: {
    findUnique: async ({ where }) =>
      records.find((r) => r.id === where.id) || null,
    update: async ({ where, data }) =>
      Object.assign(records.find((r) => r.id === where.id), data),
    updateMany: async ({ where, data }) => {
      // Yield first, like a real round trip, so concurrent requests interleave.
      await new Promise((resolve) => setImmediate(resolve));
      const hit = records.filter((r) => matches(r, where));
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
// Imported by the router but unused on this path; each builds its own
// Prisma client.
stub("helpers/db-query.js", {});
stub("zcash/init.js", {});
stub("helpers/zcash/resolvePayingWallet.js", {});
stub("helpers/zcash/zcashHelper.js", {});

const express = require("express");
const router = require("../routes/transactions");

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/transactions", router);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.error = () => {};
});

after(() => server.close());

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
const TXID = "A".repeat(64);

beforeEach(() => {
  bounties = [{ id: "b1", isPaid: false, paymentInFlight: true }];
  records = [
    { id: "r1", bountyId: "b1", status: "UNKNOWN", createdAt: HOUR_AGO },
  ];
});

const resolve = async (body, id = "r1") => {
  const res = await fetch(
    `${baseUrl}/api/transactions/records/${id}/resolve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, body: await res.json() };
};

const assertUntouched = () => {
  assert.equal(records[0].status, "UNKNOWN");
  assert.equal(bounties[0].paymentInFlight, true);
  assert.equal(bounties[0].isPaid, false);
};

describe("POST /records/:id/resolve", () => {
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
      assertUntouched();
    });
  }

  it("returns 404 for an unknown record", async () => {
    const { status } = await resolve(
      { outcome: "failed", confirm: true },
      "missing",
    );
    assert.equal(status, 404);
  });

  it("refuses to resolve an already settled record", async () => {
    records[0].status = "BROADCAST";
    const { status } = await resolve({ outcome: "failed", confirm: true });
    assert.equal(status, 409);
    assert.equal(bounties[0].paymentInFlight, true);
  });

  it("refuses to resolve a PENDING record, however old, since its send may still be queued", async () => {
    // The send's timeout starts only once it is written, and the shared
    // wallet queue is unbounded, so an old PENDING row is not proof the send
    // is dead. Resolving it as failed could reopen a bounty that later pays.
    for (const createdAt of [new Date(), new Date(Date.now() - 60 * 60 * 1000)]) {
      records[0].status = "PENDING";
      records[0].createdAt = createdAt;
      const { status } = await resolve({ outcome: "failed", confirm: true });
      assert.equal(status, 409);
      assert.equal(records[0].status, "PENDING");
      assert.equal(bounties[0].paymentInFlight, true);
      assert.equal(bounties[0].isPaid, false);
    }
  });

  it("applies only one of two concurrent resolutions", async () => {
    const [paid, failed] = await Promise.all([
      resolve({ outcome: "broadcast", txid: TXID }),
      resolve({ outcome: "failed", confirm: true }),
    ]);

    assert.deepEqual([paid.status, failed.status].sort(), [200, 409]);
    if (paid.status === 200) {
      assert.equal(records[0].status, "BROADCAST");
      assert.equal(bounties[0].isPaid, true);
      assert.equal(bounties[0].paymentInFlight, false);
    } else {
      assert.equal(records[0].status, "FAILED");
      assert.equal(bounties[0].isPaid, false);
    }
  });
});
