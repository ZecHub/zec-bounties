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

// team-1 has a wallet in wallets/team-wallet. The owner and the member each
// hold the copy that syncWalletToMembers creates. Bounty tb1 belongs to
// team-1 and has one payout record per entry in `payouts`.
function createDb(payouts = []) {
  const teams = [
    {
      id: "team-1",
      wallet: { id: "tw-1", teamId: "team-1", accountName: "Team", chain: "mainnet", serverUrl: "https://zec.rocks:443" },
    },
  ];
  const members = [
    { teamId: "team-1", userId: "owner", role: "OWNER" },
    { teamId: "team-1", userId: "member", role: "MEMBER" },
  ];
  const wallets = [
    { id: 1, ownerId: "owner", accountName: "Team", teamId: "team-1", walletId: "team-wallet", isTeam: true, isDefault: true, createdAt: 1 },
    { id: 2, ownerId: "member", accountName: "Team", teamId: "team-1", walletId: "team-wallet", isTeam: true, isDefault: true, createdAt: 2 },
  ];
  const bounties = [{ id: "tb1", teamId: "team-1" }];
  const records = payouts.map((status, i) => ({ id: `r${i}`, bountyId: "tb1", status }));
  const users = { owner: { id: "owner", role: "TEAM", isRobin: false } };
  let nextId = 10;

  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in value
        ? value.in.includes(row[key])
        : row[key] === value,
    );
  const zcashParams = {
    findFirst: async ({ where }) => wallets.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }) => wallets.filter((row) => matches(row, where)),
    create: async ({ data }) => {
      const row = { id: nextId++, isDefault: false, createdAt: nextId, ...data };
      wallets.push(row);
      return row;
    },
    update: async ({ where, data }) =>
      Object.assign(wallets.find((row) => row.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const hit = wallets.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    upsert: async ({ where, update, create }) => {
      const row = wallets.find((r) => matches(r, where.ownerId_accountName_teamId));
      return row ? Object.assign(row, update) : zcashParams.create({ data: create });
    },
    deleteMany: async ({ where }) => {
      const gone = wallets.filter((row) => matches(row, where));
      for (const row of gone) wallets.splice(wallets.indexOf(row), 1);
      return { count: gone.length };
    },
  };
  const teamOf = (teamId) => teams.find((t) => t.id === teamId);
  return {
    teams,
    members,
    wallets,
    users,
    zcashParams,
    async $transaction(fn) {
      return fn({ zcashParams });
    },
    teamMember: {
      findUnique: async ({ where }) =>
        members.find((m) => matches(m, where.teamId_userId)) ?? null,
      findMany: async ({ where }) => members.filter((m) => matches(m, where)),
    },
    team: {
      findUnique: async ({ where }) => teamOf(where.id) ?? null,
      delete: async ({ where }) => teams.splice(teams.indexOf(teamOf(where.id)), 1)[0],
    },
    teamWallet: {
      findUnique: async ({ where }) => teamOf(where.teamId)?.wallet ?? null,
      create: async ({ data }) => {
        if (teamOf(data.teamId).wallet) throw new Error("Unique constraint failed on teamId");
        return (teamOf(data.teamId).wallet = { id: `tw-${nextId++}`, ...data });
      },
      delete: async ({ where }) => {
        const team = teamOf(where.teamId);
        if (!team?.wallet) throw new Error("Record to delete does not exist");
        const wallet = team.wallet;
        team.wallet = null;
        return wallet;
      },
      deleteMany: async ({ where }) => {
        const team = teamOf(where.teamId);
        const count = team?.wallet ? 1 : 0;
        if (team) team.wallet = null;
        return { count };
      },
    },
    // Filters on the record's status and its bounty's team. The full query
    // runs against PostgreSQL in team-wallet-teardown-postgres.test.js.
    transaction: {
      count: async ({ where }) =>
        records.filter(
          (r) =>
            matches(r, { status: where.status }) &&
            matches(bounties.find((b) => b.id === r.bountyId), { teamId: where.bounty.teamId }),
        ).length,
    },
    user: {
      findUnique: async ({ where }) => users[where.id] ?? null,
      update: async ({ where, data }) => Object.assign(users[where.id], data),
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

function loadRoutes(db, { seedError } = {}) {
  const effects = { removedDirs: [], movedDirs: [], seeds: [] };
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    path,
    crypto: { randomUUID: () => "new-wallet" },
    fs: {
      promises: {
        rm: async (dir) => effects.removedDirs.push(dir),
        mkdir: async () => {},
        rename: async (from, to) => effects.movedDirs.push([from, to]),
      },
    },
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: (walletId) => `wallets/${walletId}` },
    "../helpers/zcash/walletConnection": require("../helpers/zcash/walletConnection"),
    // Same contract as the real one: reuse the caller's row for this
    // account, or create one with a new wallet directory.
    "../zcash/init": {
      initZcashOnce: async (ownerId, accountName, chain, teamId) =>
        (await db.zcashParams.findFirst({ where: { ownerId, accountName, teamId } })) ??
        db.zcashParams.create({
          data: { walletId: "init-wallet", ownerId, accountName, chain, teamId, isTeam: true },
        }),
    },
    "../utils/zingo/zingoLibSeed": async (params) => {
      effects.seeds.push(params.dataDir);
      if (seedError) throw new Error(seedError);
      return { message: "Wallet restored" };
    },
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
      process: { env: {}, cwd: () => "/srv" },
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
      await routes[route].at(-1)({ params: {}, body: {}, ...req }, res);
      return res;
    },
  };
}

const owner = { id: "owner", role: "TEAM" };
const admin = { id: "admin", role: "ADMIN" };
const seedPhrase = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");
const replaceBody = { accountName: "Team v2", seedPhrase, replace: true };

// The old wallet, its directory and both members' copies are all still there.
function assertWalletKept(db, teams) {
  assert.equal(db.teams[0].wallet?.id, "tw-1");
  assert.deepEqual(
    db.wallets.map((w) => [w.ownerId, w.walletId]),
    [["owner", "team-wallet"], ["member", "team-wallet"]],
  );
  assert.deepEqual(teams.effects.removedDirs, []);
  assert.deepEqual(teams.effects.movedDirs, []);
}

// A removed wallet's directory is moved aside, never deleted.
function assertRetired(teams, walletId) {
  assert.deepEqual(teams.effects.removedDirs, []);
  assert.equal(teams.effects.movedDirs.length, 1);
  const [from, to] = teams.effects.movedDirs[0];
  assert.equal(from, `wallets/${walletId}`);
  assert.match(to, new RegExp(`^wallets/\\.retired/${walletId}-\\d+$`));
}

for (const status of ["PENDING", "UNKNOWN"]) {
  test(`deleting the team wallet is refused while a payout is ${status}`, async () => {
    const db = createDb([status]);
    const teams = loadRoutes(db);
    const res = await teams.call("delete /:teamId/wallet", {
      user: owner,
      params: { teamId: "team-1" },
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /not settled/);
    assertWalletKept(db, teams);
  });

  test(`replacing the team wallet is refused while a payout is ${status}`, async () => {
    const db = createDb([status]);
    const teams = loadRoutes(db);
    const res = await teams.call("post /:teamId/wallet/import", {
      user: owner,
      params: { teamId: "team-1" },
      body: replaceBody,
    });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(teams.effects.seeds, []);
    assertWalletKept(db, teams);
  });

  test(`deleting a team is refused while its wallet has a ${status} payout`, async () => {
    const db = createDb([status]);
    const teams = loadRoutes(db);
    const res = await teams.call("delete /:teamId", {
      user: owner,
      params: { teamId: "team-1" },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(db.teams.length, 1);
    assertWalletKept(db, teams);
  });

  for (const route of ["patch /convert-to-hunter/:userId", "patch /convert-role/:userId"]) {
    test(`${route} is refused while the owner's team wallet has a ${status} payout`, async () => {
      const db = createDb([status]);
      const teams = loadRoutes(db);
      const res = await teams.call(route, {
        user: admin,
        params: { userId: "owner" },
        body: { toRole: "HUNTER" },
      });
      assert.equal(res.statusCode, 409);
      assert.equal(db.users.owner.role, "TEAM");
      assert.equal(db.teams.length, 1);
      assertWalletKept(db, teams);
    });
  }
}

test("a replacement seed that fails to restore leaves the current wallet in place", async () => {
  const db = createDb(["BROADCAST"]);
  const teams = loadRoutes(db, { seedError: "Zingo CLI error: invalid seed" });
  const res = await teams.call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: replaceBody,
  });
  assert.equal(res.statusCode, 500);
  assert.equal(db.teams[0].wallet?.id, "tw-1");
  assert.deepEqual(
    db.wallets.map((w) => [w.ownerId, w.walletId]),
    [["owner", "team-wallet"], ["member", "team-wallet"]],
  );
  assert.deepEqual(teams.effects.movedDirs, []);
  // Only the directory the seed was restored into is cleaned up.
  assert.equal(teams.effects.seeds.length, 1);
  assert.notEqual(teams.effects.seeds[0], "wallets/team-wallet");
  assert.deepEqual(teams.effects.removedDirs, teams.effects.seeds);
});

// Controls: with every payout settled, each path still works.

test("with settled payouts, replacing the team wallet installs the restored one", async () => {
  const db = createDb(["BROADCAST", "FAILED"]);
  const teams = loadRoutes(db);
  const res = await teams.call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: replaceBody,
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.wallet.accountName, "Team v2");
  // Both members now hold a copy of the restored wallet, and nothing of the old.
  const [restored] = teams.effects.seeds;
  assert.deepEqual(
    db.wallets.map((w) => [w.ownerId, w.accountName, `wallets/${w.walletId}`]).sort(),
    [["member", "Team v2", restored], ["owner", "Team v2", restored]],
  );
});

test("importing a first team wallet still works", async () => {
  const db = createDb();
  db.teams[0].wallet = null;
  db.wallets.length = 0;
  const teams = loadRoutes(db);
  const res = await teams.call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: { accountName: "Team", seedPhrase },
  });
  assert.equal(res.statusCode, 201);
  const [restored] = teams.effects.seeds;
  assert.deepEqual(
    db.wallets.map((w) => [w.ownerId, `wallets/${w.walletId}`]).sort(),
    [["member", restored], ["owner", restored]],
  );
  assert.deepEqual(teams.effects.removedDirs, []);
  assert.deepEqual(teams.effects.movedDirs, []);
});

test("importing over an existing wallet without replace is still a 409", async () => {
  const db = createDb();
  const teams = loadRoutes(db);
  const res = await teams.call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: { accountName: "Team v2", seedPhrase },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "Team already has a wallet");
  assertWalletKept(db, teams);
});

test("with settled payouts, the team wallet can be deleted", async () => {
  const db = createDb(["BROADCAST", "FAILED"]);
  const teams = loadRoutes(db);
  const res = await teams.call("delete /:teamId/wallet", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(db.teams[0].wallet, null);
  assert.deepEqual(db.wallets, []);
});

test("with settled payouts, the team can be deleted", async () => {
  const db = createDb(["BROADCAST"]);
  const teams = loadRoutes(db);
  const res = await teams.call("delete /:teamId", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(db.teams.length, 0);
});

test("with settled payouts, the owner can be converted to hunter", async () => {
  const db = createDb(["FAILED"]);
  const teams = loadRoutes(db);
  const res = await teams.call("patch /convert-to-hunter/:userId", {
    user: admin,
    params: { userId: "owner" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.deletedTeamIds, ["team-1"]);
  assert.equal(db.users.owner.role, "HUNTER");
});

// A team wallet's seed is never returned by any route, so deleting its
// directory would lose whatever it still holds. Each path moves it aside.

test("deleting the team wallet moves its directory aside", async () => {
  const db = createDb();
  const teams = loadRoutes(db);
  await teams.call("delete /:teamId/wallet", { user: owner, params: { teamId: "team-1" } });
  assertRetired(teams, "team-wallet");
});

test("replacing the team wallet moves the old directory aside", async () => {
  const db = createDb();
  const teams = loadRoutes(db);
  await teams.call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: replaceBody,
  });
  assertRetired(teams, "team-wallet");
});

test("deleting the team moves its wallet directory aside", async () => {
  const db = createDb();
  const teams = loadRoutes(db);
  await teams.call("delete /:teamId", { user: owner, params: { teamId: "team-1" } });
  assertRetired(teams, "team-wallet");
});

test("converting the owner to hunter moves the team wallet directory aside", async () => {
  const db = createDb();
  const teams = loadRoutes(db);
  await teams.call("patch /convert-to-hunter/:userId", {
    user: admin,
    params: { userId: "owner" },
  });
  assertRetired(teams, "team-wallet");
});
