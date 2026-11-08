const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createFixture() {
  const routes = new Map();
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete"].map((method) => [
      method,
      (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1)),
    ]),
  );

  const teamMembers = new Map([
    ["team_1:owner_user", { role: "OWNER" }],
    ["team_1:admin_user", { role: "ADMIN" }],
    ["team_1:member_user", { role: "MEMBER" }],
  ]);

  const bounty = {
    id: "bounty_1",
    title: "Team Bounty",
    createdBy: "creator_user",
    assignee: "assignee_user",
    teamId: "team_1",
    status: "IN_PROGRESS",
    isApproved: true,
  };

  const prisma = {
    bounty: {
      findUnique: async ({ where, select }) => {
        if (where.id !== bounty.id) return null;
        if (!select) return { ...bounty };
        return Object.fromEntries(
          Object.entries(bounty).filter(([key]) => select[key]),
        );
      },
    },
    teamMember: {
      findUnique: async ({ where }) => {
        const key = `${where.teamId_userId.teamId}:${where.teamId_userId.userId}`;
        return teamMembers.get(key) || null;
      },
    },
    bountyAssignee: {
      findUnique: async ({ where }) => {
        if (where.bountyId_userId.userId === bounty.assignee) {
          return { userId: bounty.assignee };
        }
        return null;
      },
    },
    workSubmission: {
      findMany: async () => [
        { id: "sub_1", bountyId: bounty.id, submittedBy: "assignee_user" },
      ],
    },
    bountyApplication: {
      findMany: async () => [
        { id: "app_1", bountyId: bounty.id, applicantId: "applicant_user" },
      ],
    },
    bountyActivity: {
      findMany: async () => [
        { id: "act_1", bountyId: bounty.id, type: "CREATED" },
      ],
    },
  };

  const noop = () => {};
  const modules = {
    express: { Router: () => router },
    "../prisma/client": prisma,
    "../helpers/email": {},
    "../middleware/auth": {
      authenticate: noop,
      isAdmin: noop,
      optionalAuthenticate: noop,
    },
    "../middleware/websocket": { sendRealtimeUpdate: noop, sendToUser: noop },
    "../utils/suggestionSettings": { getSuggestionSettings: async () => ({}) },
    "../utils/cache": {
      getCache: async () => null,
      setCache: async () => {},
      delCache: async () => {},
      deleteCacheByPattern: async () => {},
      getVersion: async () => 1,
      bumpVersion: async () => {},
      TTL: { APPLICATIONS: 60 },
    },
    "../utils/sendMail": noop,
    "../utils/notifyUser": noop,
    "../utils/discord/discordNotify": {},
    "../utils/discord/discordAssignWebhook": {
      notifyAssignment: async () => {},
      notifyBountyAssignees: async () => {},
      notifyBountyState: async () => {},
    },
    "../utils/constants": {},
    "../utils/exportableBounty": require("../utils/exportableBounty"),
    "../helpers/validateBounty": {},
    "../utils/bountySuggestionReview": require("../utils/bountySuggestionReview"),
    "../utils/userSelects": require("../utils/userSelects"),
    "../utils/bountyHelpers": {
      broadcastBountyEvent: async () => {},
      invalidateBounty: async () => {},
    },
    "../utils/userIdentity": {},
    "../utils/bountyActivity": {
      logActivity: async () => {},
      publishActivity: async () => {},
    },
    "../utils/privacy": { redactPublicUser: (u) => u },
  };

  const source = fs.readFileSync(
    require.resolve("../routes/bounties.js"),
    "utf8",
  );
  const context = {
    module: { exports: {} },
    require: (specifier) => modules[specifier] || require(specifier),
    console,
    Buffer,
    process,
    setTimeout,
    clearTimeout,
    Date,
    Set,
    Map,
    Promise,
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  return routes;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("GET /:id/submissions authorizes team OWNER, ADMIN, creator, and blocks unauthorized users", async () => {
  const routes = createFixture();
  const handler = routes.get("get /:id/submissions");
  assert.ok(handler, "GET /:id/submissions handler must exist");

  // 1. Team OWNER who did not create the bounty
  {
    const req = { params: { id: "bounty_1" }, user: { id: "owner_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 2. Team ADMIN who did not create the bounty
  {
    const req = { params: { id: "bounty_1" }, user: { id: "admin_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 3. Creator of the bounty
  {
    const req = { params: { id: "bounty_1" }, user: { id: "creator_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
  }

  // 4. Plain team MEMBER (not creator and not assignee) -> 403
  {
    const req = { params: { id: "bounty_1" }, user: { id: "member_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }

  // 5. Outsider (non-team member) -> 403
  {
    const req = { params: { id: "bounty_1" }, user: { id: "outsider", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }
});

test("GET /:bountyId/applications authorizes team OWNER, ADMIN, creator, and blocks unauthorized users", async () => {
  const routes = createFixture();
  const handler = routes.get("get /:bountyId/applications");
  assert.ok(handler, "GET /:bountyId/applications handler must exist");

  // 1. Team OWNER
  {
    const req = { params: { bountyId: "bounty_1" }, user: { id: "owner_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 2. Team ADMIN
  {
    const req = { params: { bountyId: "bounty_1" }, user: { id: "admin_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 3. Plain team MEMBER -> 403
  {
    const req = { params: { bountyId: "bounty_1" }, user: { id: "member_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }
});

test("GET /:id/activity authorizes team OWNER, ADMIN, creator, and blocks unauthorized users", async () => {
  const routes = createFixture();
  const handler = routes.get("get /:id/activity");
  assert.ok(handler, "GET /:id/activity handler must exist");

  // 1. Team OWNER
  {
    const req = { params: { id: "bounty_1" }, user: { id: "owner_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 2. Team ADMIN
  {
    const req = { params: { id: "bounty_1" }, user: { id: "admin_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  }

  // 3. Bounty creator
  {
    const req = { params: { id: "bounty_1" }, user: { id: "creator_user", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
  }

  // 4. Outsider -> 403
  {
    const req = { params: { id: "bounty_1" }, user: { id: "outsider", role: "HUNTER" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }
});
