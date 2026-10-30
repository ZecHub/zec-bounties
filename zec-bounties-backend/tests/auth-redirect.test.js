const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCallbackRedirect } = require("../helpers/authRedirect");

const FE = "https://app.example";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload.sig";

// The session token must ride in the URL fragment, never the query string, so
// it can't leak via server/proxy logs or the Referer header.

test("token is placed in the fragment, not the query string", () => {
  const url = buildCallbackRedirect(FE, TOKEN, null);
  assert.ok(url.includes(`#token=${TOKEN}`), "token must be in the fragment");
  assert.ok(!url.includes("?token="), "token must NOT be in the query");
  assert.ok(!url.includes("&token="), "token must NOT be in the query");
});

test("the token never appears before the fragment delimiter", () => {
  const url = buildCallbackRedirect(FE, TOKEN, "abc123");
  const [beforeHash] = url.split("#");
  assert.ok(!beforeHash.includes(TOKEN), "nothing server-visible contains the token");
});

test("CSRF state (not secret) stays in the query", () => {
  const url = buildCallbackRedirect(FE, TOKEN, "abc123");
  assert.ok(url.includes("?state=abc123"), "state is a query param");
  assert.ok(url.startsWith(`${FE}/auth/callback?state=abc123#token=`));
});

test("no state yields no query string", () => {
  assert.equal(
    buildCallbackRedirect(FE, TOKEN, null),
    `${FE}/auth/callback#token=${TOKEN}`,
  );
});
