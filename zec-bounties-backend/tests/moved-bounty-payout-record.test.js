// A payout record belongs to the wallet that sent it. The admin records list
// and resolve route (#562) and the team ones decide ownership from the
// bounty's CURRENT teamId, so moving a bounty onto a team while its platform
// payout is unresolved hands that platform send to the team: the platform
// admin can no longer resolve it, and a team admin who checks the TEAM
// wallet's history (as the UI tells them to) won't find the send, resolves it
// as failed, and pays the hunter a second time from the team wallet.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

const TXID = "a".repeat(64);

function createDb() {
  const users = [
    { id: "admin", role: "ADMIN" },
    { id: "owner", role: "TEAM" },
    { id: "hunter", role: "HUNTER", UA_address: "u1hunter" },
  ];
  const bounties = [
    {
      id: "b1",
      title: "b1",
      teamId: null,
      createdBy: "admin",
      chain: "MAIN",
      bountyAmount: 0.5,
      status: "DONE",
      isApproved: true,
      isPaid: false,
      paymentInFlight: false,
      exportedAt: null,
      isPrivate: false,
      assignee: "hunter",
    },
  ];
  const records = [];
  const teams = [{ id: "team-1", name: "Team 1", isPrivate: false, isVerified: true }];
  const members = [{ teamId: "team-1", userId: "owner", role: "OWNER" }];

  const relations = {
    bounty: (row) => bounties.find((b) => b.id === row.bountyId) ?? null,
    createdByUser: (row) => users.find((u) => u.id === row.createdBy) ?? null,
  };
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (key in relations && value && typeof value === "object") {
        const rel = relations[key](row);
        return rel !== null && matches(rel, value);
      }
      if (value && typeof value === "object" && "in" in value) {
        return value.in.includes(row[key]);
      }
      return row[key] === value;
    });
  const withBounty = (r, include) =>
    include?.bounty ? { ...r, bounty: { ...relations.bounty(r) } } : { ...r };
  const assigneeUser = (b) => users.find((u) => u.id === b.assignee) ?? null;

  const db = {
    bounties,
    records,
    bounty: {
      findMany: async ({ where }) =>
        bounties
          .filter((b) => matches(b, where))
          .map((b) => ({ ...b, assigneeUser: assigneeUser(b) })),
      updateMany: async ({ where, data }) => {
        const hit = bounties.filter((b) => matches(b, where));
        hit.forEach((b) => Object.assign(b, data));
        return { count: hit.length };
      },
      findUnique: async ({ where }) => {
        const b = bounties.find((x) => x.id === where.id);
        return b ? { ...b } : null;
      },
      update: async ({ where, data }) => {
        const b = bounties.find((x) => x.id === where.id);
        Object.assign(b, data);
        return { ...b };
      },
    },
    transaction: {
      createMany: async ({ data }) => {
        records.push(
          ...data.map((row, i) => ({
            id: `rec-${records.length + i + 1}`,
            status: "PENDING",
            createdAt: new Date(),
            ...row,
          })),
        );
        return { count: data.length };
      },
      updateMany: async ({ where, data }) => {
        const hit = records.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      findUnique: async ({ where, include }) => {
        const r = records.find((x) => x.id === where.id);
        return r ? withBounty(r, include) : null;
      },
      findMany: async ({ where, include }) =>
        records.filter((r) => matches(r, where)).map((r) => withBounty(r, include)),
    },
    team: {
      findUnique: async ({ where }) => teams.find((t) => t.id === where.id) ?? null,
    },
    teamMember: {
      findUnique: async ({ where }) => {
        const { teamId, userId } = where.teamId_userId;
        return members.find((m) => m.teamId === teamId && m.userId === userId) ?? null;
      },
    },
    teamWallet: {
      findUnique: async () => ({
        teamId: "team-1",
        accountName: "Team",
        chain: "mainnet",
        serverUrl: "http://fake",
      }),
    },
    zcashParams: { findFirst: async () => ({ walletId: "team-wallet" }) },
    $transaction: async (arg) =>
      typeof arg === "function" ? arg(db) : Promise.all(arg),
  };
  return db;
}

// One wallet "network": every quicksend reaches the hunter. The first (platform)
// send times out after broadcasting, like a real UNKNOWN outcome.
function createNetwork() {
  const net = { sent: [], timeoutNext: 0 };
  net.quicksend = async (list, params) => {
    net.sent.push(...list.map((p) => ({ ...p, wallet: params.accountName })));
    if (net.timeoutNext > 0) {
      net.timeoutNext--;
      return { txids: [], error: null, timedOut: true, raw: "" };
    }
    return { txids: [TXID], error: null, timedOut: false, raw: "{}" };
  };
  return net;
}

function loadRoutes(file, db, net) {
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../prisma/client": db,
    crypto: require("node:crypto"),
    "../utils/exportableBounty": require("../utils/exportableBounty"),
    "../utils/zingo/zingoLibQuickSend": net.quicksend,
    "../utils/zingo/zingoLibQuickSend.js": net.quicksend,
    "../helpers/zcash/zcashHelper.js": {
      getDefaultZcashParams: async () => ({
        accountName: "Platform",
        chain: "mainnet",
        teamId: null,
      }),
      getLatestZcashParams: async () => null,
      getWalletDataDir: () => "/tmp/wallet",
    },
  };
  const filename = path.join(__dirname, "../routes", file);
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : anything),
      console: { log() {}, error() {}, warn() {} },
      process: { env: {} },
    },
    { filename },
  );
  return async (route, req) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await routes[route].at(-1)({ params: {}, body: {}, ...req }, res);
    return res;
  };
}

const ADMIN = { id: "admin", role: "ADMIN" };
const OWNER = { id: "owner", role: "TEAM" };

async function payPlatformThenMove(via = "move-page") {
  const db = createDb();
  const net = createNetwork();
  const tx = loadRoutes("transactions.js", db, net);
  const teams = loadRoutes("teams.js", db, net);
  const bounties = loadRoutes("bounties.js", db, net);

  // 1. The platform admin pays b1; the send goes out but times out -> UNKNOWN.
  net.timeoutNext = 1;
  const pay = await tx("post /authorize-payment", { user: ADMIN, body: { bountyIds: ["b1"] } });
  assert.equal(pay.statusCode, 502);
  assert.equal(db.records[0].status, "UNKNOWN");
  assert.equal(db.bounties[0].paymentInFlight, true);

  // 2. An admin moves the bounty onto a team: either from Admin -> Teams ->
  //    Move (the list offers every teamId:null admin bounty, whatever its
  //    payout state) or from the edit form (PUT /:id with teamId).
  const move =
    via === "move-page"
      ? await bounties("patch /unassigned/assign-team", {
          user: ADMIN,
          body: { teamId: "team-1", bountyIds: ["b1"] },
        })
      : await bounties("put /:id", {
          user: ADMIN,
          params: { id: "b1" },
          body: { teamId: "team-1" },
        });
  return { db, net, tx, teams, move, recordId: db.records[0].id };
}

test("the edit form cannot move a bounty whose platform payout is unresolved", async () => {
  const { db } = await payPlatformThenMove("edit-form");
  assert.equal(db.bounties[0].teamId, null);
});

test("the platform admin can still resolve a platform payout after its bounty is moved to a team", async () => {
  const { db, tx, recordId } = await payPlatformThenMove();

  const list = await tx("get /records", { user: ADMIN });
  assert.ok(
    list.body.records.some((r) => r.id === recordId),
    "the platform wallet's UNKNOWN send must stay in the platform admin's records",
  );
  const resolve = await tx("post /records/:id/resolve", {
    user: ADMIN,
    params: { id: recordId },
    body: { outcome: "broadcast", txid: TXID },
  });
  assert.equal(resolve.statusCode, 200, JSON.stringify(resolve.body));
  assert.equal(db.bounties[0].isPaid, true);
});

test("a team admin cannot re-open and re-pay a platform payout after the bounty is moved", async () => {
  const { db, net, teams, recordId } = await payPlatformThenMove();

  // 3. The team owner checks the TEAM wallet (the send isn't there: it left the
  //    platform wallet), resolves the record as failed and pays again.
  await teams("post /:teamId/wallet/payment-records/:id/resolve", {
    user: OWNER,
    params: { teamId: "team-1", id: recordId },
    body: { outcome: "failed", confirm: true },
  });
  await teams("post /:teamId/wallet/authorize-payment", {
    user: OWNER,
    params: { teamId: "team-1" },
    body: { bountyIds: ["b1"] },
  });

  const toHunter = net.sent.filter((p) => p.bountyId === "b1");
  assert.equal(
    toHunter.length,
    1,
    `b1 was sent ${toHunter.length} times (wallets: ${toHunter.map((p) => p.wallet).join(", ")})`,
  );
  assert.equal(db.bounties[0].isPaid, false, "only a confirmed send may mark b1 paid");
});
