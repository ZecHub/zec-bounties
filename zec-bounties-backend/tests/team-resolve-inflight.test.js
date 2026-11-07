// A team payout's PENDING row can be older than the 10-minute staleness
// window while its send is still live: sends on one wallet are serialized by
// withSendLock, and a send's own 6-minute quicksend timeout only starts once
// it holds the lock. Resolving such a row as "failed" re-opens the bounty, so
// a re-payment is claimed while the original send is still going out, and
// the assignee is paid twice. Age alone is not evidence that a send is dead.
//
// Runs the real teams.js routes, the real zingoLibQuickSend/withSendLock, and
// a fake ZingoProcess whose quicksend the test settles by hand.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// ── Controllable clock: the resolve route compares Date.now() to createdAt.
const realNow = Date.now;
let clockOffset = 0;
const MIN = 60 * 1000;

// ── Fake zingo process: every quicksend parks until the test settles it.
let sends;
class FakeZingoProcess {
  constructor() {
    this.exited = false;
    this.proc = { killed: false, pid: 0, on() {} };
  }
  destroy() {
    this.exited = true;
  }
  quicksend(recipients) {
    return new Promise((resolve) => {
      sends.push({ recipients, resolve, settled: false });
    });
  }
}
stub("utils/zingo/ZingoProcess.js", FakeZingoProcess);

// ── In-memory database.
let bounties;
let records;
let nextId;

const matchValue = (actual, expected) => {
  if (expected && typeof expected === "object" && !(expected instanceof Date)) {
    if ("in" in expected) return expected.in.includes(actual);
    if ("not" in expected) return actual !== expected.not;
  }
  return actual === expected;
};
const matches = (row, where = {}) =>
  Object.entries(where).every(([k, v]) => matchValue(row[k], v));

const fakePrisma = {
  teamWallet: {
    findUnique: async () => ({
      teamId: "team1",
      chain: "testnet",
      serverUrl: "https://testnet.example:443",
      accountName: "team-acct",
    }),
  },
  zcashParams: { findFirst: async () => ({ walletId: "w1" }) },
  team: { findUnique: async () => null },
  teamMember: { findMany: async () => [], findUnique: async () => null, findFirst: async () => null },
  user: { findMany: async () => [] },
  bounty: {
    findMany: async ({ where }) =>
      bounties.filter((b) => matches(b, where)).map((b) => ({ ...b })),
    findUnique: async ({ where }) => bounties.find((b) => b.id === where.id) || null,
    updateMany: async ({ where, data }) => {
      const hit = bounties.filter((b) => matches(b, where));
      hit.forEach((b) => Object.assign(b, data));
      return { count: hit.length };
    },
    update: async ({ where, data }) =>
      Object.assign(bounties.find((b) => b.id === where.id), data),
  },
  transaction: {
    createMany: async ({ data }) => {
      data.forEach((row) =>
        records.push({
          id: `r${nextId++}`,
          status: "PENDING",
          createdAt: new Date(Date.now()),
          ...row,
        }),
      );
      return { count: data.length };
    },
    findUnique: async ({ where }) => {
      const r = records.find((x) => x.id === where.id);
      if (!r) return null;
      const b = bounties.find((x) => x.id === r.bountyId);
      return { ...r, bounty: b ? { id: b.id, teamId: b.teamId } : null };
    },
    updateMany: async ({ where, data }) => {
      const hit = records.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  },
  $transaction: async (arg) =>
    typeof arg === "function" ? arg(fakePrisma) : Promise.all(arg),
};

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
  sendUserUpdated: () => {},
});
stub("utils/cache.js", {
  delCache: async () => {},
  deleteCacheByPattern: async () => {},
  getCache: async () => null,
  setCache: async () => {},
  getVersion: async () => 1,
  bumpVersion: async () => {},
});
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
const quietError = console.error;
const quietLog = console.log;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/teams", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.error = () => {};
  console.log = () => {};
  Date.now = () => realNow() + clockOffset;
});

after(() => {
  Date.now = realNow;
  console.error = quietError;
  console.log = quietLog;
  server.close();
});

const TEAM = "team1";
const TXID_B = "b".repeat(64);
const TXID_C = "c".repeat(64);

const makeBounty = (id, addr) => ({
  id,
  title: `Bounty ${id}`,
  teamId: TEAM,
  status: "DONE",
  isApproved: true,
  isPaid: false,
  paymentInFlight: false,
  exportedAt: null,
  chain: "TEST",
  bountyAmount: 1,
  assigneeUser: { id: `u-${id}`, name: id, z_address: addr, UA_address: null },
});

beforeEach(() => {
  sends = [];
  nextId = 1;
  clockOffset = 0;
  bounties = [makeBounty("b1", "ztestaddrone"), makeBounty("b2", "ztestaddrtwo")];
  records = [];
});

const post = (url, body) =>
  fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));

const pay = (bountyIds) =>
  post(`/api/teams/${TEAM}/wallet/authorize-payment`, { bountyIds });
const resolve = (id, body) =>
  post(`/api/teams/${TEAM}/wallet/payment-records/${id}/resolve`, body);

const tick = () => new Promise((r) => setTimeout(r, 5));
async function waitFor(cond, what) {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${what}`);
}

const sendsTo = (addr) =>
  sends.filter((s) => s.recipients.some((r) => r.address === addr)).length;

describe("team payment-record resolve vs a live send", () => {
  it("refuses to re-open a PENDING record whose send is still running", async () => {
    // t=0: pay b1; its send takes the team wallet's send lock and hangs.
    const payA = pay(["b1"]);
    await waitFor(() => sends.length === 1, "send A to start");

    // t=1m: pay b2; claimed (PENDING row written), but its send waits on the lock.
    clockOffset = 1 * MIN;
    const payB = pay(["b2"]);
    await waitFor(() => records.some((r) => r.bountyId === "b2"), "claim B");
    await tick();
    assert.equal(sends.length, 1, "send B must still be queued behind send A");
    const recordB = records.find((r) => r.bountyId === "b2");

    // t=6m: send A hits its quicksend timeout; send B now starts (its own
    // 6-minute timeout runs until t=12m).
    clockOffset = 6 * MIN;
    sends[0].resolve({ txids: [], error: null, timedOut: true });
    assert.equal((await payA).status, 502);
    await waitFor(() => sends.length === 2, "send B to start");

    // t=11m: B's row is "stale" by createdAt (10 min old) and the UI shows
    // Resolve on it, but its send is live right now.
    clockOffset = 11 * MIN;
    const resolved = await resolve(recordB.id, { outcome: "failed", confirm: true });

    // The admin re-pays b2 if the bounty was re-opened.
    const payC = pay(["b2"]);
    let payCResult;
    payC.then((r) => (payCResult = r));
    await tick();

    // Send B goes through after all.
    sends[1].resolve({ txids: [TXID_B], error: null, timedOut: false });
    assert.equal((await payB).status, 200);

    // Let a re-payment (if one was claimed) reach the wallet and succeed.
    await waitFor(() => {
      const c = sends[2];
      if (c && !c.settled) {
        c.settled = true;
        c.resolve({ txids: [TXID_C], error: null, timedOut: false });
      }
      return payCResult !== undefined;
    }, "re-payment to settle");

    assert.equal(sendsTo("ztestaddrtwo"), 1, "bounty b2 was sent to its assignee twice");
    assert.equal(resolved.status, 409, "a PENDING record with a live send must not be resolvable");
    // b2 is still in flight, so the re-payment finds nothing payable.
    assert.equal(payCResult.status, 400);
    assert.equal(bounties.find((b) => b.id === "b2").isPaid, true);
  });

  it("still lets an admin resolve a stale PENDING record with no live send", async () => {
    // e.g. the server restarted mid-send: nothing in this process is sending it.
    bounties[1].paymentInFlight = true;
    records.push({
      id: "stuck",
      bountyId: "b2",
      batchKey: "old-batch",
      status: "PENDING",
      createdAt: new Date(realNow() - 30 * MIN),
    });
    const { status } = await resolve("stuck", { outcome: "failed", confirm: true });
    assert.equal(status, 200);
    assert.equal(records[0].status, "FAILED");
    assert.equal(bounties[1].paymentInFlight, false);
  });
});
