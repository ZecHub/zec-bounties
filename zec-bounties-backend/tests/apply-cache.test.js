const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, dependencies) {
  const filename = path.join(__dirname, "..", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require(name) {
        const key = name.replace(/\.js$/, "");
        if (Object.hasOwn(dependencies, key)) return dependencies[key];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      process: { env: { NODE_ENV: "production" } },
      console: { log() {}, error() {} },
      setTimeout() {},
    },
    { filename },
  );
  return module.exports;
}

function createHarness() {
  const values = new Map();
  const redisClient = {
    get: async (key) => values.get(key) ?? null,
    setEx: async (key, _ttl, value) => values.set(key, value),
    del: async (keys) =>
      (Array.isArray(keys) ? keys : [keys]).forEach((key) =>
        values.delete(key),
      ),
    incr: async (key) => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async *scanIterator({ MATCH }) {
      yield [...values.keys()].filter((key) =>
        key.startsWith(MATCH.replace(/\*$/, "")),
      );
    },
  };
  const cache = load("utils/cache.js", { "../config/redis": { redisClient } });

  const bounty = {
    id: "b1",
    title: "Open bounty",
    bountyAmount: 0.5,
    createdBy: "admin1",
    assignee: null,
    isPrivate: false,
    teamId: null,
    status: "TO_DO",
  };
  const applications = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const db = {
    bounty: {
      findUnique: async ({ where }) => (where.id === bounty.id ? clone(bounty) : null),
    },
    bountyApplication: {
      findUnique: async ({ where }) => {
        const key = where.bountyId_applicantId;
        if (!key) return null;
        return (
          applications.find(
            (a) =>
              a.bountyId === key.bountyId && a.applicantId === key.applicantId,
          ) ?? null
        );
      },
      findMany: async ({ where } = {}) => {
        let rows = applications;
        if (where?.bountyId) {
          rows = rows.filter((a) => a.bountyId === where.bountyId);
        }
        if (where?.applicantId) {
          rows = rows.filter((a) => a.applicantId === where.applicantId);
        }
        return rows.map(clone);
      },
      create: async ({ data }) => {
        const row = {
          id: `app-${applications.length + 1}`,
          bountyId: data.bountyId,
          applicantId: data.applicantId,
          message: data.message,
          status: "pending",
          appliedAt: new Date().toISOString(),
          bounty: {
            id: bounty.id,
            title: bounty.title,
            bountyAmount: bounty.bountyAmount,
          },
          applicantUser: {
            id: data.applicantId,
            name: "Hunter",
            nickname: "hunter",
          },
        };
        applications.push(row);
        return clone(row);
      },
    },
    bountyAssignee: { findUnique: async () => null },
    teamMember: { findUnique: async () => null },
    teamFavorite: { findUnique: async () => null },
  };

  const noOp = async () => {};
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": db,
    "./cache": cache,
    "./sendMail": noOp,
    "./notifyUser": noOp,
    "../middleware/websocket": { sendRealtimeUpdate() {}, sendToUser() {} },
  });

  const routes = new Map();
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete"].map((method) => [
      method,
      (url, ...callbacks) => routes.set(`${method}:${url}`, callbacks.at(-1)),
    ]),
  );

  load("routes/bounties.js", {
    express: { Router: () => router },
    "../prisma/client": db,
    "../utils/suggestionSettings": {
      getSuggestionSettings: async () => ({ mode: "open", threshold: 0 }),
    },
    "../helpers/email": {},
    "../middleware/auth": {
      authenticate: noOp,
      isAdmin: noOp,
      optionalAuthenticate: noOp,
      signSessionToken: noOp,
    },
    "../middleware/websocket": { sendRealtimeUpdate() {}, sendToUser() {} },
    "../utils/cache": cache,
    "../utils/sendMail": noOp,
    "../utils/notifyUser": noOp,
    "../utils/discord/discordNotify": {},
    "../utils/discord/discordAssignWebhook": {
      notifyAssignment: noOp,
      notifyBountyAssignees: noOp,
      notifyBountyState: noOp,
    },
    "../utils/constants": { REQUIRED_TEAM_VERIFICATIONS: 2 },
    "../helpers/validateBounty": {},
    "../utils/bountySuggestionReview": require("../utils/bountySuggestionReview"),
    "../utils/userSelects": require("../utils/userSelects"),
    "../utils/bountyHelpers": helpers,
    "../utils/userIdentity": require("../utils/userIdentity"),
    "../utils/bountyActivity": { logActivity: noOp, publishActivity: noOp },
    "../utils/privacy": require("../utils/privacy"),
    "../utils/exportableBounty": require("../utils/exportableBounty"),
  });

  async function request(method, url, { body = {}, params = {}, query = {}, user } = {}) {
    let statusCode = 200;
    let payload;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return this;
      },
    };
    const handler = routes.get(`${method}:${url}`);
    assert.ok(handler, `Route ${method} ${url} not registered`);
    await handler({ body, params, query, user }, res);
    return { statusCode, body: payload };
  }

  return { cache, values, applications, request };
}

test("POST /apply invalidates the cached GET /:bountyId/applications list", async () => {
  const h = createHarness();
  const admin = { id: "admin1", role: "ADMIN" };
  const hunter = { id: "hunter1", role: "HUNTER" };

  // Warm the per-bounty, per-user, and admin-all application caches.
  const beforeBountyApps = await h.request("get", "/:bountyId/applications", {
    params: { bountyId: "b1" },
    user: admin,
  });
  assert.equal(beforeBountyApps.statusCode, 200);
  assert.deepEqual(beforeBountyApps.body, []);

  const beforeMyApps = await h.request("get", "/my-applications", {
    user: hunter,
  });
  assert.equal(beforeMyApps.statusCode, 200);
  assert.deepEqual(beforeMyApps.body, []);

  const beforeAllApps = await h.request("get", "/all-applications", {
    user: admin,
  });
  assert.equal(beforeAllApps.statusCode, 200);
  assert.deepEqual(beforeAllApps.body, []);

  assert.ok(h.values.has("applications:bounty:b1"));

  // Submit an application.
  const applied = await h.request("post", "/apply", {
    body: { bountyId: "b1", message: "I can deliver this with tests." },
    user: hunter,
  });
  assert.equal(applied.statusCode, 201);
  assert.equal(applied.body.bountyId, "b1");

  // All three application caches must be cleared.
  assert.equal(h.values.has("applications:bounty:b1"), false);
  assert.equal(h.values.has("applications:user:hunter1"), false);
  assert.equal(h.values.has("applications:all"), false);

  // Subsequent GET /:bountyId/applications sees the new application immediately.
  const afterBountyApps = await h.request("get", "/:bountyId/applications", {
    params: { bountyId: "b1" },
    user: admin,
  });
  assert.equal(afterBountyApps.statusCode, 200);
  assert.equal(afterBountyApps.body.length, 1);
  assert.equal(afterBountyApps.body[0].applicantId, "hunter1");
});

test("rejected POST /apply does not invalidate cached /:bountyId/applications", async () => {
  const h = createHarness();
  const admin = { id: "admin1", role: "ADMIN" };
  const hunter = { id: "hunter1", role: "HUNTER" };

  await h.request("get", "/:bountyId/applications", {
    params: { bountyId: "b1" },
    user: admin,
  });
  assert.ok(h.values.has("applications:bounty:b1"));

  // Blank message is rejected before any DB write.
  const rejected = await h.request("post", "/apply", {
    body: { bountyId: "b1", message: "   " },
    user: hunter,
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(h.values.has("applications:bounty:b1"), true);
});
