// The payout tracker: Approved -> Queued -> Broadcast -> Confirmed, the txid
// and timestamps behind it, failure messages, and what happens when the
// wallet / node can't be reached.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const { buildPayoutStatus } = require("../utils/payoutStatus");

const T0 = new Date("2026-10-10T10:00:00.000Z");
const T1 = new Date("2026-10-11T10:00:00.000Z");
const T2 = new Date("2026-10-11T10:00:20.000Z");
const T3 = new Date("2026-10-11T10:05:00.000Z");
const TXID = "ab".repeat(32);

const bounty = (extra = {}) => ({
  id: "b1",
  chain: "MAIN",
  isApproved: true,
  completedAt: T0,
  createdBy: "owner",
  assignee: "hunter",
  assignees: [],
  ...extra,
});
const record = (extra = {}) => ({
  id: "r1",
  bountyId: "b1",
  status: "BROADCAST",
  txid: TXID,
  memo: "Bounty: Fix thing (ID: b1)",
  walletAccount: "wallet-1",
  createdAt: T1,
  settledAt: T2,
  confirmedAt: null,
  lastCheckedAt: null,
  errorDetail: null,
  ...extra,
});

describe("buildPayoutStatus", () => {
  it("has no tracker until the submission is approved", () => {
    const out = buildPayoutStatus(bounty({ isApproved: false }), null);
    assert.equal(out.state, null);
  });

  it("is Approved before any payout is attempted", () => {
    const out = buildPayoutStatus(bounty(), null);
    assert.equal(out.state, "APPROVED");
    assert.equal(out.txid, null);
    assert.equal(out.timestamps.approvedAt, T0.toISOString());
    assert.equal(out.timestamps.queuedAt, null);
    assert.equal(out.error, null);
  });

  it("is Queued while the payout is claimed but not yet sent", () => {
    const out = buildPayoutStatus(
      bounty(),
      record({ status: "PENDING", txid: null, settledAt: null }),
    );
    assert.equal(out.state, "QUEUED");
    assert.equal(out.txid, null);
    assert.equal(out.memoRef, "Bounty: Fix thing (ID: b1)");
    assert.equal(out.timestamps.queuedAt, T1.toISOString());
  });

  it("is Broadcast once the wallet reports a txid", () => {
    const out = buildPayoutStatus(bounty(), record());
    assert.equal(out.state, "BROADCAST");
    assert.equal(out.txid, TXID);
    assert.equal(out.timestamps.broadcastAt, T2.toISOString());
    assert.equal(out.timestamps.confirmedAt, null);
  });

  it("is Confirmed once the transaction is mined", () => {
    const out = buildPayoutStatus(bounty(), record({ confirmedAt: T3 }));
    assert.equal(out.state, "CONFIRMED");
    assert.equal(out.timestamps.confirmedAt, T3.toISOString());
    assert.equal(out.error, null);
  });

  it("explains a failed payout and shows no wallet internals to contributors", () => {
    const failed = record({
      status: "FAILED",
      txid: null,
      errorDetail: "/srv/wallets/abc: insufficient funds",
    });
    const out = buildPayoutStatus(bounty(), failed);
    assert.equal(out.state, "APPROVED");
    assert.equal(out.error.code, "failed");
    assert.match(out.error.message, /could not be sent/);
    assert.equal(out.error.detail, undefined);
    assert.equal(out.txid, null);
  });

  it("gives admins the underlying failure detail", () => {
    const failed = record({
      status: "FAILED",
      txid: null,
      errorDetail: "insufficient funds",
    });
    const out = buildPayoutStatus(bounty(), failed, { isAdmin: true });
    assert.equal(out.error.detail, "insufficient funds");
  });

  it("holds an unknown outcome at Queued with a no-double-pay message", () => {
    const out = buildPayoutStatus(
      bounty(),
      record({ status: "UNKNOWN", txid: null, settledAt: null }),
    );
    assert.equal(out.state, "QUEUED");
    assert.equal(out.error.code, "unknown");
    assert.match(out.error.message, /won't be paid twice/);
  });

  it("flags an unreachable node on a broadcast payout but keeps the state", () => {
    const out = buildPayoutStatus(bounty(), record(), {
      backend: { reachable: false, checkedAt: T3 },
    });
    assert.equal(out.state, "BROADCAST");
    assert.equal(out.error.code, "backend_unreachable");
    assert.equal(out.backend.reachable, false);
  });

  it("never lets an unreachable node mask a real failure or a confirmation", () => {
    const down = { reachable: false, checkedAt: T3 };
    const failed = buildPayoutStatus(
      bounty(),
      record({ status: "FAILED", txid: null }),
      { backend: down },
    );
    assert.equal(failed.error.code, "failed");

    const confirmed = buildPayoutStatus(
      bounty(),
      record({ confirmedAt: T3 }),
      { backend: down },
    );
    assert.equal(confirmed.state, "CONFIRMED");
    assert.equal(confirmed.error, null);
  });
});

const {
  isTxConfirmed,
  refreshConfirmation,
  _resetForTests,
} = require("../utils/payoutConfirmation");

describe("isTxConfirmed", () => {
  it("reads zingo's status, block height or confirmation count", () => {
    assert.equal(isTxConfirmed([{ txid: TXID, status: "confirmed" }], TXID), true);
    assert.equal(isTxConfirmed([{ txid: TXID, block_height: 3000000 }], TXID), true);
    assert.equal(isTxConfirmed([{ txid: TXID, confirmations: 2 }], TXID), true);
  });

  it("is not confirmed while pending, unknown, or absent", () => {
    assert.equal(isTxConfirmed([{ txid: TXID, status: "pending" }], TXID), false);
    assert.equal(isTxConfirmed([{ txid: TXID, status: "unconfirmed" }], TXID), false);
    assert.equal(isTxConfirmed([{ txid: TXID }], TXID), false);
    assert.equal(isTxConfirmed([{ txid: "cd".repeat(32), status: "confirmed" }], TXID), false);
    assert.equal(isTxConfirmed(null, TXID), false);
  });

  it("matches the txid case-insensitively", () => {
    assert.equal(
      isTxConfirmed([{ txid: TXID.toUpperCase(), status: "confirmed" }], TXID),
      true,
    );
  });
});

describe("refreshConfirmation", () => {
  let rows;
  const db = {
    transaction: {
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  const NOW = new Date("2026-10-11T11:00:00.000Z");
  const run = (rec, fetchTransactions, extra = {}) =>
    refreshConfirmation(rec, {
      prisma: db,
      fetchTransactions,
      now: () => NOW,
      ...extra,
    });

  beforeEach(() => {
    _resetForTests();
    rows = [record()];
  });

  it("marks the payout confirmed when the wallet reports it mined", async () => {
    const out = await run(rows[0], async () => [
      { txid: TXID, status: "confirmed" },
    ]);
    assert.equal(out.backend.reachable, true);
    assert.equal(out.record.confirmedAt.toISOString(), NOW.toISOString());
    assert.equal(rows[0].confirmedAt.toISOString(), NOW.toISOString());
  });

  it("stays Broadcast while the wallet still shows it pending", async () => {
    const out = await run(rows[0], async () => [
      { txid: TXID, status: "pending" },
    ]);
    assert.equal(out.backend.reachable, true);
    assert.equal(out.record.confirmedAt, null);
    assert.equal(rows[0].lastCheckedAt.toISOString(), NOW.toISOString());
  });

  it("reports an unreachable wallet or node without changing the payout", async () => {
    const out = await run(rows[0], async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:9067");
    });
    assert.equal(out.backend.reachable, false);
    assert.equal(rows[0].status, "BROADCAST");
    assert.equal(rows[0].confirmedAt, null);
    assert.equal(rows[0].lastCheckedAt.toISOString(), NOW.toISOString());
  });

  it("treats a hung wallet as unreachable instead of waiting forever", async () => {
    const out = await run(rows[0], () => new Promise(() => {}), {
      timeoutMs: 20,
    });
    assert.equal(out.backend.reachable, false);
  });

  it("does not re-ask the wallet inside the throttle window", async () => {
    let calls = 0;
    const fetchTx = async () => {
      calls++;
      throw new Error("down");
    };
    const first = await run(rows[0], fetchTx);
    assert.equal(calls, 1);

    const second = await run({ ...rows[0] }, fetchTx);
    assert.equal(calls, 1);
    // The throttled response still remembers the node was down.
    assert.equal(second.backend.reachable, false);
    assert.equal(first.backend.reachable, false);
  });

  it("allows one wallet check at a time", async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const fetchTx = async () => {
      calls++;
      await gate;
      return [];
    };
    const a = run(rows[0], fetchTx);
    await new Promise((resolve) => setImmediate(resolve));
    const b = await run({ ...rows[0] }, fetchTx);
    release();
    await a;
    assert.equal(calls, 1);
    assert.equal(b.backend, null);
  });

  it("skips payouts that are not waiting on a confirmation", async () => {
    let calls = 0;
    const fetchTx = async () => {
      calls++;
      return [];
    };
    for (const rec of [
      record({ status: "PENDING", txid: null }),
      record({ status: "FAILED", txid: null }),
      record({ confirmedAt: T3 }),
      record({ walletAccount: null }),
    ]) {
      assert.equal((await run(rec, fetchTx)).backend, null);
    }
    assert.equal(calls, 0);
  });
});

describe("GET /api/bounties/:id/payout", () => {
  const express = require("express");
  let bounties;
  let records;
  let viewer;
  let wallet;
  let server;
  let baseUrl;
  let failUpdate;

  stub("prisma/client.js", {
    bounty: {
      findUnique: async ({ where }) =>
        bounties.find((b) => b.id === where.id) || null,
    },
    transaction: {
      findFirst: async ({ where }) =>
        records
          .filter((r) => r.bountyId === where.bountyId)
          .sort((a, b) => b.createdAt - a.createdAt)[0] || null,
      update: async ({ where, data }) => {
        if (failUpdate) throw new Error("db down");
        const row = records.find((r) => r.id === where.id);
        return Object.assign(row, data);
      },
    },
    zcashParams: {
      findFirst: async () => ({ chain: "mainnet", serverUrl: "https://zec.rocks:443" }),
    },
  });
  stub("middleware/auth.js", {
    authenticate: (req, res, next) => {
      if (!viewer) return res.status(401).json({ error: "Not authenticated" });
      req.user = viewer;
      next();
    },
  });
  stub("utils/zingo/zingoLibTransactions.js", async () => wallet());

  before(async () => {
    delete require.cache[require.resolve("../routes/payoutStatus")];
    const router = require("../routes/payoutStatus");
    const app = express();
    app.use("/api/bounties", router);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.error = () => {};
  });
  after(() => server.close());

  beforeEach(() => {
    _resetForTests();
    failUpdate = false;
    viewer = { id: "hunter", role: "HUNTER" };
    wallet = async () => [{ txid: TXID, status: "pending" }];
    bounties = [bounty()];
    records = [record()];
  });

  const get = async (id = "b1") => {
    const res = await fetch(`${baseUrl}/api/bounties/${id}/payout`);
    return { status: res.status, body: await res.json() };
  };

  it("shows the assignee their payout with txid and timestamps", async () => {
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.state, "BROADCAST");
    assert.equal(body.txid, TXID);
    assert.equal(body.timestamps.broadcastAt, T2.toISOString());
    assert.equal(body.backend.reachable, true);
  });

  it("moves to Confirmed when the wallet reports the tx mined", async () => {
    wallet = async () => [{ txid: TXID, status: "confirmed" }];
    const { body } = await get();
    assert.equal(body.state, "CONFIRMED");
    assert.ok(body.timestamps.confirmedAt);
    assert.ok(records[0].confirmedAt);
  });

  it("still answers when the Zcash backend is unreachable", async () => {
    wallet = async () => {
      throw new Error("Zingo transactions timeout");
    };
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.state, "BROADCAST");
    assert.equal(body.txid, TXID);
    assert.equal(body.error.code, "backend_unreachable");
    assert.equal(body.backend.reachable, false);
    // Raw wallet error text is not exposed.
    assert.doesNotMatch(JSON.stringify(body), /Zingo transactions timeout/);
  });

  it("still answers when recording the check itself fails", async () => {
    failUpdate = true;
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.state, "BROADCAST");
    assert.equal(body.error.code, "backend_unreachable");
  });

  it("reports a failed payout with a clear message", async () => {
    records = [
      record({ status: "FAILED", txid: null, errorDetail: "insufficient funds" }),
    ];
    const { body } = await get();
    assert.equal(body.state, "APPROVED");
    assert.equal(body.error.code, "failed");
    assert.equal(body.error.detail, undefined);
  });

  it("uses the most recent attempt when a payout was retried", async () => {
    records = [
      record({ id: "old", status: "FAILED", txid: null, createdAt: T0 }),
      record({ id: "new", status: "PENDING", txid: null, createdAt: T1, settledAt: null }),
    ];
    const { body } = await get();
    assert.equal(body.state, "QUEUED");
  });

  it("is Approved with no payout record yet", async () => {
    records = [];
    const { body } = await get();
    assert.equal(body.state, "APPROVED");
  });

  it("lets the creator and admins view it, but not other users", async () => {
    viewer = { id: "owner", role: "HUNTER" };
    assert.equal((await get()).status, 200);

    viewer = { id: "admin1", role: "ADMIN" };
    const admin = await get();
    assert.equal(admin.status, 200);

    viewer = { id: "stranger", role: "HUNTER" };
    assert.equal((await get()).status, 403);
  });

  it("recognises co-assignees", async () => {
    bounties = [bounty({ assignee: null, assignees: [{ userId: "second" }] })];
    viewer = { id: "second", role: "HUNTER" };
    assert.equal((await get()).status, 200);
  });

  it("requires sign-in and a real bounty", async () => {
    viewer = null;
    assert.equal((await get()).status, 401);
    viewer = { id: "hunter", role: "HUNTER" };
    assert.equal((await get("missing")).status, 404);
  });

  it("returns no state for a bounty that is not approved", async () => {
    bounties = [bounty({ isApproved: false })];
    records = [];
    const { body } = await get();
    assert.equal(body.state, null);
  });
});
