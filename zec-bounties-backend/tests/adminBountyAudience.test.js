const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  userIdentityWhere,
  bountyInvolvesUserWhere,
} = require("../utils/userIdentity");

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness() {
  const routes = new Map();
  const query = { where: null, cacheKey: null };
  const noop = () => {};
  const router = new Proxy(
    {},
    {
      get(_target, method) {
        return (path, ...handlers) => {
          routes.set(`${String(method).toUpperCase()} ${path}`, handlers.at(-1));
          return router;
        };
      },
    },
  );
  const modules = {
    "../prisma/client": {
      bounty: {
        findMany: async ({ where }) => {
          query.where = normalize(where);
          return [];
        },
        count: async () => 0,
      },
    },
    "../utils/suggestionSettings": {},
    "../helpers/email": {},
    "../middleware/auth": {},
    "../middleware/websocket": {},
    "../utils/userIdentity": require("../utils/userIdentity"),
    "../utils/userSelects": {
      bountyUserSelects: () => ({ user: { id: true }, createdByUser: { id: true } }),
    },
    "../utils/privacy": { redactPublicUser: (user) => user },
    "../utils/sendMail": {},
    "../utils/notifyUser": {},
    "../utils/discord/discordNotify": {},
    "../utils/discord/discordAssignWebhook": {},
    "../utils/constants": {},
    "../helpers/validateBounty": {},
    "../utils/bountySuggestionReview": {},
    "../utils/bountyHelpers": {},
    "../utils/bountyActivity": {},
    "../utils/cache": {
      getCache: async () => null,
      setCache: async (key) => {
        query.cacheKey = key;
      },
      getVersion: async () => 1,
      TTL: { BOUNTY_LIST: 60 },
    },
  };
  const routeModule = { exports: {} };

  vm.runInNewContext(
    fs.readFileSync(require.resolve("../routes/bounties"), "utf8"),
    {
      require(name) {
        if (name === "express") return { Router: () => router };
        if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
        return modules[name];
      },
      module: routeModule,
      process: { env: { NODE_ENV: "test" } },
      console,
      setTimeout: noop,
    },
  );

  return {
    query,
    async list(search = {}) {
      let body;
      const res = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(value) {
          body = value;
          return this;
        },
      };
      await routes.get("GET /")(
        { query: search, user: { id: "admin", role: "ADMIN" } },
        res,
      );
      return body;
    },
  };
}

function cacheScope(key) {
  return JSON.parse(key.slice(key.indexOf("{"))).scope;
}

test("the unfiltered admin list excludes team bounties", async () => {
  const api = createHarness();
  await api.list();

  assert.deepEqual(api.query.where.AND[2].OR, [
    { teamId: null },
    { suggestionReviewStatus: "PENDING" },
  ]);
  assert.equal(cacheScope(api.query.cacheKey), "platform");
});

test("admin user search includes team bounties under the matching-user filter", async () => {
  const api = createHarness();
  await api.list({ user: "alice" });

  assert.deepEqual(api.query.where.AND[1], bountyInvolvesUserWhere(userIdentityWhere("alice")));
  assert.deepEqual(api.query.where.AND[2].OR, [
    { teamId: null },
    { suggestionReviewStatus: "PENDING" },
    { teamId: { not: null } },
  ]);
  assert.equal(cacheScope(api.query.cacheKey), "user-search");
});

test("an incomplete user term does not broaden the admin list", async () => {
  const api = createHarness();
  await api.list({ user: "a" });

  assert.deepEqual(api.query.where.AND[1], {});
  assert.deepEqual(api.query.where.AND[2].OR, [
    { teamId: null },
    { suggestionReviewStatus: "PENDING" },
  ]);
  assert.equal(cacheScope(api.query.cacheKey), "platform");
});
