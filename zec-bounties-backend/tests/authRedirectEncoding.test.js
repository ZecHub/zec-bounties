const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCallbackRedirect } = require("../helpers/authRedirect");

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload.sig";

test("normalizes trailing slashes on frontendUrl", () => {
  assert.equal(
    buildCallbackRedirect("https://app.example/", TOKEN, "abc123"),
    `https://app.example/auth/callback?state=abc123#token=${TOKEN}`,
  );
  assert.equal(
    buildCallbackRedirect("https://app.example///", TOKEN, null),
    `https://app.example/auth/callback#token=${TOKEN}`,
  );
});

test("URL-encodes special characters in state so query/fragment cannot be injected", () => {
  const url = buildCallbackRedirect(
    "https://app.example",
    TOKEN,
    "a&foo=bar#injected",
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/auth/callback");
  assert.equal(parsed.searchParams.get("state"), "a&foo=bar#injected");
  assert.equal(parsed.searchParams.get("foo"), null);
  assert.equal(parsed.hash, `#token=${TOKEN}`);
});

test("URL-encodes special characters in token inside the fragment", () => {
  const url = buildCallbackRedirect(
    "https://app.example",
    "tok+en/with=chars&more",
    null,
  );
  assert.equal(
    url,
    "https://app.example/auth/callback#token=tok%2Ben%2Fwith%3Dchars%26more",
  );
});
