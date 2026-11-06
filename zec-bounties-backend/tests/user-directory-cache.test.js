const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function loadAuthRoutes() {
  const routes = {};
  const invalidations = [];
  const prisma = {
    user: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async ({ data }) => ({ id: "new-user", ...data }),
      update: async ({ where, data }) => ({
        id: where.id,
        name: "User",
        avatar: null,
        nickname: "user",
        role: "CLIENT",
        ...data,
      }),
    },
  };
  const dependencies = {
    crypto,
    express: {
      Router: () =>
        new Proxy(
          {},
          {
            get: (_, method) => (url, ...handlers) => {
              routes[`${method} ${url}`] = handlers;
            },
          },
        ),
    },
    axios: {
      post: async () => ({ data: { access_token: "token" } }),
      get: async (url) =>
        url.endsWith("/emails")
          ? {
              data: [
                {
                  email: "new@example.com",
                  primary: true,
                  verified: true,
                },
              ],
            }
          : {
              data: {
                id: 1,
                login: "new-user",
                name: "New User",
                avatar_url: "https://example.com/avatar.png",
              },
            },
    },
    "../prisma/client": prisma,
    "../middleware/auth": { signSessionToken: () => "session-token" },
    "../utils/cache": {
      delCache: async () => {},
      deleteCacheByPattern: async () => {},
      invalidateUserDirectory: async () => invalidations.push(true),
    },
    "../helpers/githubLogin": {
      verifiedPrimaryEmail: (emails) => emails[0].email,
      isOtherGithubAccount: () => false,
    },
  };
  const filename = path.join(__dirname, "../routes/auth.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: { FRONTEND_URL: "https://app.test" } },
    },
    { filename },
  );
  return {
    invalidations,
    async call(route, req) {
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
        clearCookie() {},
        redirect(location) {
          this.location = location;
          return this;
        },
      };
      await routes[route].at(-1)(
        { params: {}, body: {}, query: {}, cookies: {}, ...req },
        res,
      );
      return res;
    },
  };
}

test("new users invalidate the cached public directory", async () => {
  const app = loadAuthRoutes();
  const res = await app.call("get /github/callback", {
    query: { code: "code", state: "state" },
    cookies: { gh_state: "state" },
  });
  assert.match(res.location, /session-token/);
  assert.equal(app.invalidations.length, 1);
});

test("nickname and role changes invalidate the cached public directory", async () => {
  const app = loadAuthRoutes();
  const nickname = await app.call("patch /update-nickname", {
    user: { id: "user", role: "CLIENT" },
    body: { nickname: "updated" },
  });
  assert.equal(nickname.statusCode, 200);

  const role = await app.call("patch /select-role", {
    user: { id: "user", role: "CLIENT" },
    body: { role: "HUNTER" },
  });
  assert.equal(role.statusCode, 200);
  assert.equal(app.invalidations.length, 2);
});
