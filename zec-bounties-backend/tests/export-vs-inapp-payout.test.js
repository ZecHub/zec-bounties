// A completed bounty is paid through one of two channels: the in-app payout
// (admin or team wallet) or the CSV export ("Export Completed"), which is paid
// outside the app and stamps exportedAt. Each channel must leave alone the
// bounties the other one has taken.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

const TXID = "a".repeat(64);

function bounty(id, fields = {}) {
  return {
    id,
    title: id,
    teamId: null,
    chain: "MAIN",
    bountyAmount: 0.5,
    status: "DONE",
    isApproved: true,
    isPaid: false,
    paymentInFlight: false,
    exportedAt: null,
    exportedBy: null,
    assigneeUser: { id: "hunter", UA_address: "u1hunter" },
    ...fields,
  };
}

function createDb(bounties) {
  const records = [];
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in value
        ? value.in.includes(row[key])
        : row[key] === value,
    );
  const db = {
    bounties,
    records,
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
        records.push(...data.map((row) => ({ status: "PENDING", ...row })));
        return { count: data.length };
      },
      updateMany: async ({ where, data }) => {
        const hit = records.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
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
    zcashParams: {
      findFirst: async () => ({ walletId: "team-wallet" }),
    },
    $transaction: async (arg) =>
      typeof arg === "function" ? arg(db) : Promise.all(arg),
  };
  return db;
}

function loadRoutes(file, db) {
  const effects = { sent: [] };
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
    "../utils/zingo/zingoLibQuickSend": async (list) => {
      effects.sent.push(...list);
      return { txids: [TXID], error: null, timedOut: false, raw: "{}" };
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
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return {
    effects,
    async call(route, req) {
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      await routes[route].at(-1)(
        { params: {}, body: {}, user: { id: "admin", role: "ADMIN" }, ...req },
        res,
      );
      return res;
    },
  };
}

const payTeam = (teams, bountyIds) =>
  teams.call("post /:teamId/wallet/authorize-payment", {
    params: { teamId: "team-1" },
    body: { bountyIds },
  });

test("the team payout does not pay a bounty exported for an off-platform payout", async () => {
  const db = createDb([
    bounty("exported", { teamId: "team-1", exportedAt: new Date("2026-10-04T22:27:11Z") }),
  ]);
  const teams = loadRoutes("teams.js", db);
  const res = await payTeam(teams, ["exported"]);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(teams.effects.sent, []);
  assert.equal(db.bounties[0].isPaid, false);
  assert.equal(db.bounties[0].paymentInFlight, false);
});

test("the team payout does not claim a bounty exported after it was read", async () => {
  const db = createDb([bounty("b1", { teamId: "team-1" })]);
  // The export is marked between the eligibility read and the claim.
  const read = db.bounty.findMany;
  db.bounty.findMany = async (args) => {
    const rows = await read(args);
    db.bounties[0].exportedAt = new Date();
    return rows;
  };
  const teams = loadRoutes("teams.js", db);
  const res = await payTeam(teams, ["b1"]);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(teams.effects.sent, []);
  assert.equal(db.bounties[0].isPaid, false);
  assert.equal(db.bounties[0].paymentInFlight, false);
  assert.deepEqual(db.records, []);
});

test("the team payout still pays a bounty that was not exported", async () => {
  const db = createDb([bounty("b1", { teamId: "team-1" })]);
  const teams = loadRoutes("teams.js", db);
  const res = await payTeam(teams, ["b1"]);

  assert.equal(res.statusCode, 200);
  assert.equal(teams.effects.sent.length, 1);
  assert.equal(db.bounties[0].isPaid, true);
});

test("the export list leaves out bounties paid or being paid in the app", async () => {
  const db = createDb([
    bounty("due"),
    bounty("paid", { isPaid: true, paidAt: new Date("2026-09-30T22:10:43Z") }),
    bounty("in-flight", { paymentInFlight: true }),
  ]);
  const bounties = loadRoutes("bounties.js", db);
  const res = await bounties.call("get /export-completed", {});

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map((b) => b.id), ["due"]);
});

test("marking an export does not stamp bounties paid or being paid in the app", async () => {
  const db = createDb([
    bounty("due"),
    bounty("paid", { isPaid: true }),
    bounty("in-flight", { paymentInFlight: true }),
  ]);
  const bounties = loadRoutes("bounties.js", db);
  const res = await bounties.call("patch /export-completed/mark-exported", {
    body: { bountyIds: ["due", "paid", "in-flight"] },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.newlyMarked, 1);
  const stamped = db.bounties.filter((b) => b.exportedAt).map((b) => b.id);
  assert.deepEqual(stamped, ["due"]);
});
