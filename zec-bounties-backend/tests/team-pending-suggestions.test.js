// GET /api/teams/:teamId/bounties hides PENDING hunter suggestions from public
// and regular-member views, but team OWNER and ADMIN members are authorized to
// review them (PATCH /api/bounties/:id/suggestion-review) and the team console
// lists them from this endpoint. Team managers must receive pending suggestions
// without leaking them through the shared cache to ordinary members or guests.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { bountyUserSelects } = require("../utils/userSelects");
const { redactPublicUser } = require("../utils/privacy");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function pickSelect(obj, select) {
  if (!obj || !select) return obj;
  const out = {};
  for (const [k, v] of Object.entries(select)) {
    if (v) out[k] = obj[k];
  }
  return out;
}

function matchesWhere(row, where = {}) {
  for (const [key, value] of Object.entries(where)) {
    if (key === "OR") {
      if (!value.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (value && typeof value === "object" && "not" in value) {
      if (row[key] === value.not) return false;
      continue;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function createFixture({ isPrivate = false } = {}) {
  const team = { id: "team-1", name: "Core Team", logo: null, isPrivate };
  const members = {
    "team-1:owner-1": { teamId: "team-1", userId: "owner-1", role: "OWNER" },
    "team-1:tadmin-1": { teamId: "team-1", userId: "tadmin-1", role: "ADMIN" },
    "team-1:member-1": { teamId: "team-1", userId: "member-1", role: "MEMBER" },
  };
  const favorites = new Set(["team-1:community-1"]);

  const creatorUser = {
    id: "hunter-1",
    name: "Secret Real Name",
    nickname: "hunter1",
    email: "hunter1@example.com",
    avatar: null,
    role: "HUNTER",
    z_address: "zs1secret",
    UA_address: "u1secret",
    profileVisibility: { showDisplayName: false, showAvatar: false },
  };

  const bounties = [
    {
      id: "b-approved",
      teamId: "team-1",
      title: "Approved team bounty",
      chain: "MAIN",
      status: "TO_DO",
      isApproved: true,
      suggestionReviewStatus: null,
      dateCreated: new Date("2026-11-20T00:00:00Z"),
      assigneeUser: null,
      createdByUser: creatorUser,
      assignees: [],
      team: { id: team.id, name: team.name, logo: team.logo },
    },
    {
      id: "b-pending",
      teamId: "team-1",
      title: "Pending hunter suggestion",
      chain: "MAIN",
      status: "TO_DO",
      isApproved: false,
      suggestionReviewStatus: "PENDING",
      dateCreated: new Date("2026-11-21T00:00:00Z"),
      assigneeUser: null,
      createdByUser: creatorUser,
      assignees: [],
      team: { id: team.id, name: team.name, logo: team.logo },
    },
    {
      id: "b-declined",
      teamId: "team-1",
      title: "Declined hunter suggestion",
      chain: "MAIN",
      status: "CANCELLED",
      isApproved: false,
      suggestionReviewStatus: "DECLINED",
      dateCreated: new Date("2026-11-19T00:00:00Z"),
      assigneeUser: null,
      createdByUser: creatorUser,
      assignees: [],
      team: { id: team.id, name: team.name, logo: team.logo },
    },
  ];

  const cacheStore = new Map();
  let findManyCalls = 0;

  const db = {
    team: {
      findUnique: async ({ where }) => (where.id === team.id ? team : null),
    },
    teamMember: {
      findUnique: async ({ where }) => {
        const key = `${where.teamId_userId.teamId}:${where.teamId_userId.userId}`;
        return members[key] || null;
      },
    },
    teamFavorite: {
      findUnique: async ({ where }) => {
        const key = `${where.userId_teamId.teamId}:${where.userId_teamId.userId}`;
        return favorites.has(key) ? { userId: where.userId_teamId.userId } : null;
      },
    },
    bounty: {
      findMany: async ({ where, include, skip = 0, take = 10 }) => {
        findManyCalls += 1;
        return bounties
          .filter((b) => matchesWhere(b, where))
          .slice(skip, skip + take)
          .map((b) => ({
            ...b,
            createdByUser: pickSelect(
              b.createdByUser,
              include?.createdByUser?.select,
            ),
            assigneeUser: pickSelect(
              b.assigneeUser,
              include?.assigneeUser?.select,
            ),
          }));
      },
      count: async ({ where }) =>
        bounties.filter((b) => matchesWhere(b, where)).length,
    },
  };

  const routes = {};
  const router = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (url, ...handlers) => {
          routes[`${method} ${url}`] = handlers;
        },
    },
  );

  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": {
      PrismaClient: function () {
        return db;
      },
    },
    "../utils/cache": {
      delCache: async () => {},
      deleteCacheByPattern: async () => {},
      bumpVersion: async () => {},
      invalidateUserDirectory: async () => {},
      getCache: async (k) =>
        cacheStore.has(k) ? JSON.parse(cacheStore.get(k)) : null,
      setCache: async (k, v) => {
        cacheStore.set(k, JSON.stringify(v));
      },
      getVersion: async () => 1,
      TTL: { BOUNTY_LIST: 300 },
    },
    "../utils/userSelects": { bountyUserSelects, USER_SELECT_EXPORT: {} },
    "../utils/privacy": { redactPublicUser },
  };

  const filename = path.join(__dirname, "../routes/teams.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: { NODE_ENV: "production" } },
      setTimeout: () => {},
    },
    { filename },
  );

  async function getTeamBounties(user = undefined, query = {}) {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = JSON.parse(JSON.stringify(payload));
        return this;
      },
    };
    await routes["get /:teamId/bounties"].at(-1)(
      { params: { teamId: "team-1" }, query, user },
      res,
    );
    return res;
  }

  return {
    getTeamBounties,
    cacheStore,
    getFindManyCalls: () => findManyCalls,
  };
}

for (const isPrivate of [false, true]) {
  const label = isPrivate ? "private team" : "public team";

  test(`${label}: team OWNER and ADMIN receive pending bounty suggestions`, async () => {
    for (const user of [
      { id: "owner-1", role: "TEAM" },
      { id: "tadmin-1", role: "HUNTER" },
    ]) {
      const f = createFixture({ isPrivate });
      const res = await f.getTeamBounties(user);
      assert.equal(res.statusCode, 200);
      const ids = res.body.data.map((b) => b.id);
      assert.ok(
        ids.includes("b-pending"),
        `expected ${user.id} to see pending suggestion on ${label}, got ${JSON.stringify(ids)}`,
      );
      assert.equal(res.body.total, 3);
      // Team managers are not global admins: creator identity still respects profileVisibility.
      const pending = res.body.data.find((b) => b.id === "b-pending");
      assert.equal(pending.createdByUser.name, "Anonymous contributor");
      assert.equal(pending.createdByUser.email, undefined);
    }
  });

  test(`${label}: plain team MEMBER and non-member hunters do not receive pending suggestions`, async () => {
    const viewers = isPrivate
      ? [
          { id: "member-1", role: "HUNTER" },
          { id: "community-1", role: "HUNTER" },
        ]
      : [
          { id: "member-1", role: "HUNTER" },
          { id: "outsider-1", role: "HUNTER" },
          undefined,
        ];

    for (const user of viewers) {
      const f = createFixture({ isPrivate });
      const res = await f.getTeamBounties(user);
      assert.equal(res.statusCode, 200);
      const ids = res.body.data.map((b) => b.id);
      assert.ok(
        !ids.includes("b-pending"),
        `expected ${user?.id ?? "guest"} not to see pending suggestion on ${label}`,
      );
      assert.equal(res.body.total, 2);
    }
  });
}

test("cache isolation: team manager cache does not leak pending suggestions to members, and vice versa", async () => {
  // Member loads first -> team owner must not get the member's filtered cache
  {
    const f = createFixture({ isPrivate: false });
    const memberRes = await f.getTeamBounties({ id: "member-1", role: "HUNTER" });
    assert.deepEqual(
      memberRes.body.data.map((b) => b.id).sort(),
      ["b-approved", "b-declined"],
    );

    const ownerRes = await f.getTeamBounties({ id: "owner-1", role: "TEAM" });
    assert.deepEqual(
      ownerRes.body.data.map((b) => b.id).sort(),
      ["b-approved", "b-declined", "b-pending"],
    );
  }

  // Team owner loads first -> member must not get the owner's pending-inclusive cache,
  // and global admin must not get the team owner's redacted cache.
  {
    const f = createFixture({ isPrivate: false });
    const ownerRes = await f.getTeamBounties({ id: "owner-1", role: "TEAM" });
    assert.equal(ownerRes.body.total, 3);
    assert.equal(
      ownerRes.body.data.find((b) => b.id === "b-pending").createdByUser.name,
      "Anonymous contributor",
    );

    const memberRes = await f.getTeamBounties({ id: "member-1", role: "HUNTER" });
    assert.equal(memberRes.body.total, 2);
    assert.ok(!memberRes.body.data.some((b) => b.id === "b-pending"));

    const adminRes = await f.getTeamBounties({ id: "admin-1", role: "ADMIN" });
    assert.equal(adminRes.body.total, 3);
    assert.equal(
      adminRes.body.data.find((b) => b.id === "b-pending").createdByUser.name,
      "Secret Real Name",
    );
  }
});

test("private team still returns an empty page for guests and non-community outsiders", async () => {
  for (const user of [undefined, { id: "outsider-1", role: "HUNTER" }]) {
    const f = createFixture({ isPrivate: true });
    const res = await f.getTeamBounties(user);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { data: [], total: 0, page: 1, limit: 10 });
    assert.equal(f.getFindManyCalls(), 0);
  }
});
