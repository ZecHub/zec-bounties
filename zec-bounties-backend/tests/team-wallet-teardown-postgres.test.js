const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

// Integration test for the payout check in routes/teams.js: a team wallet is
// kept while one of the team's payout records is PENDING or UNKNOWN. The
// check reaches the records through their bounty's team, so it runs here
// against PostgreSQL. The wallet directory and side effects are stubbed.
//
// Runs against a disposable Postgres database carrying the Prisma schema.
const databaseUrl = process.env.TEST_DATABASE_URL;

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

test(
  "a team wallet is kept while one of its payouts is unsettled",
  {
    skip:
      !databaseUrl &&
      "Set TEST_DATABASE_URL to a disposable database with the Prisma schema",
  },
  async () => {
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const id = randomUUID();
    const ownerId = `teardown-owner-${id}`;
    const walletId = `teardown-wallet-${id}`;
    const teamIds = [];
    const bountyIds = [];

    const createTeam = async (name) => {
      const team = await db.team.create({
        data: {
          name: `${name} ${id}`,
          members: { create: { userId: ownerId, role: "OWNER" } },
          wallet: { create: { accountName: name } },
        },
      });
      teamIds.push(team.id);
      return team.id;
    };
    const createPayout = async (teamId, status) => {
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
    };

    try {
      await db.user.create({
        data: { id: ownerId, name: "Teardown owner", role: "TEAM" },
      });
      const teamId = await createTeam("Teardown team");
      await db.zcashParams.create({
        data: {
          ownerId,
          accountName: "Teardown team",
          walletId,
          isTeam: true,
          teamId,
          isDefault: true,
        },
      });
      const record = await createPayout(teamId, "UNKNOWN");
      // Another team's unsettled payout must not hold this team's wallet.
      await createPayout(await createTeam("Other team"), "UNKNOWN");

      const effects = { removed: [], retired: [] };
      const call = loadTeamRoutes(db, effects);
      const deleteWallet = () =>
        call("delete /:teamId/wallet", {
          user: { id: ownerId, role: "TEAM" },
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
      await db.transaction.deleteMany({ where: { bountyId: { in: bountyIds } } });
      await db.bounty.deleteMany({ where: { id: { in: bountyIds } } });
      await db.zcashParams.deleteMany({ where: { ownerId } });
      await db.team.deleteMany({ where: { id: { in: teamIds } } });
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  },
);
