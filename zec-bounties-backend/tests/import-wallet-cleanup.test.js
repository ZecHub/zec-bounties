const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Loads the real routes/zcash.js with its dependencies stubbed. The wallet
// table is an in-memory array; no CLI is spawned and no directory is touched.
function createHarness({ seedError, role = "ADMIN" } = {}) {
  const rows = [];
  const effects = { seeds: [], removedDirs: [], invalidated: [] };
  let nextId = 1;
  const zcashParams = {
    findFirst: async ({ where }) =>
      rows.find(
        (row) =>
          row.ownerId === where.ownerId &&
          row.accountName === where.accountName &&
          (!("teamId" in where) || row.teamId === where.teamId),
      ) ?? null,
    findUnique: async ({ where }) => rows.find((row) => row.id === where.id) ?? null,
    create: async ({ data }) => {
      const row = { id: nextId, walletId: `wallet-${nextId}`, teamId: null, isDefault: false, ...data };
      nextId += 1;
      rows.push(row);
      return row;
    },
    delete: async ({ where }) => {
      rows.splice(rows.findIndex((row) => row.id === where.id), 1);
    },
    updateMany: async ({ where, data }) => {
      for (const row of rows) {
        if (row.ownerId === where.ownerId && row.isDefault === where.isDefault) Object.assign(row, data);
      }
    },
    update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
  };
  const prisma = { zcashParams, $transaction: (fn) => fn(prisma) };
  const unused = () => {
    throw new Error("Unexpected dependency call");
  };
  const routes = {};
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete", "use"].map((method) => [
      method,
      (url, ...handlers) => {
        routes[`${method} ${url}`] = handlers;
      },
    ]),
  );
  const authenticate = () => {};
  const dependencies = {
    express: { Router: () => router },
    axios: {},
    bcrypt: {},
    jsonwebtoken: {},
    "../prisma/client": prisma,
    "../middleware/auth": { authenticate, isAdmin() {} },
    "../zcash/init": { initZcashOnce: async () => {} },
    "../utils/zingo/zingoLibSeed": async (params, seed) => {
      effects.seeds.push([params.dataDir, seed]);
      if (seedError) throw new Error(seedError);
      return {};
    },
    "../helpers/zcash/zcashHelper.js": {
      getWalletDataDir: (walletId) => `wallets/${walletId}`,
      getDefaultZcashParams: unused,
    },
    "../utils/zingo/zingoLibInfo": unused,
    "../helpers/zcash/walletConnection": require("../helpers/zcash/walletConnection"),
    "../middleware/websocket": { sendToUser: unused },
    fs: { promises: { rm: async (dir) => effects.removedDirs.push(dir) } },
    path,
    "../utils/zingo/getZingo": { invalidateZingo: (params) => effects.invalidated.push(params) },
  };
  const filename = path.join(__dirname, "../routes/zcash.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return {
    rows,
    effects,
    routes,
    authenticate,
    role,
    async importWallet(body) {
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
      await routes["post /import-wallet"].at(-1)(
        { user: { id: "fixture-user", role: this.role }, body },
        res,
      );
      return res;
    },
  };
}

const seedPhrase = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");

for (const role of ["ADMIN", "TEAM"]) {
  test(`a failed seed restore removes the wallet row and directory (${role})`, async () => {
    const h = createHarness({ seedError: "Zingo CLI error: invalid seed", role });
    const res = await h.importWallet({ accountName: "Savings", seedPhrase });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Failed to restore wallet from seed phrase");
    assert.deepEqual(h.rows, []);
    assert.deepEqual(h.effects.removedDirs, ["wallets/wallet-1"]);
    assert.deepEqual(
      h.effects.invalidated.map(({ dataDir }) => dataDir),
      ["wallets/wallet-1"],
    );
  });

  test(`the same account name can be imported again after a failed restore (${role})`, async () => {
    const h = createHarness({ seedError: "Zingo CLI error: invalid seed", role });
    await h.importWallet({ accountName: "Savings", seedPhrase });
    const retry = await h.importWallet({ accountName: "Savings", seedPhrase });
    assert.equal(retry.statusCode, 500);
    assert.equal(h.effects.seeds.length, 2);
    assert.deepEqual(h.rows, []);
  });

  test(`a successful import keeps the wallet, makes it the default and stays behind authenticate (${role})`, async () => {
    const h = createHarness({ role });
    const res = await h.importWallet({ accountName: "Savings", seedPhrase });
    assert.equal(res.statusCode, 201);
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].isDefault, true);
    assert.deepEqual(h.effects.removedDirs, []);
    assert.deepEqual(h.effects.invalidated, []);
    assert.equal(h.routes["post /import-wallet"][0], h.authenticate);

    const again = await h.importWallet({ accountName: "Savings", seedPhrase });
    assert.equal(again.statusCode, 409);
  });

  test(`a seed phrase that is not a string answers 400 and creates nothing (${role})`, async () => {
    for (const bad of [123456, ["a", "b"], { words: 24 }]) {
      const h = createHarness({ role });
      const res = await h.importWallet({ accountName: "Savings", seedPhrase: bad });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(h.rows, []);
      assert.deepEqual(h.effects.seeds, []);
    }
  });
}

test("non-ADMIN/TEAM role is forbidden", async () => {
  const h = createHarness({ role: "HUNTER" });
  const res = await h.importWallet({ accountName: "Savings", seedPhrase });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Forbidden: Only ADMIN and TEAM roles can import wallets.");
  assert.deepEqual(h.rows, []);
  assert.deepEqual(h.effects.seeds, []);
});