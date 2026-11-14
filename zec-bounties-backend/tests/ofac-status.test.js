// The admin Export Completed modal and the Export Payments page have an OFAC
// switch per recipient. It calls PATCH /auth/users/:id/ofac
// (updateUserOfac in lib/bounty-context.tsx), and the result is written to
// the CSV's "OFAC Status" column. The route must exist, be admin-only, and
// store the boolean.
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

function loadFile(rel, dependencies) {
  const filename = path.join(__dirname, "..", rel);
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

function loadAuthRoutes() {
  const users = {
    admin: { id: "admin", role: "ADMIN", ofacVerified: false },
    hunter: { id: "hunter", role: "HUNTER", ofacVerified: false },
  };
  const db = {
    users,
    user: {
      findUnique: async ({ where }) =>
        users[where.id] ? { ...users[where.id] } : null,
      update: async ({ where, data }) => {
        if (!users[where.id]) {
          throw Object.assign(new Error("not found"), { code: "P2025" });
        }
        Object.assign(users[where.id], data);
        return { id: where.id, ofacVerified: users[where.id].ofacVerified };
      },
    },
  };
  // Real middleware: the token decodes to the user id it carries.
  const middleware = loadFile("middleware/auth.js", {
    jsonwebtoken: { verify: (token) => ({ id: token }), sign: () => "t" },
    "../prisma/client": db,
  });
  const routes = {};
  const router = new Proxy(
    {},
    {
      get: (_, method) => (url, ...handlers) => {
        routes[`${method} ${url}`] = handlers;
      },
    },
  );
  loadFile("routes/auth.js", {
    express: { Router: () => router },
    "../prisma/client": db,
    "../middleware/auth": middleware,
  });

  return {
    db,
    routes,
    async call(route, { token, params = {}, body = {} } = {}) {
      const handlers = routes[route];
      if (!handlers) return { status: 404, body: null };
      const req = {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        params,
        body,
      };
      const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(b) {
          this.body = b;
          return this;
        },
        send(b) {
          this.body = b;
          return this;
        },
      };
      for (const handler of handlers) {
        let nextCalled = false;
        await handler(req, res, () => (nextCalled = true));
        if (!nextCalled) break;
      }
      return { status: res.statusCode, body: res.body };
    },
  };
}

const ROUTE = "patch /users/:userId/ofac";

test("the OFAC switch's endpoint exists on the auth router", () => {
  const { routes } = loadAuthRoutes();
  assert.ok(
    routes[ROUTE],
    "PATCH /auth/users/:userId/ofac is called by the export pages but is not defined",
  );
});

test("an admin can mark a recipient OFAC verified, and clear it again", async () => {
  const app = loadAuthRoutes();
  let res = await app.call(ROUTE, {
    token: "admin",
    params: { userId: "hunter" },
    body: { ofacVerified: true },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: "hunter", ofacVerified: true });
  assert.equal(app.db.users.hunter.ofacVerified, true);

  res = await app.call(ROUTE, {
    token: "admin",
    params: { userId: "hunter" },
    body: { ofacVerified: false },
  });
  assert.equal(res.status, 200);
  assert.equal(app.db.users.hunter.ofacVerified, false);
});

test("a non-admin cannot set anyone's OFAC status, including their own", async () => {
  const app = loadAuthRoutes();
  const res = await app.call(ROUTE, {
    token: "hunter",
    params: { userId: "hunter" },
    body: { ofacVerified: true },
  });
  assert.equal(res.status, 403);
  assert.equal(app.db.users.hunter.ofacVerified, false);

  const anon = await app.call(ROUTE, {
    params: { userId: "hunter" },
    body: { ofacVerified: true },
  });
  assert.equal(anon.status, 401);
  assert.equal(app.db.users.hunter.ofacVerified, false);
});

test("the OFAC status must be a boolean, and the user must exist", async () => {
  const app = loadAuthRoutes();
  for (const ofacVerified of ["true", 1, null, undefined]) {
    const res = await app.call(ROUTE, {
      token: "admin",
      params: { userId: "hunter" },
      body: { ofacVerified },
    });
    assert.equal(res.status, 400);
  }
  assert.equal(app.db.users.hunter.ofacVerified, false);

  const missing = await app.call(ROUTE, {
    token: "admin",
    params: { userId: "nobody" },
    body: { ofacVerified: true },
  });
  assert.equal(missing.status, 404);
});
