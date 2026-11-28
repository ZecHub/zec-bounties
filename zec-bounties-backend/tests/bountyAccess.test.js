const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function withNoop() {
  return new Proxy(
    {},
    { get: () => async () => {} },
  );
}

function createFixtureDb({
  users = [],
  teams = [],
  teamMembers = [],
  teamFavorites = [],
  bountyAssignees = [],
  bounties = [],
} = {}) {
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return {
    user: {
      findMany: async ({ where } = {}) =>
        users
          .filter((u) => !where?.role || u.role === where.role)
          .map((u) => ({ id: u.id })),
    },
    team: {
      findUnique: async ({ where }) => {
        const team = teamById.get(where.id);
        return team ? { isPrivate: team.isPrivate } : null;
      },
    },
    teamMember: {
      findUnique: async ({ where }) => {
        const { teamId, userId } = where.teamId_userId;
        return (
          teamMembers.find(
            (m) => m.teamId === teamId && m.userId === userId,
          ) ?? null
        );
      },
      findMany: async ({ where }) =>
        teamMembers
          .filter((m) => m.teamId === where.teamId)
          .map((m) => ({ userId: m.userId })),
    },
    teamFavorite: {
      findUnique: async ({ where }) => {
        const { userId, teamId } = where.userId_teamId;
        return (
          teamFavorites.find(
            (f) => f.teamId === teamId && f.userId === userId,
          ) ?? null
        );
      },
      findMany: async ({ where }) => {
        const allowedRoles = where?.user?.role?.in;
        return teamFavorites
          .filter((f) => {
            if (f.teamId !== where.teamId) return false;
            if (!allowedRoles) return true;
            const u = userById.get(f.userId);
            return Boolean(u && allowedRoles.includes(u.role));
          })
          .map((f) => ({ userId: f.userId }));
      },
    },
    bountyAssignee: {
      findUnique: async ({ where }) => {
        const { bountyId, userId } = where.bountyId_userId;
        return (
          bountyAssignees.find(
            (a) => a.bountyId === bountyId && a.userId === userId,
          ) ?? null
        );
      },
      findMany: async ({ where }) =>
        bountyAssignees
          .filter((a) => a.bountyId === where.bountyId)
          .map((a) => ({ userId: a.userId })),
    },
    bounty: {
      findFirst: async ({ where }) => {
        const hit = bounties.find(
          (b) =>
            b.id === where.id &&
            matchesWhere(b, where, {
              teamById,
              teamMembers,
              teamFavorites,
              bountyAssignees,
            }),
        );
        return hit ? { id: hit.id } : null;
      },
    },
  };
}

// Evaluates the Prisma `where` subset emitted by bountiesVisibleTo against
// in-memory fixtures so list visibility, single-row checks, and broadcast
// audience can be checked for exact parity.
function matchesWhere(row, clause, state) {
  if (!clause || Object.keys(clause).length === 0) return true;
  for (const [key, value] of Object.entries(clause)) {
    if (key === "OR") {
      if (!value.some((sub) => matchesWhere(row, sub, state))) return false;
      continue;
    }
    if (key === "AND") {
      if (!value.every((sub) => matchesWhere(row, sub, state))) return false;
      continue;
    }
    if (key === "id" || key === "isPrivate" || key === "teamId" || key === "createdBy" || key === "assignee") {
      if (row[key] !== value) return false;
      continue;
    }
    if (key === "assignees") {
      const targetUserId = value?.some?.userId;
      const list = Array.isArray(row.assignees)
        ? row.assignees
        : state.bountyAssignees.filter((a) => a.bountyId === row.id);
      if (!list.some((a) => a.userId === targetUserId)) return false;
      continue;
    }
    if (key === "team") {
      const team = row.team ?? (row.teamId ? state.teamById.get(row.teamId) : null);
      if (!team) return false;
      if (
        typeof value.isPrivate === "boolean" &&
        team.isPrivate !== value.isPrivate
      ) {
        return false;
      }
      if (value.members?.some?.userId) {
        const uid = value.members.some.userId;
        if (
          !state.teamMembers.some(
            (m) => m.teamId === row.teamId && m.userId === uid,
          )
        ) {
          return false;
        }
      }
      if (value.favoritedBy?.some?.userId) {
        const uid = value.favoritedBy.some.userId;
        if (
          !state.teamFavorites.some(
            (f) => f.teamId === row.teamId && f.userId === uid,
          )
        ) {
          return false;
        }
      }
      continue;
    }
    throw new Error(`Unsupported clause key: ${key}`);
  }
  return true;
}

function loadHelpers(db) {
  const dependencies = {
    "../prisma/client": db,
    "./cache": withNoop(),
    "./sendMail": anything,
    "./notifyUser": anything,
    "../middleware/websocket": withNoop(),
  };
  const filename = path.join(__dirname, "../utils/bountyHelpers.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return module.exports;
}

const USERS = [
  { id: "admin-1", role: "ADMIN" },
  { id: "creator-1", role: "HUNTER" },
  { id: "legacy-assignee", role: "HUNTER" },
  { id: "roster-assignee", role: "HUNTER" },
  { id: "member-1", role: "TEAM" },
  { id: "fav-hunter", role: "HUNTER" },
  { id: "fav-team-user", role: "TEAM" },
  { id: "fav-client", role: "CLIENT" },
  { id: "outsider", role: "HUNTER" },
];

const TEAMS = [
  { id: "public-team", isPrivate: false },
  { id: "private-team", isPrivate: true },
];

const TEAM_MEMBERS = [{ teamId: "private-team", userId: "member-1" }];
const TEAM_FAVORITES = [
  { teamId: "private-team", userId: "fav-hunter" },
  { teamId: "private-team", userId: "fav-team-user" },
  { teamId: "private-team", userId: "fav-client" },
];
const BOUNTY_ASSIGNEES = [
  { bountyId: "b-private-solo", userId: "roster-assignee" },
  { bountyId: "b-private-team", userId: "roster-assignee" },
  { bountyId: "b-private-team-flag-false", userId: "roster-assignee" },
];

const BOUNTIES = [
  {
    id: "b-public-solo",
    isPrivate: false,
    createdBy: "creator-1",
    assignee: null,
    teamId: null,
  },
  {
    id: "b-public-team",
    isPrivate: false,
    createdBy: "creator-1",
    assignee: null,
    teamId: "public-team",
  },
  {
    id: "b-private-solo",
    isPrivate: true,
    createdBy: "creator-1",
    assignee: "legacy-assignee",
    teamId: null,
  },
  {
    id: "b-private-team",
    isPrivate: true,
    createdBy: "creator-1",
    assignee: "legacy-assignee",
    teamId: "private-team",
  },
  // Private team whose bounty row has isPrivate: false (partial or legacy row).
  {
    id: "b-private-team-flag-false",
    isPrivate: false,
    createdBy: "creator-1",
    assignee: "legacy-assignee",
    teamId: "private-team",
  },
];

test("bountiesVisibleTo, canViewPrivateBounty, canViewBountyById, and audienceOf agree across every bounty and user role", async () => {
  const state = {
    teamById: new Map(TEAMS.map((t) => [t.id, t])),
    teamMembers: TEAM_MEMBERS,
    teamFavorites: TEAM_FAVORITES,
    bountyAssignees: BOUNTY_ASSIGNEES,
  };
  const db = createFixtureDb({
    users: USERS,
    teams: TEAMS,
    teamMembers: TEAM_MEMBERS,
    teamFavorites: TEAM_FAVORITES,
    bountyAssignees: BOUNTY_ASSIGNEES,
    bounties: BOUNTIES,
  });
  const {
    bountiesVisibleTo,
    canViewPrivateBounty,
    canViewBountyById,
    audienceOf,
    getBroadcastRecipients,
  } = loadHelpers(db);

  assert.equal(getBroadcastRecipients, audienceOf);

  const expectedByBounty = {
    "b-public-solo": "PUBLIC",
    "b-public-team": "PUBLIC",
    "b-private-solo": new Set([
      "admin-1",
      "creator-1",
      "legacy-assignee",
      "roster-assignee",
    ]),
    "b-private-team": new Set([
      "admin-1",
      "creator-1",
      "legacy-assignee",
      "roster-assignee",
      "member-1",
      "fav-hunter",
    ]),
    "b-private-team-flag-false": new Set([
      "admin-1",
      "creator-1",
      "legacy-assignee",
      "roster-assignee",
      "member-1",
      "fav-hunter",
    ]),
  };

  for (const bounty of BOUNTIES) {
    const expected = expectedByBounty[bounty.id];
    const audience = await audienceOf(bounty, db);

    if (expected === "PUBLIC") {
      assert.equal(audience, null, `${bounty.id} should broadcast publicly`);
    } else {
      assert.ok(Array.isArray(audience), `${bounty.id} should be scoped`);
      assert.deepEqual(
        new Set(audience),
        expected,
        `${bounty.id} audience mismatch`,
      );
      assert.ok(!audience.includes(undefined));
    }

    // Anonymous viewer
    const anonWhere = matchesWhere(bounty, bountiesVisibleTo(null), state);
    const anonRow = await canViewPrivateBounty(bounty, null, db);
    const anonById = await canViewBountyById(bounty.id, null, db);
    assert.equal(anonWhere, expected === "PUBLIC");
    assert.equal(anonRow, expected === "PUBLIC");
    assert.equal(anonById, expected === "PUBLIC");

    // Authenticated viewers across all roles
    for (const user of USERS) {
      const shouldSee = expected === "PUBLIC" || expected.has(user.id);
      const viaFilter = matchesWhere(bounty, bountiesVisibleTo(user), state);
      const viaRow = await canViewPrivateBounty(bounty, user, db);
      const viaId = await canViewBountyById(bounty.id, user, db);
      const viaAudience = audience === null || audience.includes(user.id);

      assert.equal(
        viaFilter,
        shouldSee,
        `bountiesVisibleTo mismatch for ${bounty.id} / ${user.id}`,
      );
      assert.equal(
        viaRow,
        shouldSee,
        `canViewPrivateBounty mismatch for ${bounty.id} / ${user.id}`,
      );
      assert.equal(
        viaId,
        shouldSee,
        `canViewBountyById mismatch for ${bounty.id} / ${user.id}`,
      );
      assert.equal(
        viaAudience,
        shouldSee,
        `audienceOf mismatch for ${bounty.id} / ${user.id}`,
      );
    }
  }
});

test("canViewPrivateBounty honors preloaded assignees and team.isPrivate without redundant DB calls", async () => {
  let teamLookupCalls = 0;
  let assigneeLookupCalls = 0;
  const db = {
    team: {
      findUnique: async () => {
        teamLookupCalls += 1;
        return { isPrivate: true };
      },
    },
    bountyAssignee: {
      findUnique: async () => {
        assigneeLookupCalls += 1;
        return null;
      },
    },
    teamMember: { findUnique: async () => null },
    teamFavorite: { findUnique: async () => null },
  };
  const { canViewPrivateBounty } = loadHelpers(db);

  const allowed = await canViewPrivateBounty(
    {
      id: "b1",
      isPrivate: false,
      createdBy: "owner",
      teamId: "t1",
      team: { isPrivate: true },
      assignee: null,
      assignees: [{ userId: "hunter-roster" }],
    },
    { id: "hunter-roster", role: "HUNTER" },
    db,
  );

  assert.equal(allowed, true);
  assert.equal(teamLookupCalls, 0);
  assert.equal(assigneeLookupCalls, 0);
});

test("audienceOf omits undefined createdBy on synthetic team-event calls and excludes non-HUNTER favorites", async () => {
  const db = createFixtureDb({
    users: USERS,
    teams: TEAMS,
    teamMembers: TEAM_MEMBERS,
    teamFavorites: TEAM_FAVORITES,
  });
  const { audienceOf } = loadHelpers(db);

  const recipients = await audienceOf({
    isPrivate: true,
    teamId: "private-team",
  });

  assert.deepEqual(
    new Set(recipients),
    new Set(["admin-1", "member-1", "fav-hunter"]),
  );
  assert.ok(!recipients.includes(undefined));
  assert.ok(!recipients.includes("fav-team-user"));
  assert.ok(!recipients.includes("fav-client"));
});

test("routes/bounties.js uses canonical bountiesVisibleTo on GET / and canViewPrivateBounty on /:id/assignees", async () => {
  for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
    const file = require.resolve(path.join(__dirname, mod));
    require.cache[file] = {
      id: file,
      filename: file,
      loaded: true,
      exports: async () => {},
    };
  }
  const { redisClient } = require("../config/redis");
  for (const method of ["get", "setEx", "del", "incr"]) {
    redisClient[method] = async () => null;
  }

  const prisma = require("../prisma/client");
  const { bountiesVisibleTo } = require("../utils/bountyHelpers");
  const router = require("../routes/bounties");

  function handler(method, routePath) {
    const layer = router.stack.find(
      (l) => l.route?.path === routePath && l.route.methods[method],
    );
    return layer.route.stack.at(-1).handle;
  }

  function mockRes() {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(body) {
        res.body = body;
        return res;
      },
    };
    return res;
  }

  // GET / must pass bountiesVisibleTo(req.user) inside where.AND
  let capturedWhere = null;
  prisma.bounty.findMany = async ({ where }) => {
    capturedWhere = where;
    return [];
  };
  prisma.bounty.count = async () => 0;

  const hunter = { id: "hunter-99", role: "HUNTER" };
  const listRes = mockRes();
  await handler("get", "/")(
    { user: hunter, query: { page: "1", limit: "10", chain: "MAIN" } },
    listRes,
  );
  assert.equal(listRes.statusCode, 200);
  assert.deepEqual(capturedWhere.AND[0], bountiesVisibleTo(hunter));

  // GET /:id/assignees selects assignee and allows the legacy assignee on a private bounty
  let capturedSelect = null;
  prisma.bounty.findUnique = async ({ select }) => {
    capturedSelect = select;
    return {
      id: "b-priv",
      isPrivate: true,
      createdBy: "creator-1",
      assignee: "legacy-assignee",
      teamId: null,
    };
  };
  prisma.bountyAssignee.findUnique = async () => null;
  prisma.bountyAssignee.findMany = async () => [];

  const assigneeRes = mockRes();
  await handler("get", "/:id/assignees")(
    { params: { id: "b-priv" }, user: { id: "legacy-assignee", role: "HUNTER" } },
    assigneeRes,
  );
  assert.equal(capturedSelect?.assignee, true);
  assert.equal(assigneeRes.statusCode, 200);

  const outsiderRes = mockRes();
  await handler("get", "/:id/assignees")(
    { params: { id: "b-priv" }, user: { id: "outsider", role: "HUNTER" } },
    outsiderRes,
  );
  assert.equal(outsiderRes.statusCode, 404);
});
