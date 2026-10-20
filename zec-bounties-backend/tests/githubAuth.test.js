/**
 * Verifies the GitHub OAuth callback security fixes in routes/auth.js.
 *
 * Setup (from the backend root):
 *   npm install --save-dev supertest
 *
 * Run:
 *   node --test tests/githubAuth.test.js
 *
 * GitHub, the database and unrelated dependencies should be mocked so no
 * real network requests, database writes or user accounts are touched.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
process.env.FRONTEND_URL = "http://frontend.test";
process.env.NODE_ENV = "test";

const STATE = "abc123state";

const ghUser = (over = {}) => ({
  id: 1001,
  login: "Attacker",
  name: "Attacker",
  avatar_url: "http://avatar.test/a.png",
  email: null,
  ...over,
});

const verifiedPrimary = (email) => [{ email, primary: true, verified: true }];

function expectNoSession(res) {
  assert.equal(res.status, 302);
  assert.equal(new URL(res.headers.location).searchParams.has("token"), false);
}

test("githubId is @unique in schema.prisma", () => {
  const schema = fs.readFileSync(
    path.join(__dirname, "../prisma/schema.prisma"),
    "utf8",
  );

  assert.match(schema, /githubId\s+String\?\s+@unique/);
});

test("GitHub OAuth state cookie and callback security", async (t) => {
  // The route and its dependencies are loaded dynamically so tests can use
  // Node's built-in test runner. For complete isolation, inject the GitHub
  // client and Prisma dependencies into the route or use a dedicated test
  // module that exports the callback handler with those dependencies.

  await t.test(
    "the OAuth start route sets an httpOnly state cookie",
    async () => {
      const res = await request(createApp()).get("/auth/github").redirects(0);

      assert.equal(res.status, 302);

      const cookies = res.headers["set-cookie"] || [];
      const cookie = cookies.find((value) => value.startsWith("gh_state="));

      assert.ok(cookie, "expected gh_state cookie");
      assert.match(cookie.toLowerCase(), /httponly/);

      const cookieValue = cookie.split(";")[0].split("=")[1];
      const stateParam = new URL(res.headers.location).searchParams.get(
        "state",
      );

      assert.ok(stateParam);
      assert.equal(stateParam, cookieValue);
    },
  );

  await t.test("missing OAuth state cookie is rejected", async () => {
    const res = await callback(createApp(), {
      cookieState: null,
    });

    expectNoSession(res);
    assert.match(res.headers.location, /error=oauth_failed/);
  });

  await t.test("mismatched OAuth state is rejected", async () => {
    const res = await callback(createApp(), {
      state: "attacker-state",
    });

    expectNoSession(res);
    assert.match(res.headers.location, /error=oauth_failed/);
  });

  await t.test("missing OAuth state parameter is rejected", async () => {
    const res = await request(createApp())
      .get("/auth/github/callback?code=oauth-code")
      .set("Cookie", `gh_state=${STATE}`)
      .redirects(0);

    expectNoSession(res);
    assert.match(res.headers.location, /error=oauth_failed/);
  });
});

/**
 * These helpers expect the application to expose the existing auth routes.
 * The actual route dependencies must be mocked before requiring routes/auth.
 */
function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", require("../routes/auth"));

  return app;
}

function callback(
  app,
  { state = STATE, cookieState = STATE, query = {} } = {},
) {
  const req = request(app)
    .get("/auth/github/callback")
    .query({ code: "oauth-code", state, ...query })
    .redirects(0);

  if (cookieState) {
    req.set("Cookie", `gh_state=${cookieState}`);
  }

  return req;
}

/*
 * Additional callback tests should cover:
 *
 * - Reject unverified primary emails.
 * - Reject verified non-primary emails when the primary is unverified.
 * - Ignore the GitHub profile email if /user/emails has no verified primary.
 * - Reject an email already associated with another GitHub ID.
 * - Never automatically link legacy accounts with a null GitHub ID.
 * - Use case-insensitive email lookup when checking existing accounts.
 * - Create new users with a normalized verified email and GitHub ID.
 * - Log returning users in by GitHub ID even when their email changes.
 * - Reject blocked users without issuing a session.
 *
 * The full callback suite requires injectable or otherwise isolated Prisma
 * and GitHub HTTP dependencies. Do not run these tests against production
 * credentials or a production database.
 */
