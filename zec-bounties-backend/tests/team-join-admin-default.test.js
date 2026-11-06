const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Any property, call or `new` returns the stub again; `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

// team-1 has a wallet ("Team"). The platform admin and a TEAM user each have
// a personal default wallet.
function createDb() {
  const roles = { owner: "TEAM", admin: "ADMIN", teamUser: "TEAM", fresh: "TEAM", robin: "TEAM" };
  const robins = new Set(["robin"]);
  const members = [{ teamId: "team-1", userId: "owner", role: "OWNER" }];
  let nextId = 10;
  const wallets = [
    { id: 1, ownerId: "owner", accountName: "Team", teamId: "team-1", walletId: "team-wallet", isDefault: true },
    { id: 2, ownerId: "admin", accountName: "Main", teamId: null, walletId: "platform", isDefault: true },
    { id: 3, ownerId: "teamUser", accountName: "Main", teamId: null, walletId: "personal", isDefault: true },
    { id: 4, ownerId: "robin", accountName: "Main", teamId: null, walletId: "robin-personal", isDefault: true },
  ];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in value
        ? value.in.includes(row[key])
        : row[key] === value,
    );
  const db = {
    members,
    wallets,
    async $transaction(fn) {
      return fn(db);
    },
    zcashParams: {
      findFirst: async ({ where }) => wallets.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const rows = wallets.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      upsert: async ({ where, update, create }) => {
        const existing = wallets.find((row) => matches(row, where.ownerId_accountName_teamId));
        if (existing) return Object.assign(existing, update);
        const row = { id: nextId++, ...create };
        wallets.push(row);
        return row;
      },
    },
    teamMember: {
      findUnique: async ({ where }) => members.find((m) => matches(m, where.teamId_userId)) ?? null,
      findFirst: async ({ where }) => members.find((m) => matches(m, where)) ?? null,
      upsert: async ({ where, update, create }) => {
        const existing = members.find((m) => matches(m, where.teamId_userId));
        if (existing) return Object.assign(existing, update);
        members.push(create);
        return create;
      },
    },
    user: {
      findMany: async ({ where }) => {
        const user = (id) => ({ id, role: roles[id], isRobin: robins.has(id) });
        const fits = (u, cond) => Object.entries(cond).every(([k, v]) => u[k] === v);
        return where.id.in
          .filter((id) => id in roles)
          .map(user)
          .filter((u) => (!where.role || u.role === where.role) && (!where.OR || where.OR.some((c) => fits(u, c))));
      },
    },
    teamWallet: {
      findUnique: async () => ({ teamId: "team-1", accountName: "Team", chain: "mainnet", serverUrl: "https://zec.rocks:443" }),
    },
  };
  return db;
}

function loadTeams(db) {
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../prisma/client": db,
  };
  const filename = path.join(__dirname, "../routes/teams.js");
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
  return async (userIds) => {
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
    await routes["post /:teamId/members"].at(-1)(
      { user: { id: "owner", role: "TEAM" }, params: { teamId: "team-1" }, body: { userIds, role: "MEMBER" } },
      res,
    );
    return res;
  };
}

const defaultOf = (db, ownerId) =>
  db.wallets.filter((w) => w.ownerId === ownerId && w.isDefault).map((w) => w.walletId);

test("adding a platform admin to a team keeps the admin's platform wallet as default", async () => {
  const db = createDb();
  const res = await loadTeams(db)(["admin"]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(defaultOf(db, "admin"), ["platform"]);
  const copy = db.wallets.find((w) => w.ownerId === "admin" && w.teamId === "team-1");
  assert.ok(copy, "the admin still gets a copy of the team wallet");
  assert.equal(copy.isDefault, false);
});

test("a TEAM user who joins still gets the team wallet as default", async () => {
  const db = createDb();
  const res = await loadTeams(db)(["teamUser"]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(defaultOf(db, "teamUser"), ["team-wallet"]);
});

test("a new member with no wallet gets the team wallet as default", async () => {
  const db = createDb();
  await loadTeams(db)(["fresh"]);
  assert.deepEqual(defaultOf(db, "fresh"), ["team-wallet"]);
});

test("an isRobin user in a switched role keeps their personal default when added to a team", async () => {
  const db = createDb();
  const res = await loadTeams(db)(["robin"]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(defaultOf(db, "robin"), ["robin-personal"]);
  const copy = db.wallets.find((w) => w.ownerId === "robin" && w.teamId === "team-1");
  assert.ok(copy, "the isRobin user still gets a copy of the team wallet");
  assert.equal(copy.isDefault, false);
});
