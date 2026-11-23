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

function createHarness({ team = { id: "team-priv", isPrivate: true } } = {}) {
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

  const bounties = [
    {
      id: "b1",
      title: "Platform bounty",
      description: "Fixture",
      bountyAmount: 1,
      createdBy: "admin1",
      createdByRole: "ADMIN",
      assignee: "hunter1",
      chain: "MAIN",
      teamId: null,
      status: "DONE",
      isApproved: true,
      isPrivate: false,
      isPaid: false,
      exportedAt: null,
      assigneeUser: { id: "hunter1", name: "Hunter", profileVisibility: {} },
      createdByUser: {
        id: "admin1",
        name: "Admin",
        role: "ADMIN",
        profileVisibility: {},
      },
      assignees: [],
      team: null,
    },
  ];
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const matchesListWhere = (b, where) => {
    if (!where) return true;
    if (where.chain && b.chain !== where.chain) return false;
    if (where.AND) {
      return where.AND.every((clause) => matchesListWhere(b, clause));
    }
    if (where.OR) {
      return where.OR.some((clause) => matchesListWhere(b, clause));
    }
    if ("teamId" in where && b.teamId !== where.teamId) return false;
    if ("isPrivate" in where && b.isPrivate !== where.isPrivate) return false;
    if ("createdBy" in where && b.createdBy !== where.createdBy) return false;
    if ("assignee" in where && b.assignee !== where.assignee) return false;
    if ("assignees" in where) return false;
    if ("team" in where) {
      if (!b.team) return false;
      if ("isPrivate" in where.team && b.team.isPrivate !== where.team.isPrivate)
        return false;
      if ("members" in where.team || "favoritedBy" in where.team) return false;
    }
    if ("suggestionReviewStatus" in where) {
      const cond = where.suggestionReviewStatus;
      if (cond === null) return (b.suggestionReviewStatus ?? null) === null;
      if (typeof cond === "string") return b.suggestionReviewStatus === cond;
      if (cond && typeof cond === "object" && "not" in cond)
        return b.suggestionReviewStatus !== cond.not;
    }
    return true;
  };

  const db = {
    team: {
      findUnique: async ({ where }) =>
        team && where.id === team.id ? { ...team } : null,
    },
    teamMember: { findUnique: async () => null },
    teamFavorite: { findUnique: async () => null },
    bountyAssignee: { findUnique: async () => null },
    bounty: {
      findUnique: async ({ where }) => {
        const b = bounties.find((x) => x.id === where.id);
        return b ? clone(b) : null;
      },
      findMany: async ({ where } = {}) =>
        bounties.filter((b) => matchesListWhere(b, where)).map(clone),
      count: async ({ where = {} } = {}) => {
        // /stats/totals unpaidDoneCount query uses ADMIN_PAYOUT_SCOPE (OR with teamId: null)
        if (where.status === "DONE" && where.isPaid === false) {
          return bounties.filter(
            (b) =>
              b.chain === "MAIN" &&
              b.status === "DONE" &&
              !b.isPaid &&
              b.exportedAt === null &&
              b.teamId === null,
          ).length;
        }
        return bounties.filter((b) => matchesListWhere(b, where)).length;
      },
      aggregate: async () => ({
        _sum: {
          bountyAmount: bounties.reduce((sum, b) => sum + b.bountyAmount, 0),
        },
        _count: { id: bounties.length },
      }),
      groupBy: async () => [{ status: "DONE", _count: { id: bounties.length } }],
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const b of bounties) {
          if (
            where.id?.in?.includes(b.id) &&
            b.teamId === where.teamId &&
            (!where.createdByUser || b.createdByRole === where.createdByUser.role)
          ) {
            Object.assign(b, data);
            b.team = { id: team.id, name: "Private Team", logo: null, isPrivate: team.isPrivate };
            count += 1;
          }
        }
        return { count };
      },
    },
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

  async function request(method, url, { body = {}, params = {}, query = {}, user = { id: "admin1", role: "ADMIN" } } = {}) {
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

  return { cache, db, bounties, request };
}

test("PATCH /unassigned/assign-team invalidates cached list and single-bounty views", async () => {
  const h = createHarness({ team: { id: "team-priv", isPrivate: true } });

  // Warm both admin list, public list, and anonymous single-bounty caches.
  const adminListBefore = await h.request("get", "/", {
    user: { id: "admin1", role: "ADMIN" },
  });
  assert.equal(adminListBefore.statusCode, 200);
  assert.equal(adminListBefore.body.data.length, 1);

  const anonDetailBefore = await h.request("get", "/:id", {
    params: { id: "b1" },
    user: null,
  });
  assert.equal(anonDetailBefore.statusCode, 200);
  assert.equal(anonDetailBefore.body.id, "b1");

  const versionBefore = await h.cache.getVersion("bounties");

  const move = await h.request("patch", "/unassigned/assign-team", {
    body: { teamId: "team-priv", bountyIds: ["b1"] },
    user: { id: "admin1", role: "ADMIN" },
  });
  assert.equal(move.statusCode, 200);
  assert.equal(move.body.movedCount, 1);
  assert.ok((await h.cache.getVersion("bounties")) > versionBefore);

  // Admin platform list no longer shows the moved bounty.
  const adminListAfter = await h.request("get", "/", {
    user: { id: "admin1", role: "ADMIN" },
  });
  assert.equal(adminListAfter.statusCode, 200);
  assert.equal(adminListAfter.body.data.length, 0);

  // Anonymous viewer no longer receives the now-private bounty from cache.
  const anonDetailAfter = await h.request("get", "/:id", {
    params: { id: "b1" },
    user: null,
  });
  assert.equal(anonDetailAfter.statusCode, 404);
});

test("PATCH /unassigned/assign-team invalidates cached /stats/totals", async () => {
  const h = createHarness({ team: { id: "team-pub", isPrivate: false } });

  const statsBefore = await h.request("get", "/stats/totals");
  assert.equal(statsBefore.statusCode, 200);
  assert.equal(statsBefore.body.unpaidDoneCount, 1);

  const move = await h.request("patch", "/unassigned/assign-team", {
    body: { teamId: "team-pub", bountyIds: ["b1"] },
  });
  assert.equal(move.statusCode, 200);
  assert.equal(move.body.movedCount, 1);

  const statsAfter = await h.request("get", "/stats/totals");
  assert.equal(statsAfter.statusCode, 200);
  assert.equal(statsAfter.body.unpaidDoneCount, 0);
});

test("PATCH /unassigned/assign-team does not bust caches when zero bounties moved", async () => {
  const h = createHarness({ team: { id: "team-pub", isPrivate: false } });
  await h.request("get", "/stats/totals");
  const versionBefore = await h.cache.getVersion("bounties");

  const move = await h.request("patch", "/unassigned/assign-team", {
    body: { teamId: "team-pub", bountyIds: ["non-existent"] },
  });
  assert.equal(move.statusCode, 200);
  assert.equal(move.body.movedCount, 0);
  assert.equal(await h.cache.getVersion("bounties"), versionBefore);
  assert.notEqual(await h.cache.getCache("stats:totals"), null);
});

test("PATCH /unassigned/assign-team does not bust caches on database error", async () => {
  const h = createHarness({ team: { id: "team-pub", isPrivate: false } });
  await h.request("get", "/stats/totals");
  const versionBefore = await h.cache.getVersion("bounties");
  h.db.bounty.updateMany = async () => {
    throw new Error("DB error");
  };

  const move = await h.request("patch", "/unassigned/assign-team", {
    body: { teamId: "team-pub", bountyIds: ["b1"] },
  });
  assert.equal(move.statusCode, 500);
  assert.equal(await h.cache.getVersion("bounties"), versionBefore);
  assert.notEqual(await h.cache.getCache("stats:totals"), null);
});
