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

const LOGIN_STATE = "a".repeat(64);
const FAILED = "https://app.test/login?error=oauth_failed";

function loadRoutes() {
  const routes = {};
  const dependencies = {
    crypto,
    express: {
      Router: () =>
        new Proxy({}, { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } }),
    },
    axios: {
      post: async () => ({ data: { access_token: "gh-token" } }),
      get: async (url) =>
        url.endsWith("/emails")
          ? { data: [{ email: "dev@example.com", primary: true, verified: true }] }
          : { data: { id: 1, login: "dev", avatar_url: "" } },
    },
    "../prisma/client": {
      user: { findFirst: async () => ({ id: "u1", githubId: "1", role: "HUNTER" }) },
    },
    "../middleware/auth": { signSessionToken: () => "session-token" },
    "../helpers/githubLogin": {
      verifiedPrimaryEmail: (emails) => {
        if (!Array.isArray(emails)) return null;
        const primary = emails.find((e) => e?.primary && e.verified);
        return typeof primary?.email === "string" ? primary.email : null;
      },
      isOtherGithubAccount: (user, githubId) =>
        Boolean(user?.githubId) && user.githubId !== githubId,
    },
    "../helpers/authRedirect": require("../helpers/authRedirect"),
  };
  const filename = path.join(__dirname, "../routes/auth.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : anything),
      console: { log() {}, error() {} },
      process: { env: { FRONTEND_URL: "https://app.test" } },
    },
    { filename },
  );
  return async (route, query, cookies = {}) => {
    const res = {
      cookies: {},
      cookie: (name, value) => (res.cookies[name] = value),
      clearCookie: (name) => (res.cookies[name] = null),
      redirect: (url) => (res.location = url),
    };
    await routes[route].at(-1)({ query, cookies }, res);
    return res;
  };
}

// Runs the whole login: start, GitHub's redirect back with the cookies the
// start set, then the token redirect to the frontend.
async function login(call, startQuery) {
  const start = await call("get /github", startQuery);
  const githubState = new URL(start.location).searchParams.get("state");
  return call("get /github/callback", { code: "c", state: githubState }, start.cookies);
}

test("the GitHub callback returns the login page's state with the token", async () => {
  const res = await login(loadRoutes(), { state: LOGIN_STATE });
  const url = new URL(res.location);
  assert.equal(url.pathname, "/auth/callback");
  // The session token rides in the fragment (never the query), so it can't
  // leak via server/proxy logs or the Referer header. State stays in the query.
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), "session-token");
  assert.equal(url.searchParams.get("state"), LOGIN_STATE);
  assert.equal(res.cookies.gh_login_state, null);
});

test("the login page's state is not sent to GitHub", async () => {
  const start = await loadRoutes()("get /github", { state: LOGIN_STATE });
  assert.notEqual(new URL(start.location).searchParams.get("state"), LOGIN_STATE);
});

test("GitHub login with a malformed state is refused", async () => {
  const call = loadRoutes();
  for (const state of ["", "short", `${LOGIN_STATE}&scope=repo`, [LOGIN_STATE]]) {
    assert.equal((await call("get /github", { state })).location, FAILED);
  }
});

test("a login started without a state gets a token with no state", async () => {
  const res = await login(loadRoutes(), {});
  const url = new URL(res.location);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), "session-token");
  assert.equal(url.searchParams.has("state"), false);
});

test("a login state from an earlier attempt is dropped", async () => {
  const call = loadRoutes();
  const start = await call("get /github", {});
  assert.equal(start.cookies.gh_login_state, null);
});
