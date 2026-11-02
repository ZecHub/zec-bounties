const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The public team page (GET /:teamId/overview) shows a donation address read
// from the team wallet and cached for five minutes. Deleting or replacing the
// wallet removes its directory, so a cached address after that points at a
// wallet the server no longer has.

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

const ADDRESS_BY_WALLET = {
  "old-wallet": "u1oldwalletaddress",
  "new-wallet": "u1newwalletaddress",
};

function createDb() {
  const teams = [{ id: "team-1", name: "Team", isVerified: true }];
  const members = [{ teamId: "team-1", userId: "owner", role: "OWNER" }];
  const teamWallets = [
    { id: "tw-1", teamId: "team-1", accountName: "Team", chain: "mainnet", serverUrl: "https://zec.rocks:443" },
  ];
  const wallets = [
    { id: 1, ownerId: "owner", accountName: "Team", teamId: "team-1", walletId: "old-wallet", isTeam: true, isDefault: true, createdAt: 1 },
  ];
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const zcashParams = {
    findFirst: async ({ where }) => wallets.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }) => wallets.filter((row) => matches(row, where)),
    deleteMany: async ({ where }) => {
      const gone = wallets.filter((row) => matches(row, where));
      for (const row of gone) wallets.splice(wallets.indexOf(row), 1);
      return { count: gone.length };
    },
    updateMany: async () => ({ count: 0 }),
    update: async ({ where, data }) =>
      Object.assign(wallets.find((row) => row.id === where.id), data),
    upsert: async () => ({}),
  };
  return {
    teams,
    teamWallets,
    wallets,
    zcashParams,
    async $transaction(fn) {
      return fn({ zcashParams });
    },
    team: {
      findUnique: async ({ where }) => {
        const team = teams.find((t) => t.id === where.id);
        return team ? { ...team, _count: { members: 1, favoritedBy: 0 } } : null;
      },
    },
    teamMember: {
      findUnique: async ({ where }) =>
        members.find((m) => matches(m, where.teamId_userId)) ?? null,
      findMany: async ({ where }) => members.filter((m) => matches(m, where)),
    },
    teamWallet: {
      findUnique: async ({ where }) =>
        teamWallets.find((w) => w.teamId === where.teamId) ?? null,
      create: async ({ data }) => {
        const row = { id: `tw-${teamWallets.length + 2}`, ...data };
        teamWallets.push(row);
        return row;
      },
      delete: async ({ where }) =>
        teamWallets.splice(teamWallets.findIndex((w) => w.teamId === where.teamId), 1)[0],
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

// An in-memory Redis that honours TTL-free get/set/del, which is all the
// donation-address cache uses within one test.
function createCache() {
  const store = new Map();
  return {
    store,
    module: {
      TTL: { BOUNTY_LIST: 300 },
      getCache: async (key) => (store.has(key) ? store.get(key) : null),
      setCache: async (key, value) => void store.set(key, value),
      delCache: async (...keys) => keys.forEach((k) => store.delete(k)),
      deleteCacheByPattern: async () => {},
      bumpVersion: async () => 1,
      getVersion: async () => 0,
    },
  };
}

function loadTeams(db, cache) {
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../utils/cache": cache.module,
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: (walletId) => `wallets/${walletId}` },
    "../helpers/zcash/walletConnection": { validateWalletConnection: () => null },
    "../utils/zingo/zingoLibAddresses": async (_command, params) => [
      { encoded_address: ADDRESS_BY_WALLET[params.walletId] },
    ],
    "../zcash/init": {
      initZcashOnce: async (ownerId, accountName, chain, teamId) => {
        const row = { id: db.wallets.length + 10, ownerId, accountName, chain, teamId, walletId: "new-wallet", createdAt: 2 };
        db.wallets.push(row);
        return row;
      },
    },
    fs: { promises: { rm: async () => {} } },
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

const owner = { id: "owner", role: "TEAM" };
const viewOverview = (call) =>
  call("get /:teamId/overview", { params: { teamId: "team-1" } });

test("the overview stops showing a deleted team wallet's address", async () => {
  const db = createDb();
  const call = loadTeams(db, createCache());

  assert.equal((await viewOverview(call)).body.donationAddress, "u1oldwalletaddress");

  const del = await call("delete /:teamId/wallet", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(del.statusCode, 200);
  assert.equal(db.teamWallets.length, 0);

  // Before the fix: still "u1oldwalletaddress" for up to TTL.BOUNTY_LIST.
  assert.equal((await viewOverview(call)).body.donationAddress, null);
});

test("the overview shows the new address once the team wallet is replaced", async () => {
  const db = createDb();
  const call = loadTeams(db, createCache());

  assert.equal((await viewOverview(call)).body.donationAddress, "u1oldwalletaddress");

  await call("delete /:teamId/wallet", { user: owner, params: { teamId: "team-1" } });
  const created = await call("post /:teamId/wallet", {
    user: owner,
    params: { teamId: "team-1" },
    body: { accountName: "Team" },
  });
  assert.equal(created.statusCode, 201);

  // Before the fix: the deleted wallet's "u1oldwalletaddress".
  assert.equal((await viewOverview(call)).body.donationAddress, "u1newwalletaddress");
});

test("importing a replacement team wallet drops the old wallet's address", async () => {
  const db = createDb();
  const call = loadTeams(db, createCache());

  assert.equal((await viewOverview(call)).body.donationAddress, "u1oldwalletaddress");

  const imported = await call("post /:teamId/wallet/import", {
    user: owner,
    params: { teamId: "team-1" },
    body: {
      accountName: "Team",
      seedPhrase: Array.from({ length: 24 }, () => "abandon").join(" "),
      replace: true,
    },
  });
  assert.equal(imported.statusCode, 201);

  // Before the fix: the replaced wallet's "u1oldwalletaddress".
  assert.equal((await viewOverview(call)).body.donationAddress, "u1newwalletaddress");
});
