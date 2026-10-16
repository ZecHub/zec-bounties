const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
// Loads the real routes/transactions.js with its dependencies stubbed. The
// zingo command stubs refuse null params, which getZingo cannot read
// (its `params = {}` default only covers undefined); nothing is spawned.
function createHarness({ defaults }) {
  const pendingDefaults = [...defaults];
  const effects = { commands: [], initializations: [], walletLookups: [] };
  const command = (name) => async (...args) => {
    const params = args.find((arg) => typeof arg !== "string");
    assert.ok(params, `${name} ran without wallet params`);
    effects.commands.push([name, params]);
    return name === "addresses" ? [{ encoded_address: "fixture-address" }] : { ok: name };
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
  const isAdmin = () => {};
  const unused = () => {
    throw new Error("Unexpected dependency call");
  };
  const dependencies = {
    express: { Router: () => router },
    "../prisma/client": {},
    "../middleware/auth": { authenticate, isAdmin },
    "../utils/zingo/zingoLibQuickSend.js": unused,
    "../zcash/init": {
      initZcashOnce: async (...args) => effects.initializations.push(args),
    },
    "../utils/zingo/zingoLibTransactions.js": command("transactions"),
    "../utils/zingo/zingoLibAddresses.js": command("addresses"),
    "../helpers/zcash/zcashHelper.js": {
      getLatestZcashParams: unused,
      getDefaultZcashParams: async (userId) => {
        effects.walletLookups.push(userId);
        return pendingDefaults.shift() ?? null;
      },
    },
    "../utils/zingo/zingoLibSync.js": command("sync"),
    "../utils/zingo/zingoLibRescan.js": command("rescan"),
    "../utils/zingo/zingoLibRecoveryInfo.js": unused,
    "../utils/zingo/zingoLibQuit.js": unused,
    "../utils/zingo/zingoLibBalance.js": command("balance"),
    "../helpers/zcash/resolvePayingWallet": { resolvePayingWallet: unused },
    "../utils/cache": { delCache: unused, deleteCacheByPattern: unused },
    "../utils/bountyHelpers": { invalidateBounty: async () => {} },
    "../utils/zingo/zingoLibInfo": unused,
    "../helpers/zcash/walletConnection": require("../helpers/zcash/walletConnection"),
    crypto: require("node:crypto"),
    "../middleware/websocket": { sendRealtimeUpdate() {}, sendToUser() {} },
    path,
  };
  const filename = path.join(__dirname, "../routes/transactions.js");
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
    effects,
    routes,
    authenticate,
    isAdmin,
    async request(route) {
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
      await routes[route].at(-1)({ user: { id: "fixture-admin", role: "ADMIN" } }, res);
      return res;
    },
  };
}

const createdWallet = { walletId: "created-fixture", accountName: "Main", chain: "mainnet" };
const creating = ["get /balance", "get /sync-status", "get /rescan"];
const readOnly = ["get /", "get /addresses"];

for (const route of creating) {
  test(`${route} runs on the wallet it just created`, async () => {
    const h = createHarness({ defaults: [null, createdWallet] });
    const res = await h.request(route);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(h.effects.initializations, [["fixture-admin", "Main"]]);
    assert.deepEqual(h.effects.walletLookups, ["fixture-admin", "fixture-admin"]);
    assert.deepEqual(h.effects.commands.map(([, params]) => params), [createdWallet]);
  });

  test(`${route} answers 404 without a command when no wallet becomes available`, async () => {
    const h = createHarness({ defaults: [null, null] });
    const res = await h.request(route);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, "No Zcash wallet available");
    assert.deepEqual(h.effects.commands, []);
  });
}

for (const route of readOnly) {
  test(`${route} answers 404 without a command or a new wallet when there is none`, async () => {
    const h = createHarness({ defaults: [null] });
    const res = await h.request(route);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(h.effects.commands, []);
    assert.deepEqual(h.effects.initializations, []);
  });
}

test("an existing wallet is used as is and the routes stay admin-only", async () => {
  for (const route of [...creating, ...readOnly]) {
    const h = createHarness({ defaults: [createdWallet] });
    const res = await h.request(route);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(h.effects.initializations, []);
    assert.equal(h.routes[route][0], h.authenticate);
    assert.equal(h.routes[route][1], h.isAdmin);
  }
});
