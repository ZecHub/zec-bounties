const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

// Integration test for the payout check in routes/teams.js: a team wallet is
// kept while one of the team's payout records is PENDING or UNKNOWN. The
// check reaches the records through their bounty's team, and skips teams
// without a wallet, so it runs here against PostgreSQL. The wallet directory
// and side effects are stubbed.
//
// Runs against a disposable Postgres database carrying the Prisma schema.
const databaseUrl = process.env.TEST_DATABASE_URL;
const skip =
  !databaseUrl &&
  "Set TEST_DATABASE_URL to a disposable database with the Prisma schema";

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function loadTeamRoutes(db, effects) {
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../middleware/auth": { AUTH_USER_SELECT: { id: true, role: true } },
    path,
    fs: {
      promises: {
        rm: async (dir) => effects.removed.push(dir),
        mkdir: async () => {},
        rename: async (dir) => effects.retired.push(dir),
      },
    },
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: (walletId) => `wallets/${walletId}` },
  };
  const filename = path.join(__dirname, "../routes/teams.js");
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
  return async (route, req) => {
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
    await routes[route].at(-1)({ params: {}, body: {}, ...req }, res);
    return res;
  };
}

// One team owner and the teams, wallets and payout records a test creates
// for them. cleanup() removes all of it.
function createFixture(db) {
  const id = randomUUID();
  const ownerId = `teardown-owner-${id}`;
  const teamIds = [];
  const bountyIds = [];
  return {
    ownerId,
    teamIds,
    createOwner: () =>
      db.user.create({ data: { id: ownerId, name: "Teardown owner", role: "TEAM" } }),
    async createTeam(name, { withWallet = true } = {}) {
      const team = await db.team.create({
        data: {
          name: `${name} ${id}`,
          members: { create: { userId: ownerId, role: "OWNER" } },
          ...(withWallet && { wallet: { create: { accountName: name } } }),
        },
      });
      teamIds.push(team.id);
      const walletId = `teardown-${name}-${id}`;
      if (withWallet) {
        await db.zcashParams.create({
          data: { ownerId, accountName: name, walletId, isTeam: true, teamId: team.id, isDefault: true },
        });
      }
      return { teamId: team.id, walletId };
    },
    async createPayout(teamId, status) {
      const bounty = await db.bounty.create({
        data: {
          title: "Teardown bounty",
          description: "Paid from the team wallet",
          bountyAmount: 0.1,
          timeToComplete: new Date(),
          createdBy: ownerId,
          teamId,
          status: "DONE",
          isApproved: true,
        },
      });
      bountyIds.push(bounty.id);
      return db.transaction.create({
        data: {
          bountyId: bounty.id,
          amountZat: 10000000n,
          toAddress: "u1teardown",
          memo: "",
          status,
          batchKey: `teardown-${randomUUID()}`,
        },
      });
    },
    async cleanup() {
      await db.transaction.deleteMany({ where: { bountyId: { in: bountyIds } } });
      await db.bounty.deleteMany({ where: { id: { in: bountyIds } } });
      await db.zcashParams.deleteMany({ where: { ownerId } });
      await db.team.deleteMany({ where: { id: { in: teamIds } } });
      await db.user.deleteMany({ where: { id: ownerId } });
    },
  };
}

test("a team wallet is kept while one of its payouts is unsettled", { skip }, async () => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fixture = createFixture(db);

  try {
    await fixture.createOwner();
    const { teamId, walletId } = await fixture.createTeam("Teardown");
    const record = await fixture.createPayout(teamId, "UNKNOWN");
    // Another team's unsettled payout must not hold this team's wallet.
    const other = await fixture.createTeam("Other");
    await fixture.createPayout(other.teamId, "UNKNOWN");

    const effects = { removed: [], retired: [] };
    const call = loadTeamRoutes(db, effects);
    const deleteWallet = () =>
      call("delete /:teamId/wallet", {
        user: { id: fixture.ownerId, role: "TEAM" },
        params: { teamId },
      });

    for (const status of ["UNKNOWN", "PENDING"]) {
      await db.transaction.update({ where: { id: record.id }, data: { status } });
      const res = await deleteWallet();
      assert.equal(res.statusCode, 409, `${status}: ${JSON.stringify(res.body)}`);
      assert.ok(await db.teamWallet.findUnique({ where: { teamId } }));
      assert.equal(await db.zcashParams.count({ where: { teamId } }), 1);
      assert.deepEqual(effects, { removed: [], retired: [] });
    }

    await db.transaction.update({
      where: { id: record.id },
      data: { status: "BROADCAST" },
    });
    const res = await deleteWallet();
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(await db.teamWallet.findUnique({ where: { teamId } }), null);
    assert.equal(await db.zcashParams.count({ where: { teamId } }), 0);
    assert.deepEqual(effects, { removed: [], retired: [`wallets/${walletId}`] });
  } finally {
    await fixture.cleanup();
    await db.$disconnect();
  }
});

test("converting an owner to hunter checks only the teams that have a wallet", { skip }, async () => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fixture = createFixture(db);

  try {
    await fixture.createOwner();
    // A team without a wallet has an UNKNOWN record: there is no wallet to keep.
    const noWallet = await fixture.createTeam("NoWallet", { withWallet: false });
    await fixture.createPayout(noWallet.teamId, "UNKNOWN");
    const settled = await fixture.createTeam("Settled");
    await fixture.createPayout(settled.teamId, "BROADCAST");
    const blocked = await fixture.createTeam("Blocked");
    const record = await fixture.createPayout(blocked.teamId, "UNKNOWN");

    const convert = async () => {
      const effects = { removed: [], retired: [] };
      const res = await loadTeamRoutes(db, effects)("patch /convert-to-hunter/:userId", {
        user: { id: "admin", role: "ADMIN" },
        params: { userId: fixture.ownerId },
      });
      return { res, effects };
    };
    const teamsLeft = () => db.team.count({ where: { id: { in: fixture.teamIds } } });
    const ownerRole = async () =>
      (await db.user.findUnique({ where: { id: fixture.ownerId } })).role;

    // One team whose wallet has an unsettled payout refuses the whole
    // conversion: no team is deleted and the owner keeps the TEAM role.
    let { res, effects } = await convert();
    assert.equal(res.statusCode, 409, JSON.stringify(res.body));
    assert.equal(await teamsLeft(), 3);
    assert.equal(await ownerRole(), "TEAM");
    assert.deepEqual(effects, { removed: [], retired: [] });

    // Once it is settled, the wallet-less team's UNKNOWN record does not block.
    await db.transaction.update({ where: { id: record.id }, data: { status: "FAILED" } });
    ({ res, effects } = await convert());
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(await teamsLeft(), 0);
    assert.equal(await ownerRole(), "HUNTER");
    assert.deepEqual(effects.removed, []);
    assert.deepEqual(
      [...effects.retired].sort(),
      [`wallets/${blocked.walletId}`, `wallets/${settled.walletId}`].sort(),
    );
  } finally {
    await fixture.cleanup();
    await db.$disconnect();
  }
});
