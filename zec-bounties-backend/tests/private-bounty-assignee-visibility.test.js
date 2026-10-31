const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Stub mailer and push modules before loading routes
for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
  try {
    const file = require.resolve(path.join(__dirname, mod));
    require.cache[file] = {
      id: file,
      filename: file,
      loaded: true,
      exports: async () => {},
    };
  } catch (e) {}
}

// Stub redis module and config/redis before anything loads them
const fakeRedisClient = {
  get: async () => null,
  setEx: async () => null,
  del: async () => null,
  incr: async () => null,
  on: () => {},
  connect: async () => {},
};

try {
  const redisConfigPath = require.resolve("../config/redis");
  require.cache[redisConfigPath] = {
    id: redisConfigPath,
    filename: redisConfigPath,
    loaded: true,
    exports: { redisClient: fakeRedisClient },
  };
} catch (e) {}

// Also stub "redis" module name
require.cache["redis"] = {
  id: "redis",
  filename: "redis",
  loaded: true,
  exports: {
    createClient: () => fakeRedisClient,
  },
};

// Stub prisma client
const prisma = {
  user: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  bounty: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  bountyAssignee: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  teamMember: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  team: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  teamFavorite: {
    findMany: async () => [],
    findUnique: async () => null,
  },
  bountyActivity: {
    create: async () => ({}),
  },
  category: {
    findUnique: async () => null,
    findMany: async () => [],
  },
  $transaction: async (fn) => (typeof fn === "function" ? fn(prisma) : fn),
};

try {
  const prismaClientPath = require.resolve("../prisma/client");
  require.cache[prismaClientPath] = {
    id: prismaClientPath,
    filename: prismaClientPath,
    loaded: true,
    exports: prisma,
  };
} catch (e) {}

require.cache["@prisma/client"] = {
  id: "@prisma/client",
  filename: "@prisma/client",
  loaded: true,
  exports: {
    PrismaClient: class {
      constructor() {
        return prisma;
      }
    },
  },
};
const { getBroadcastRecipients } = require("../utils/bountyHelpers");

// Helper to extract route handler
const bountiesRouter = require("../routes/bounties");
function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route?.path === routePath && l.route.methods[method],
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}

test("getBroadcastRecipients includes outside assignees for private team bounty", async () => {
  const origFindMany = prisma.user.findMany;
  const origAssigneeFindMany = prisma.bountyAssignee?.findMany;
  const origTeamMemberFindMany = prisma.teamMember.findMany;
  const origTeamFavoriteFindMany = prisma.teamFavorite.findMany;

  try {
    prisma.user.findMany = async () => [{ id: "admin-1" }];
    if (!prisma.bountyAssignee) prisma.bountyAssignee = {};
    prisma.bountyAssignee.findMany = async () => [{ userId: "hunter-assignee-1" }];
    prisma.teamMember.findMany = async () => [{ userId: "team-member-1" }];
    prisma.teamFavorite.findMany = async () => [];

    const bounty = {
      id: "bounty-private-1",
      isPrivate: true,
      createdBy: "creator-1",
      teamId: "team-1",
      assignee: "legacy-assignee-2",
    };

    const recipients = await getBroadcastRecipients(bounty);

    assert.ok(Array.isArray(recipients));
    assert.ok(recipients.includes("creator-1"), "creator should be included");
    assert.ok(recipients.includes("admin-1"), "admin should be included");
    assert.ok(recipients.includes("team-member-1"), "team member should be included");
    assert.ok(recipients.includes("hunter-assignee-1"), "bountyAssignee should be included");
    assert.ok(recipients.includes("legacy-assignee-2"), "legacy assignee should be included");
    assert.ok(!recipients.includes("unrelated-user"), "unrelated user should not be included");
  } finally {
    prisma.user.findMany = origFindMany;
    if (origAssigneeFindMany) prisma.bountyAssignee.findMany = origAssigneeFindMany;
    prisma.teamMember.findMany = origTeamMemberFindMany;
    prisma.teamFavorite.findMany = origTeamFavoriteFindMany;
  }
});

test("GET /:id allows outside assignee to view private team bounty, returns 404 for unrelated user", async () => {
  const getBountyHandler = getRouteHandler(bountiesRouter, "get", "/:id");

  const origFindUnique = prisma.bounty.findUnique;
  const origTeamMemberFindUnique = prisma.teamMember.findUnique;
  const origTeamFavoriteFindUnique = prisma.teamFavorite.findUnique;
  const origBountyAssigneeFindUnique = prisma.bountyAssignee?.findUnique;

  const mockPrivateBounty = {
    id: "bounty-123",
    title: "Private Secret Project",
    isPrivate: true,
    teamId: "team-private",
    createdBy: "team-admin",
    assignee: null,
    assignees: [{ userId: "outside-hunter", user: { id: "outside-hunter", name: "Hunter" } }],
    createdByUser: { id: "team-admin", name: "Team Admin" },
    team: { id: "team-private", name: "Private Team", isPrivate: true },
  };

  try {
    prisma.bounty.findUnique = async () => mockPrivateBounty;
    prisma.teamMember.findUnique = async () => null; // Not a team member
    prisma.teamFavorite.findUnique = async () => null; // Has not favorited
    if (!prisma.bountyAssignee) prisma.bountyAssignee = {};
    prisma.bountyAssignee.findUnique = async ({ where }) => {
      if (where.bountyId_userId?.userId === "outside-hunter") {
        return { userId: "outside-hunter" };
      }
      return null;
    };

    // 1. Outside assignee requests the private bounty -> 200 OK
    const reqAssignee = {
      params: { id: "bounty-123" },
      user: { id: "outside-hunter", role: "HUNTER" },
    };
    const resAssignee = mockRes();
    await getBountyHandler(reqAssignee, resAssignee);

    assert.equal(resAssignee.statusCode, 200);
    assert.equal(resAssignee.body.id, "bounty-123");

    // 2. Unrelated hunter requests the private bounty -> 404
    const reqUnrelated = {
      params: { id: "bounty-123" },
      user: { id: "unrelated-hunter", role: "HUNTER" },
    };
    const resUnrelated = mockRes();
    await getBountyHandler(reqUnrelated, resUnrelated);

    assert.equal(resUnrelated.statusCode, 404);
    assert.deepEqual(resUnrelated.body, { error: "Bounty not found" });
  } finally {
    prisma.bounty.findUnique = origFindUnique;
    prisma.teamMember.findUnique = origTeamMemberFindUnique;
    prisma.teamFavorite.findUnique = origTeamFavoriteFindUnique;
    if (origBountyAssigneeFindUnique) prisma.bountyAssignee.findUnique = origBountyAssigneeFindUnique;
  }
});

test("GET /:id/assignees allows outside assignee to view assignees, returns 404 for unrelated user", async () => {
  const getAssigneesHandler = getRouteHandler(bountiesRouter, "get", "/:id/assignees");

  const origFindUnique = prisma.bounty.findUnique;
  const origFindMany = prisma.bountyAssignee?.findMany;
  const origTeamMemberFindUnique = prisma.teamMember.findUnique;
  const origTeamFavoriteFindUnique = prisma.teamFavorite.findUnique;
  const origBountyAssigneeFindUnique = prisma.bountyAssignee?.findUnique;

  const mockPrivateBounty = {
    id: "bounty-123",
    isPrivate: true,
    teamId: "team-private",
    createdBy: "team-admin",
    assignee: "legacy-hunter",
  };

  try {
    prisma.bounty.findUnique = async () => mockPrivateBounty;
    if (!prisma.bountyAssignee) prisma.bountyAssignee = {};
    prisma.bountyAssignee.findMany = async () => [
      { userId: "legacy-hunter", user: { id: "legacy-hunter", name: "Hunter" } },
    ];
    prisma.teamMember.findUnique = async () => null;
    prisma.teamFavorite.findUnique = async () => null;
    prisma.bountyAssignee.findUnique = async () => null;

    // 1. Outside assignee requests assignees list -> 200 OK
    const reqAssignee = {
      params: { id: "bounty-123" },
      user: { id: "legacy-hunter", role: "HUNTER" },
    };
    const resAssignee = mockRes();
    await getAssigneesHandler(reqAssignee, resAssignee);

    assert.equal(resAssignee.statusCode, 200);

    // 2. Unrelated user requests assignees list -> 404
    const reqUnrelated = {
      params: { id: "bounty-123" },
      user: { id: "unrelated-user", role: "HUNTER" },
    };
    const resUnrelated = mockRes();
    await getAssigneesHandler(reqUnrelated, resUnrelated);

    assert.equal(resUnrelated.statusCode, 404);
  } finally {
    prisma.bounty.findUnique = origFindUnique;
    if (origFindMany) prisma.bountyAssignee.findMany = origFindMany;
    prisma.teamMember.findUnique = origTeamMemberFindUnique;
    prisma.teamFavorite.findUnique = origTeamFavoriteFindUnique;
    if (origBountyAssigneeFindUnique) prisma.bountyAssignee.findUnique = origBountyAssigneeFindUnique;
  }
});

test("GET / includes assignee visibility filter for authenticated hunter", async () => {
  const getBountiesHandler = getRouteHandler(bountiesRouter, "get", "/");

  let capturedWhere = null;
  const origFindMany = prisma.bounty.findMany;
  const origCount = prisma.bounty.count;

  try {
    prisma.bounty.findMany = async ({ where }) => {
      capturedWhere = where;
      return [];
    };
    prisma.bounty.count = async () => 0;

    const req = {
      query: { page: "1", limit: "10" },
      user: { id: "hunter-42", role: "HUNTER" },
    };
    const res = mockRes();
    await getBountiesHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(capturedWhere);
    // Find visibilityFilter in AND array
    const visibilityFilter = capturedWhere.AND[0];
    assert.ok(visibilityFilter && Array.isArray(visibilityFilter.OR));

    // Verify there is an entry allowing bounties assigned to hunter-42
    const assigneeBranch = visibilityFilter.OR.find(
      (entry) =>
        entry.isPrivate === true &&
        entry.OR &&
        entry.OR.some((cond) => cond.assignee === "hunter-42") &&
        entry.OR.some(
          (cond) =>
            cond.assignees && cond.assignees.some && cond.assignees.some.userId === "hunter-42",
        ),
    );
    assert.ok(assigneeBranch, "assignee filter branch must be present in visibilityFilter.OR");
  } finally {
    prisma.bounty.findMany = origFindMany;
    prisma.bounty.count = origCount;
  }
});

test("PUT /:id moving an assigned bounty into a private team includes assignee in broadcast and maintains access", async () => {
  const putBountyHandler = getRouteHandler(bountiesRouter, "put", "/:id");

  const origFindUniqueBounty = prisma.bounty.findUnique;
  const origUpdateBounty = prisma.bounty.update;
  const origFindUniqueTeam = prisma.team.findUnique;
  const origUserFindMany = prisma.user.findMany;
  const origAssigneeFindMany = prisma.bountyAssignee?.findMany;
  const origTeamMemberFindMany = prisma.teamMember.findMany;
  const origTeamFavoriteFindMany = prisma.teamFavorite.findMany;

  const mockExistingBounty = {
    id: "bounty-move-1",
    title: "Open Task",
    description: "Task description",
    bountyAmount: 50,
    timeToComplete: new Date(Date.now() + 86400000),
    chain: "MAIN",
    status: "IN_PROGRESS",
    isApproved: true,
    isPaid: false,
    paymentAuthorized: false,
    paymentInFlight: false,
    dateCreated: new Date(),
    createdBy: "creator-admin",
    teamId: null,
    assignee: "outside-worker",
  };

  const mockPrivateTeam = {
    id: "private-team-99",
    name: "Confidential Project Team",
    isPrivate: true,
    isVerified: true,
  };

  let updatedRecord = null;

  try {
    prisma.bounty.findUnique = async ({ where }) => {
      if (where.id === "bounty-move-1") return mockExistingBounty;
      return null;
    };
    prisma.team.findUnique = async ({ where }) => {
      if (where.id === "private-team-99") return mockPrivateTeam;
      return null;
    };
    prisma.bounty.update = async ({ where, data, include }) => {
      updatedRecord = {
        ...mockExistingBounty,
        ...data,
        isPrivate: data.isPrivate,
        teamId: data.teamId,
      };
      return updatedRecord;
    };

    prisma.user.findMany = async () => [{ id: "admin-1" }];
    if (!prisma.bountyAssignee) prisma.bountyAssignee = {};
    prisma.bountyAssignee.findMany = async () => [];
    prisma.teamMember.findMany = async () => [{ userId: "team-member-1" }];
    prisma.teamFavorite.findMany = async () => [];

    const req = {
      params: { id: "bounty-move-1" },
      user: { id: "admin-1", role: "ADMIN" },
      body: {
        teamId: "private-team-99",
      },
    };
    const res = mockRes();
    await putBountyHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updatedRecord.teamId, "private-team-99");
    assert.equal(updatedRecord.isPrivate, true);

    // Verify broadcast recipients includes the outside assignee
    const recipients = await getBroadcastRecipients(updatedRecord);
    assert.ok(recipients.includes("outside-worker"), "outside assignee must be in broadcast recipients");
    assert.ok(recipients.includes("admin-1"), "admin must be in broadcast recipients");
    assert.ok(recipients.includes("team-member-1"), "team member must be in broadcast recipients");
    assert.ok(!recipients.includes("random-stranger"), "stranger must not be in broadcast recipients");
  } finally {
    prisma.bounty.findUnique = origFindUniqueBounty;
    prisma.bounty.update = origUpdateBounty;
    prisma.team.findUnique = origFindUniqueTeam;
    prisma.user.findMany = origUserFindMany;
    if (origAssigneeFindMany) prisma.bountyAssignee.findMany = origAssigneeFindMany;
    prisma.teamMember.findMany = origTeamMemberFindMany;
    prisma.teamFavorite.findMany = origTeamFavoriteFindMany;
  }
});
