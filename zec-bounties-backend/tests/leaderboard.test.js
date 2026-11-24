const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadLeaderboardRouter({
  hunters = [{ id: "h1" }],
  grouped = [
    { assignee: "h1", _sum: { bountyAmount: 2.5 }, _count: { id: 3 } },
  ],
  users = [
    {
      id: "h1",
      name: "Alice",
      nickname: "alice",
      avatar: null,
      profileVisibility: {
        showDisplayName: true,
        showCompleted: false,
        showEarnings: false,
      },
    },
  ],
  cached = null,
} = {}) {
  const calls = {
    userFindMany: [],
    bountyGroupBy: [],
    cacheSet: [],
  };
  const routes = {};

  const db = {
    user: {
      findMany: async (args) => {
        calls.userFindMany.push(args);
        if (args.where?.role === "HUNTER") return hunters;
        return users;
      },
    },
    bounty: {
      groupBy: async (args) => {
        calls.bountyGroupBy.push(args);
        return grouped;
      },
    },
  };

  const dependencies = {
    express: {
      Router: () =>
        new Proxy(
          {},
          {
            get: (_, method) => (url, ...handlers) => {
              routes[`${method} ${url}`] = handlers;
            },
          },
        ),
    },
    "../prisma/client": db,
    "../middleware/auth": { optionalAuthenticate: () => {} },
    "../utils/cache": {
      getCache: async () => cached,
      setCache: async (k, v, ttl) => calls.cacheSet.push({ k, v, ttl }),
      getVersion: async () => 1,
    },
    "../utils/privacy": require("../utils/privacy"),
  };

  const filename = path.join(__dirname, "../routes/leaderboard.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require: (name) => dependencies[name],
      console: { log() {}, error() {} },
    },
    { filename },
  );

  async function invoke(req = {}) {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = JSON.parse(JSON.stringify(payload));
        return this;
      },
    };
    await routes["get /"].at(-1)({ query: {}, user: null, ...req }, res);
    return res;
  }

  return { calls, invoke };
}

test("non-admin requesting non-MAIN chain receives 403", async () => {
  const { calls, invoke } = loadLeaderboardRouter();
  const res = await invoke({ query: { chain: "TEST" }, user: { role: "HUNTER" } });
  assert.equal(res.statusCode, 403);
  assert.equal(calls.bountyGroupBy.length, 0);
});

test("admin requesting invalid chain receives 400 instead of Prisma 500", async () => {
  const { calls, invoke } = loadLeaderboardRouter();
  for (const chain of ["INVALID", "MAINNET", "DROP TABLE"]) {
    const res = await invoke({ query: { chain }, user: { role: "ADMIN" } });
    assert.equal(res.statusCode, 400, chain);
    assert.match(res.body.error, /Invalid chain/);
  }
  assert.equal(calls.bountyGroupBy.length, 0);
});

test("admin can query TEST and ALL chains with normalized array params and limit clamping", async () => {
  const { calls, invoke } = loadLeaderboardRouter();

  const resTest = await invoke({
    query: { chain: ["test", "MAIN"], timeRange: ["30d", "90d"], limit: ["500", "10"] },
    user: { role: "ADMIN" },
  });
  assert.equal(resTest.statusCode, 200);
  assert.equal(calls.bountyGroupBy[0].where.chain, "TEST");
  assert.equal(calls.bountyGroupBy[0].take, 100);
  assert.equal(resTest.body[0].completed, 3);
  assert.equal(resTest.body[0].earned, 2.5);

  const resAll = await invoke({
    query: { chain: "all", limit: "-5" },
    user: { role: "ADMIN" },
  });
  assert.equal(resAll.statusCode, 200);
  assert.equal("chain" in calls.bountyGroupBy[1].where, false);
  assert.equal(calls.bountyGroupBy[1].take, 25);
});

test("public request applies privacy redaction on MAIN chain", async () => {
  const { invoke } = loadLeaderboardRouter();
  const res = await invoke({ query: { chain: "main", timeRange: "90d" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "Alice");
  assert.equal(res.body[0].completed, null);
  assert.equal(res.body[0].earned, null);
  assert.equal(res.body[0].points, null);
});

test("short-circuits when no hunters or no grouped bounties exist", async () => {
  const noHunters = loadLeaderboardRouter({ hunters: [] });
  const r1 = await noHunters.invoke({ query: {} });
  assert.equal(r1.statusCode, 200);
  assert.deepEqual(r1.body, []);
  assert.equal(noHunters.calls.bountyGroupBy.length, 0);

  const noBounties = loadLeaderboardRouter({ hunters: [{ id: "h1" }], grouped: [] });
  const r2 = await noBounties.invoke({ query: {} });
  assert.equal(r2.statusCode, 200);
  assert.deepEqual(r2.body, []);
  assert.equal(noBounties.calls.userFindMany.length, 1);
});
