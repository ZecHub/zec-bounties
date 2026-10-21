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

// team-1 has a wallet. The owner and the member each hold the copy that
// syncWalletToMembers creates, and it is their default. The member also has
// a personal wallet. Another user holds a copy of team-2's wallet.
function createDb() {
  const teams = [
    {
      id: "team-1",
      wallet: { teamId: "team-1", accountName: "Team", chain: "mainnet", serverUrl: "https://zec.rocks:443" },
    },
  ];
  const members = [
    { teamId: "team-1", userId: "owner", role: "OWNER" },
    { teamId: "team-1", userId: "member", role: "MEMBER" },
  ];
  const wallets = [
    { id: 1, ownerId: "owner", accountName: "Team", teamId: "team-1", walletId: "team-wallet", isTeam: true, isDefault: true, createdAt: 3 },
    { id: 2, ownerId: "member", accountName: "Team", teamId: "team-1", walletId: "team-wallet", isTeam: true, isDefault: true, createdAt: 4 },
    { id: 3, ownerId: "member", accountName: "Main", teamId: null, walletId: "member-main", isTeam: false, isDefault: false, createdAt: 1 },
    { id: 4, ownerId: "other", accountName: "Team", teamId: "team-2", walletId: "other-team", isTeam: true, isDefault: true, createdAt: 2 },
  ];
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in value
        ? value.in.includes(row[key])
        : row[key] === value,
    );
  return {
    teams,
    members,
    wallets,
    zcashParams: {
      findFirst: async ({ where, orderBy }) => {
        const rows = wallets.filter((row) => matches(row, where));
        if (orderBy) rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ?? null;
      },
      findMany: async ({ where }) => wallets.filter((row) => matches(row, where)),
      deleteMany: async ({ where }) => {
        const gone = wallets.filter((row) => matches(row, where));
        for (const row of gone) wallets.splice(wallets.indexOf(row), 1);
        return { count: gone.length };
      },
      update: async ({ where, data }) =>
        Object.assign(wallets.find((row) => row.id === where.id), data),
    },
    teamMember: {
      findUnique: async ({ where }) =>
        members.find((m) => matches(m, where.teamId_userId)) ?? null,
      findMany: async ({ where }) => members.filter((m) => matches(m, where)),
    },
    team: {
      findUnique: async ({ where }) => teams.find((t) => t.id === where.id) ?? null,
      delete: async ({ where }) => teams.splice(teams.findIndex((t) => t.id === where.id), 1)[0],
    },
    user: {
      findUnique: async ({ where }) => ({ id: where.id, role: "TEAM", isRobin: false }),
      update: async ({ where, data }) => ({ id: where.id, ...data }),
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

function loadRoutes(file, db, overrides = {}) {
  const effects = { removedDirs: [] };
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../prisma/client": db,
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: (walletId) => `wallets/${walletId}` },
    fs: { promises: { rm: async (dir) => effects.removedDirs.push(dir) } },
    ...overrides,
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
      await routes[route].at(-1)({ params: {}, body: {}, ...req }, res);
      return res;
    },
  };
}

const owner = { id: "owner", role: "TEAM" };
const member = { id: "member", role: "TEAM" };

function assertCopiesRemoved(db) {
  assert.deepEqual(
    db.wallets.filter((w) => w.teamId === "team-1").map((w) => w.ownerId),
    [],
  );
  // The member's personal wallet becomes their default again.
  assert.equal(db.wallets.find((w) => w.id === 3).isDefault, true);
  // Another team's wallet is left alone.
  assert.deepEqual(db.wallets.find((w) => w.id === 4), {
    id: 4, ownerId: "other", accountName: "Team", teamId: "team-2", walletId: "other-team", isTeam: true, isDefault: true, createdAt: 2,
  });
}

test("deleting a team removes every member's copy of the team wallet", async () => {
  const db = createDb();
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("delete /:teamId", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(teams.effects.removedDirs, ["wallets/team-wallet"]);
  assert.equal(db.teams.length, 0);
  assertCopiesRemoved(db);
});

test("after the team is deleted, a member has no undeletable copy left", async () => {
  const db = createDb();
  await loadRoutes("teams.js", db).call("delete /:teamId", {
    user: owner,
    params: { teamId: "team-1" },
  });
  const zcash = loadRoutes("zcash.js", db, {
    "../utils/zingo/getZingo": { invalidateZingo() {} },
  });
  const res = await zcash.call("delete /params/:accountName", {
    user: member,
    params: { accountName: "Team" },
  });
  // Before: 403 "The team owner can delete a team wallet from the team page",
  // for a team that no longer exists.
  assert.equal(res.statusCode, 404);
});

test("converting a team owner to hunter removes the copies of their team's wallet", async () => {
  const db = createDb();
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("patch /convert-to-hunter/:userId", {
    user: { id: "admin", role: "ADMIN" },
    params: { userId: "owner" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.deletedTeamIds, ["team-1"]);
  assert.deepEqual(teams.effects.removedDirs, ["wallets/team-wallet"]);
  assertCopiesRemoved(db);
});

test("deleting a team without a wallet leaves members' wallets alone", async () => {
  const db = createDb();
  db.teams[0].wallet = null;
  const before = structuredClone(db.wallets);
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("delete /:teamId", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(teams.effects.removedDirs, []);
  assert.deepEqual(db.wallets, before);
});

test("a personal wallet is preferred over a newer team wallet as the fallback default", async () => {
  const db = createDb();
  // Member also belongs to team-2 and that copy is newer than their personal wallet.
  db.wallets.push({
    id: 5, ownerId: "member", accountName: "Team", teamId: "team-2", walletId: "other-team",
    isTeam: true, isDefault: false, createdAt: 5,
  });
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("delete /:teamId", {
    user: owner,
    params: { teamId: "team-1" },
  });
  assert.equal(res.statusCode, 200);
  // Personal wallet (id 3) becomes default, not the newer team-2 copy (id 5).
  assert.equal(db.wallets.find((w) => w.id === 3).isDefault, true);
  assert.equal(db.wallets.find((w) => w.id === 5).isDefault, false);
});
