// Route-level checks that a favourite does not grant access to a private team.
// team-board-access.test.js unit-tests the canAccessTeamBoard decision; these
// exercise the real route handlers (POST /:teamId/favorite and
// GET /:teamId/bounties) so the gate is proven end to end.
//
// teams.js is loaded in an isolated VM context with its dependencies injected,
// so this suite never mutates the shared require cache and cannot disturb other
// suites. The many wallet/zingo/ipfs modules teams.js pulls in but these two
// routes never touch are served by a catch-all proxy.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const teamBoardAccess = require("../helpers/teamBoardAccess");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function loadTeamRoutes(prisma) {
  const routes = {};
  const dependencies = {
    express: {
      Router: () =>
        new Proxy(
          {},
          {
            get: (_, method) => (url, ...handlers) => {
              routes[`${method} ${url}`] = handlers.at(-1);
            },
          },
        ),
    },
    "@prisma/client": { PrismaClient: function () { return prisma; } },
    "../prisma/client": prisma,
    "../middleware/auth": {
      authenticate: (req, res, next) => next(),
      optionalAuthenticate: (req, res, next) => next(),
      isAdmin: (req, res, next) => next(),
    },
    "../middleware/websocket": {
      sendRealtimeUpdate() {},
      sendToUser() {},
    },
    "../helpers/teamBoardAccess": teamBoardAccess,
    "../utils/cache": {
      getCache: async () => null,
      setCache: async () => {},
      delCache: async () => {},
      deleteCacheByPattern: async () => {},
      getVersion: async () => 0,
      bumpVersion: async () => {},
      TTL: {},
    },
    "../utils/userSelects": {
      bountyUserSelects: () => ({ user: {}, createdByUser: {} }),
      bountyUserSelect: {},
      USER_SELECT_EXPORT: {},
    },
    "../utils/privacy": { redactPublicUser: (u) => u },
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
      process: { env: { NODE_ENV: "test" } },
      Buffer,
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
    { filename },
  );
  return routes;
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function call(routes, key, req) {
  const res = mockRes();
  await routes[key]({ params: {}, query: {}, body: {}, ...req }, res);
  return res;
}

const PRIVATE_TEAM = { id: "t1", isPrivate: true };

// A fake Prisma tailored per scenario. `member` is the teamMember row (null for
// a non-member, even one who has favourited the team); `board` is what the
// bounty query returns once access is granted.
function fakePrisma({ team = PRIVATE_TEAM, member = null, board = [] } = {}) {
  return {
    team: { findUnique: async () => team },
    teamMember: { findUnique: async () => member },
    teamFavorite: { upsert: async () => ({}) },
    bounty: {
      findMany: async () => board,
      count: async () => board.length,
    },
  };
}

test("POST /:teamId/favorite: a non-member cannot favourite a private team", async () => {
  const routes = loadTeamRoutes(fakePrisma({ member: null }));
  const res = await call(routes, "post /:teamId/favorite", {
    params: { teamId: "t1" },
    user: { id: "hunter", role: "HUNTER" },
  });
  assert.equal(res.statusCode, 403);
});

test("GET /:teamId/bounties: a favouriter (non-member) gets an empty private board", async () => {
  // A favourite is not membership: the teamMember lookup returns null, so the
  // board must come back empty even though a bounty exists.
  const routes = loadTeamRoutes(
    fakePrisma({ member: null, board: [{ id: "b1" }] }),
  );
  const res = await call(routes, "get /:teamId/bounties", {
    params: { teamId: "t1" },
    user: { id: "favouriter", role: "HUNTER" },
  });
  assert.equal(res.statusCode, 200);
  // data is built inside the VM realm, so compare length rather than using
  // deepStrictEqual (which rejects the cross-realm array prototype).
  assert.equal(res.body.data.length, 0);
  assert.equal(res.body.total, 0);
});

test("GET /:teamId/bounties: a member sees the private board", async () => {
  const routes = loadTeamRoutes(
    fakePrisma({ member: { role: "MEMBER" }, board: [{ id: "b1" }] }),
  );
  const res = await call(routes, "get /:teamId/bounties", {
    params: { teamId: "t1" },
    user: { id: "member", role: "HUNTER" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
});

test("GET /:teamId/bounties: a global admin sees the private board", async () => {
  const routes = loadTeamRoutes(
    fakePrisma({ member: null, board: [{ id: "b1" }] }),
  );
  const res = await call(routes, "get /:teamId/bounties", {
    params: { teamId: "t1" },
    user: { id: "admin", role: "ADMIN" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
});
