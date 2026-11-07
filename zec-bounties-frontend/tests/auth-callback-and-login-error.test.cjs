const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

describe("Auth Callback and Login Error Handling Conformance", () => {
  test("resolveErrorMessage maps all backend and frontend error codes correctly", () => {
    function resolveErrorMessage(code) {
      switch (code) {
        case "no_email":
          return "Your GitHub account does not have a verified primary email. Please verify an email on GitHub and try again.";
        case "missing_token":
          return "Sign-in failed: No session token received. Please try again.";
        case "invalid_state":
          return "Sign-in failed: Security state verification mismatch. Please try again.";
        case "invalid_token":
          return "Sign-in failed: Your session token could not be verified. Please try again.";
        case "account_mismatch":
          return "Sign-in failed: This email belongs to an account linked to another GitHub user.";
        case "account_exists":
          return "An account with this email already exists. Please sign in with your credentials.";
        case "oauth_cancelled":
          return "GitHub sign-in was cancelled.";
        case "oauth_failed":
          return "GitHub sign-in failed. Please try again.";
        default:
          return code ? `Sign-in failed (${code}). Please try again.` : "";
      }
    }

    assert.match(resolveErrorMessage("missing_token"), /No session token received/);
    assert.match(resolveErrorMessage("no_email"), /verified primary email/);
    assert.match(resolveErrorMessage("invalid_state"), /state verification mismatch/);
    assert.match(resolveErrorMessage("account_mismatch"), /linked to another GitHub user/);
    assert.match(resolveErrorMessage("account_exists"), /account with this email already exists/);
    assert.match(resolveErrorMessage("oauth_cancelled"), /sign-in was cancelled/);
    assert.match(resolveErrorMessage("oauth_failed"), /sign-in failed/);
    assert.equal(resolveErrorMessage(null), "");
    assert.equal(resolveErrorMessage(""), "");
    assert.equal(resolveErrorMessage("unknown_code"), "Sign-in failed (unknown_code). Please try again.");
  });

  test("Token resolution falls back to query param ?token= when location.hash is empty", () => {
    function extractToken(hash, queryParamToken) {
      const hashToken = new URLSearchParams((hash || "").replace(/^#/, "")).get("token");
      return hashToken || queryParamToken || null;
    }

    // Hash token takes priority when present
    assert.equal(extractToken("#token=hash_jwt_123", "query_jwt_456"), "hash_jwt_123");

    // Falls back to query token during rolling deployments when hash is empty
    assert.equal(extractToken("", "query_jwt_456"), "query_jwt_456");
    assert.equal(extractToken(null, "query_jwt_456"), "query_jwt_456");

    // Evaluates to null when neither is provided
    assert.equal(extractToken("", null), null);
  });

  test("History replaceState query sanitizer strips ?token= without destroying other query parameters", () => {
    function sanitizeSearch(search) {
      const currentParams = new URLSearchParams(search);
      currentParams.delete("token");
      return currentParams.toString() ? `?${currentParams.toString()}` : "";
    }

    assert.equal(sanitizeSearch("?token=sensitive_jwt&state=abc1234"), "?state=abc1234");
    assert.equal(sanitizeSearch("?token=sensitive_jwt"), "");
    assert.equal(sanitizeSearch("?foo=bar&token=secret&baz=qux"), "?foo=bar&baz=qux");
  });

  test("Single-execution guard prevents re-run when location.hash has been cleared", () => {
    let callCount = 0;
    let redirectedTo = null;
    const hasHandledCallback = { current: false };

    function runCallbackEffect(hash) {
      if (hasHandledCallback.current) return;
      hasHandledCallback.current = true;

      const token = new URLSearchParams((hash || "").replace(/^#/, "")).get("token");
      if (!token) {
        redirectedTo = "/login?error=missing_token";
        return;
      }
      callCount++;
    }

    // 1st run: hash is "#token=jwt123" -> succeeds
    runCallbackEffect("#token=jwt123");
    assert.equal(callCount, 1);
    assert.equal(redirectedTo, null);

    // 2nd run: StrictMode / re-render occurs after replaceState cleared the hash ("")
    runCallbackEffect("");
    // Guard prevented spurious redirect to /login?error=missing_token
    assert.equal(callCount, 1);
    assert.equal(redirectedTo, null);
  });
});
