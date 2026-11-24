const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createZcashHarness({ role = "ADMIN" } = {}) {
  const rows = [];
  const effects = { seeds: [], queries: [], notifications: [] };
  let nextId = 1;

  const zcashParams = {
    findFirst: async ({ where }) => {
      effects.queries.push({ op: "findFirst", where });
      return (
        rows.find(
          (row) =>
            (!("ownerId" in where) || row.ownerId === where.ownerId) &&
            (!("accountName" in where) || row.accountName === where.accountName) &&
            (!("teamId" in where) || row.teamId === where.teamId),
        ) ?? null
      );
    },
    findUnique: async ({ where }) =>
      rows.find((row) => row.id === where.id) ?? null,
    create: async ({ data }) => {
      const row = {
        id: nextId,
        walletId: `wallet-${nextId}`,
        teamId: null,
        isDefault: false,
        ...data,
      };
      nextId += 1;
      rows.push(row);
      return row;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const row of rows) {
        if (row.ownerId === where.ownerId && row.isDefault === where.isDefault) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }) => {
      const idx = rows.findIndex((r) => r.id === where.id);
      if (idx !== -1) rows.splice(idx, 1);
    },
  };

  const prisma = { zcashParams, $transaction: (fn) => fn(prisma) };
  const routes = {};
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete", "use"].map((method) => [
      method,
      (url, ...handlers) => {
        routes[`${method} ${url}`] = handlers;
      },
    ]),
  );

  const dependencies = {
    express: { Router: () => router },
    axios: {},
    bcrypt: {},
    jsonwebtoken: {},
    "../prisma/client": prisma,
    "../middleware/auth": { authenticate() {}, isAdmin() {} },
    "../zcash/init": { initZcashOnce: async () => {} },
    "../utils/zingo/zingoLibSeed": async (params, seed, birthday) => {
      effects.seeds.push({ dataDir: params.dataDir, seed, birthday });
      return {};
    },
    "../helpers/zcash/zcashHelper.js": {
      getWalletDataDir: (walletId) => `wallets/${walletId}`,
      getDefaultZcashParams: async () => null,
    },
    "../utils/zingo/zingoLibInfo": async () => ({}),
    "../helpers/zcash/walletConnection": require("../helpers/zcash/walletConnection"),
    "../middleware/websocket": {
      sendToUser: (...args) => effects.notifications.push(args),
    },
    fs: { promises: { rm: async () => {} } },
    path,
    "../utils/zingo/getZingo": { invalidateZingo: () => {} },
  };

  const filename = path.join(__dirname, "../routes/zcash.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );

  async function call(key, { body, params = {} } = {}) {
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
    await routes[key].at(-1)(
      { user: { id: "u1", role }, body, params },
      res,
    );
    return res;
  }

  return { rows, effects, call };
}

const VALID_SEED = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");

test("POST /import-wallet rejects missing/non-object bodies, non-string accountName, and invalid birthdayHeight", async () => {
  const h = createZcashHarness();

  for (const badBody of [undefined, null, [], "raw"]) {
    const res = await h.call("post /import-wallet", { body: badBody });
    assert.equal(res.statusCode, 400);
  }

  for (const badName of [{ not: "" }, 123, "   ", "a".repeat(101)]) {
    const res = await h.call("post /import-wallet", {
      body: { accountName: badName, seedPhrase: VALID_SEED },
    });
    assert.equal(res.statusCode, 400);
  }

  for (const badHeight of [-1, 1.5, "abc", "-10", {}, []]) {
    const res = await h.call("post /import-wallet", {
      body: {
        accountName: "Savings",
        seedPhrase: VALID_SEED,
        birthdayHeight: badHeight,
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /birthdayHeight/);
  }

  assert.equal(h.effects.queries.length, 0);
  assert.equal(h.effects.seeds.length, 0);
});

test("POST /import-wallet trims accountName and parses integer string birthdayHeight", async () => {
  const h = createZcashHarness();
  const res = await h.call("post /import-wallet", {
    body: {
      accountName: "  Treasury  ",
      seedPhrase: VALID_SEED,
      birthdayHeight: "2500000",
    },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(h.rows[0].accountName, "Treasury");
  assert.equal(h.effects.seeds[0].birthday, 2500000);
});

test("POST /params and POST /params/upsert reject non-string or blank accountName and non-object body", async () => {
  const h = createZcashHarness();

  for (const routeKey of ["post /params", "post /params/upsert"]) {
    const resNull = await h.call(routeKey, { body: null });
    assert.equal(resNull.statusCode, 400);

    for (const badName of [{ not: "" }, "   ", 42]) {
      const res = await h.call(routeKey, { body: { accountName: badName } });
      assert.equal(res.statusCode, 400);
    }
  }

  assert.equal(h.effects.queries.length, 0);
});

test("PUT and PATCH /params/:accountName reject invalid req.body and blank/non-string accountName", async () => {
  const h = createZcashHarness();
  await h.call("post /params", { body: { accountName: "Primary" } });

  const putNull = await h.call("put /params/:accountName", {
    params: { accountName: "Primary" },
    body: null,
  });
  assert.equal(putNull.statusCode, 400);

  const putObjName = await h.call("put /params/:accountName", {
    params: { accountName: "Primary" },
    body: { accountName: { not: "" } },
  });
  assert.equal(putObjName.statusCode, 400);

  const patchArr = await h.call("patch /params/:accountName", {
    params: { accountName: "Primary" },
    body: [],
  });
  assert.equal(patchArr.statusCode, 400);

  const patchBlank = await h.call("patch /params/:accountName", {
    params: { accountName: "Primary" },
    body: { accountName: "   " },
  });
  assert.equal(patchBlank.statusCode, 400);
});

test("PATCH /params/:accountName/set-default handles empty body, rejects non-string teamId, and clears all prior defaults", async () => {
  const h = createZcashHarness();
  await h.call("post /params", { body: { accountName: "W1" } });
  await h.call("post /params", { body: { accountName: "W2" } });
  h.rows[0].isDefault = true;
  h.rows[1].isDefault = true;

  const badTeam = await h.call("patch /params/:accountName/set-default", {
    params: { accountName: "W2" },
    body: { teamId: { not: null } },
  });
  assert.equal(badTeam.statusCode, 400);

  const ok = await h.call("patch /params/:accountName/set-default", {
    params: { accountName: "W2" },
    body: undefined,
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(h.rows[0].isDefault, false);
  assert.equal(h.rows[1].isDefault, true);
});
