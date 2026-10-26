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

// One team with an OWNER and a plain MEMBER. Both hold a copy of the team
// wallet, as syncWalletToMembers creates it; the member also has a personal
// wallet with the same name as another team's copy.
function createDb() {
  const members = [
    { teamId: "team-1", userId: "owner", role: "OWNER" },
    { teamId: "team-1", userId: "member", role: "MEMBER" },
  ];
  const wallets = [
    { id: 1, ownerId: "owner", accountName: "Team", teamId: "team-1", walletId: "team-wallet" },
    { id: 2, ownerId: "member", accountName: "Team", teamId: "team-1", walletId: "team-wallet" },
    { id: 3, ownerId: "member", accountName: "Main", teamId: "team-2", walletId: "other-team" },
    { id: 4, ownerId: "member", accountName: "Main", teamId: null, walletId: "member-main" },
  ];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in value
        ? value.in.includes(row[key])
        : row[key] === value,
    );
  return {
    members,
    wallets,
    zcashParams: {
      findFirst: async ({ where }) => wallets.find((row) => matches(row, where)) ?? null,
      delete: async ({ where }) => wallets.splice(wallets.findIndex((row) => row.id === where.id), 1),
    },
    teamMember: {
      findUnique: async ({ where }) =>
        members.find((m) => matches(m, where.teamId_userId)) ?? null,
      findFirst: async ({ where }) => members.find((m) => matches(m, where)) ?? null,
      upsert: async ({ where, update, create }) => {
        const existing = members.find((m) => matches(m, where.teamId_userId));
        if (existing) return Object.assign(existing, update);
        members.push(create);
        return create;
      },
    },
    user: {
      findMany: async ({ where }) => where.id.in.map((id) => ({ id, role: "TEAM" })),
    },
    teamWallet: { findUnique: async () => null },
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

test("deleting a team wallet copy leaves the shared wallet alone", async () => {
  for (const user of [member, owner]) {
    const db = createDb();
    const zcash = loadRoutes("zcash.js", db, {
      "../utils/zingo/getZingo": { invalidateZingo() {} },
    });
    const res = await zcash.call("delete /params/:accountName", {
      user,
      params: { accountName: "Team" },
    });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(zcash.effects.removedDirs, []);
    assert.equal(db.wallets.length, 4);
  }
});

test("deleting a personal wallet still works", async () => {
  const db = createDb();
  const zcash = loadRoutes("zcash.js", db, {
    "../utils/zingo/getZingo": { invalidateZingo() {} },
  });
  const res = await zcash.call("delete /params/:accountName", {
    user: member,
    params: { accountName: "Main" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(zcash.effects.removedDirs, ["wallets/member-main"]);
});

test("adding members cannot change the owner's role", async () => {
  const db = createDb();
  db.members.push({ teamId: "team-1", userId: "team-admin", role: "ADMIN" });
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("post /:teamId/members", {
    user: { id: "team-admin", role: "TEAM" },
    params: { teamId: "team-1" },
    body: { userIds: ["owner"], role: "MEMBER" },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(db.members.find((m) => m.userId === "owner").role, "OWNER");
});

test("adding a new member still works", async () => {
  const db = createDb();
  const teams = loadRoutes("teams.js", db);
  const res = await teams.call("post /:teamId/members", {
    user: owner,
    params: { teamId: "team-1" },
    body: { userIds: ["newcomer"], role: "MEMBER" },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(db.members.find((m) => m.userId === "newcomer").role, "MEMBER");
});

// Two global admins are members of team-1 and each holds a copy of its
// wallet. Each pays platform bounties from a personal default wallet.
function createDefaultsDb() {
  const wallets = [
    { id: 1, ownerId: "admin-b", accountName: "Main", teamId: null, isDefault: true },
    { id: 2, ownerId: "admin-b", accountName: "Team", teamId: "team-1", isDefault: false },
    { id: 3, ownerId: "admin-a", accountName: "Main", teamId: null, isDefault: true },
    { id: 4, ownerId: "admin-a", accountName: "Team", teamId: "team-1", isDefault: false },
  ];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const zcashParams = {
    findFirst: async ({ where }) => wallets.find((row) => matches(row, where)) ?? null,
    update: async ({ where, data }) =>
      Object.assign(wallets.find((row) => row.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const hit = wallets.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
  };
  return { wallets, zcashParams, $transaction: async (fn) => fn({ zcashParams }) };
}

const defaultsOf = (db, ownerId) =>
  db.wallets
    .filter((w) => w.ownerId === ownerId && w.isDefault)
    .map((w) => (w.teamId ? `${w.accountName}@${w.teamId}` : w.accountName));

const setDefault = (db, user, accountName, teamId) =>
  loadRoutes("zcash.js", db, {
    "../utils/zingo/getZingo": { invalidateZingo() {} },
    "../middleware/websocket": { sendToUser() {} },
  }).call("patch /params/:accountName/set-default", {
    user,
    params: { accountName },
    body: { teamId },
  });

test("choosing a team wallet as default changes only the caller's own copy", async () => {
  const db = createDefaultsDb();
  const res = await setDefault(db, { id: "admin-a", role: "ADMIN" }, "Team", "team-1");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(defaultsOf(db, "admin-a"), ["Team@team-1"]);
  assert.deepEqual(defaultsOf(db, "admin-b"), ["Main"]);
});

test("setting a default leaves the caller with only that one", async () => {
  const db = createDefaultsDb();
  db.wallets[1].isDefault = true; // admin-b has two defaults
  const res = await setDefault(db, { id: "admin-b", role: "ADMIN" }, "Main");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(defaultsOf(db, "admin-b"), ["Main"]);
});
