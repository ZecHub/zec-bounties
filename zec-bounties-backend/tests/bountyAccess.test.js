const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Stub outbound mailer/push modules at load time (same pattern as websocket.test.js).
for (const mod of ["../utils/sendMail", "../utils/notifyUser", "../prisma/client"]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: mod.endsWith("client") ? {} : async () => {},
  };
}

const {
  bountiesVisibleTo,
  canViewBountyById,
  canViewPrivateBounty,
  audienceOf,
  getBroadcastRecipients,
} = require("../utils/bountyHelpers");

function matchesWhere(where, bounty) {
  if (!where || Object.keys(where).length === 0) return true;

  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return value.some((branch) => matchesWhere(branch, bounty));
    }
    if (key === "AND") {
      return value.every((branch) => matchesWhere(branch, bounty));
    }
    if (key === "team") {
      if (!bounty.team) return false;
      return Object.entries(value).every(([tKey, tVal]) => {
        if (tKey === "isPrivate") return bounty.team.isPrivate === tVal;
        if (tKey === "members") {
          return (bounty.team.memberIds || []).includes(tVal.some.userId);
        }
        if (tKey === "favoritedBy") {
          return (bounty.team.favoritedUserIds || []).includes(tVal.some.userId);
        }
        return false;
      });
    }
    return bounty[key] === value;
  });
}

function makeFakeDb({ bounties = [], users = [], teams = {}, members = {}, favorites = {} }) {
  return {
    bounty: {
      findFirst: async ({ where }) => {
        const hit = bounties.find((b) => matchesWhere(where, b));
        return hit ? { id: hit.id } : null;
      },
    },
    team: {
      findUnique: async ({ where }) => teams[where.id] || null,
    },
    user: {
      findMany: async ({ where }) =>
        users
          .filter((u) => !where?.role || u.role === where.role)
          .map((u) => ({ id: u.id })),
    },
    teamMember: {
      findUnique: async ({ where }) => {
        const { teamId, userId } = where.teamId_userId;
        return (members[teamId] || []).includes(userId)
          ? { teamId, userId }
          : null;
      },
      findMany: async ({ where }) =>
        (members[where.teamId] || []).map((userId) => ({ userId })),
    },
    teamFavorite: {
      findUnique: async ({ where }) => {
        const { userId, teamId } = where.userId_teamId;
        return (favorites[teamId] || []).includes(userId)
          ? { userId, teamId }
          : null;
      },
      findMany: async ({ where }) => {
        const allowedRoles = where?.user?.role?.in;
        const userRoleMap = new Map(users.map((u) => [u.id, u.role]));
        return (favorites[where.teamId] || [])
          .filter(
            (userId) =>
              !allowedRoles || allowedRoles.includes(userRoleMap.get(userId)),
          )
          .map((userId) => ({ userId }));
      },
    },
  };
}

const USERS = [
  { id: "admin-1", role: "ADMIN" },
  { id: "creator-1", role: "HUNTER" },
  { id: "member-1", role: "TEAM" },
  { id: "hunter-fan", role: "HUNTER" },
  { id: "team-fan", role: "TEAM" },
  { id: "outsider-hunter", role: "HUNTER" },
];

const BOUNTIES = [
  {
    id: "public-solo",
    isPrivate: false,
    createdBy: "creator-1",
    teamId: null,
    team: null,
  },
  {
    id: "private-solo",
    isPrivate: true,
    createdBy: "creator-1",
    teamId: null,
    team: null,
  },
  {
    id: "public-team-bounty",
    isPrivate: false,
    createdBy: "creator-1",
    teamId: "pub-team",
    team: {
      isPrivate: false,
      memberIds: ["member-1"],
      favoritedUserIds: ["hunter-fan", "team-fan"],
    },
  },
  {
    id: "private-team-bounty",
    isPrivate: false,
    createdBy: "creator-1",
    teamId: "priv-team",
    team: {
      isPrivate: true,
      memberIds: ["member-1"],
      favoritedUserIds: ["hunter-fan", "team-fan"],
    },
  },
  {
    id: "private-bounty-on-public-team",
    isPrivate: true,
    createdBy: "creator-1",
    teamId: "pub-team",
    team: {
      isPrivate: false,
      memberIds: ["member-1"],
      favoritedUserIds: ["hunter-fan", "team-fan"],
    },
  },
];

const DB = makeFakeDb({
  bounties: BOUNTIES,
  users: USERS,
  teams: {
    "pub-team": { id: "pub-team", isPrivate: false },
    "priv-team": { id: "priv-team", isPrivate: true },
  },
  members: {
    "pub-team": ["member-1"],
    "priv-team": ["member-1"],
  },
  favorites: {
    "pub-team": ["hunter-fan", "team-fan"],
    "priv-team": ["hunter-fan", "team-fan"],
  },
});

test("bountiesVisibleTo, canViewPrivateBounty, and canViewBountyById agree across all viewers and bounties", async () => {
  const viewers = [null, ...USERS];

  for (const bounty of BOUNTIES) {
    for (const viewer of viewers) {
      const fromWhere = matchesWhere(bountiesVisibleTo(viewer), bounty);
      const fromRowCheck = await canViewPrivateBounty(bounty, viewer, DB);
      const fromIdQuery = await canViewBountyById(bounty.id, viewer, DB);

      const label = `bounty=${bounty.id}, viewer=${viewer ? `${viewer.id}(${viewer.role})` : "anonymous"}`;
      assert.equal(fromRowCheck, fromWhere, `canViewPrivateBounty mismatch for ${label}`);
      assert.equal(fromIdQuery, fromWhere, `canViewBountyById mismatch for ${label}`);
    }
  }
});

test("enforces private-team visibility even when bounty.team is omitted from a partial select", async () => {
  const partialPrivTeamRow = {
    id: "private-team-bounty",
    isPrivate: false,
    createdBy: "creator-1",
    teamId: "priv-team",
  };
  const outsider = USERS.find((u) => u.id === "outsider-hunter");
  const member = USERS.find((u) => u.id === "member-1");

  assert.equal(await canViewPrivateBounty(partialPrivTeamRow, outsider, DB), false);
  assert.equal(await canViewPrivateBounty(partialPrivTeamRow, member, DB), true);
  assert.equal(await audienceOf(partialPrivTeamRow, DB) !== null, true);
});

test("audienceOf returns null for public bounties and matches authorized viewers for private bounties", async () => {
  assert.equal(audienceOf, getBroadcastRecipients);

  for (const bounty of BOUNTIES) {
    const audience = await audienceOf(bounty, DB);
    const isPublic = !bounty.isPrivate && !bounty.team?.isPrivate;

    if (isPublic) {
      assert.equal(audience, null, `${bounty.id} should broadcast to everyone`);
      continue;
    }

    const expectedIds = [];
    for (const user of USERS) {
      if (await canViewPrivateBounty(bounty, user, DB)) {
        expectedIds.push(user.id);
      }
    }

    assert.deepEqual(
      new Set(audience),
      new Set(expectedIds),
      `audienceOf(${bounty.id}) must match the exact set of authorized viewers`,
    );
  }
});

test("only HUNTER role gains private bounty access via team favorites", async () => {
  const privTeamBounty = BOUNTIES.find((b) => b.id === "private-team-bounty");
  const hunterFan = USERS.find((u) => u.id === "hunter-fan");
  const teamFan = USERS.find((u) => u.id === "team-fan");

  assert.equal(await canViewPrivateBounty(privTeamBounty, hunterFan, DB), true);
  assert.equal(await canViewPrivateBounty(privTeamBounty, teamFan, DB), false);

  const audience = await audienceOf(privTeamBounty, DB);
  assert.equal(audience.includes("hunter-fan"), true);
  assert.equal(audience.includes("team-fan"), false);
});

test("routes/bounties.js wires bountiesVisibleTo and canViewPrivateBounty from utils/bountyHelpers", async () => {
  const capturedWheres = [];
  const handlers = {};
  const router = Object.fromEntries(
    ["get", "post", "put", "delete", "patch"].map((m) => [
      m,
      (routePath, ...cbs) => {
        if (m === "get" && (routePath === "/" || routePath === "/:id")) {
          handlers[routePath] = cbs.at(-1);
        }
      },
    ]),
  );

  const prismaStub = {
    ...DB,
    bounty: {
      ...DB.bounty,
      count: async ({ where }) => {
        capturedWheres.push(where);
        return 0;
      },
      findMany: async () => [],
      findUnique: async ({ where }) =>
        where.id === "private-solo"
          ? { id: "private-solo", isPrivate: true, createdBy: "creator-1", teamId: null }
          : null,
    },
  };

  const helpersFile = path.join(__dirname, "../utils/bountyHelpers.js");
  const helpersExports = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(helpersFile, "utf8"),
    {
      module: helpersExports,
      exports: helpersExports.exports,
      require(name) {
        if (name === "../prisma/client") return prismaStub;
        if (name === "./cache") return { delCache: async () => {}, bumpVersion: async () => {} };
        if (name === "./sendMail" || name === "./notifyUser") return async () => {};
        if (name === "../middleware/websocket") return { sendRealtimeUpdate() {} };
        throw new Error(`Unexpected helper require: ${name}`);
      },
      process: { env: { NODE_ENV: "test" } },
      console,
    },
    { filename: helpersFile },
  );

  const noop = () => {};
  const routesFile = path.join(__dirname, "../routes/bounties.js");
  vm.runInNewContext(
    fs.readFileSync(routesFile, "utf8"),
    {
      module: { exports: {} },
      exports: {},
      require(name) {
        if (name === "express") return { Router: () => router };
        if (name === "../prisma/client") return prismaStub;
        if (name === "../utils/bountyHelpers") return helpersExports.exports;
        if (name === "../utils/userSelects") return require("../utils/userSelects");
        if (name === "../utils/userIdentity") return require("../utils/userIdentity");
        if (name === "../utils/privacy") return require("../utils/privacy");
        if (name === "../utils/exportableBounty") return require("../utils/exportableBounty");
        if (name === "../utils/cache") {
          return {
            getCache: async () => null,
            setCache: async () => {},
            delCache: async () => {},
            deleteCacheByPattern: async () => {},
            getVersion: async () => 1,
            bumpVersion: async () => {},
            invalidateUserDirectory: async () => {},
            TTL: {
              BOUNTY_LIST: 300,
              BOUNTY_SINGLE: 120,
              CATEGORIES: 300,
              USERS: 120,
              ASSIGNEES: 60,
              APPLICATIONS: 30,
              SUBMISSIONS: 300,
              BALANCE: 15,
              ADDRESSES: 120,
            },
          };
        }
        return new Proxy({}, { get: () => noop });
      },
      process: { env: { NODE_ENV: "test" } },
      console,
      setTimeout: noop,
    },
    { filename: routesFile },
  );

  let listPayload = null;
  await handlers["/"](
    { query: {}, user: { id: "hunter-fan", role: "HUNTER" } },
    { status: () => ({ json: noop }), json: (p) => (listPayload = p) },
  );
  assert.ok(listPayload);
  assert.equal(capturedWheres.length, 1);

  let detailStatus = 200;
  await handlers["/:id"](
    { params: { id: "private-solo" }, user: { id: "outsider-hunter", role: "HUNTER" } },
    {
      status(code) {
        detailStatus = code;
        return { json: noop };
      },
      json: noop,
    },
  );
  assert.equal(detailStatus, 404);
});
