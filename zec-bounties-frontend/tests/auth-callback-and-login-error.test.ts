import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveErrorMessage,
  extractAuthToken,
  sanitizeAuthUrl,
} from "../lib/auth-errors.ts";

describe("Auth Callback and Login Error Handling Conformance (Real Module Imports)", () => {
  test("resolveErrorMessage maps all backend and frontend error codes correctly from lib/auth-errors", () => {
    assert.match(resolveErrorMessage("missing_token"), /No session token received/);
    assert.match(resolveErrorMessage("no_email"), /verified primary email/);
    assert.match(resolveErrorMessage("invalid_state"), /state verification mismatch/);
    assert.match(resolveErrorMessage("invalid_token"), /token could not be verified/);
    assert.match(resolveErrorMessage("account_mismatch"), /linked to another GitHub user/);
    assert.match(resolveErrorMessage("account_exists"), /account with this email already exists/);
    assert.match(resolveErrorMessage("oauth_cancelled"), /sign-in was cancelled/);
    assert.match(resolveErrorMessage("oauth_failed"), /sign-in failed/);
    assert.equal(resolveErrorMessage(null), "");
    assert.equal(resolveErrorMessage(""), "");
    assert.equal(resolveErrorMessage("unknown_code"), "Sign-in failed (unknown_code). Please try again.");
  });

  test("extractAuthToken correctly resolves hash token and query token fallback from lib/auth-errors", () => {
    // Hash token takes priority when present
    assert.equal(extractAuthToken("#token=hash_jwt_123", "query_jwt_456"), "hash_jwt_123");

    // Falls back to query token during rolling deployments when hash is empty
    assert.equal(extractAuthToken("", "query_jwt_456"), "query_jwt_456");
    assert.equal(extractAuthToken(null, "query_jwt_456"), "query_jwt_456");

    // Evaluates to null when neither is provided
    assert.equal(extractAuthToken("", null), null);
    assert.equal(extractAuthToken(null, null), null);
  });

  test("sanitizeAuthUrl removes ?token= without destroying other query parameters from lib/auth-errors", () => {
    assert.equal(sanitizeAuthUrl("?token=sensitive_jwt&state=abc1234"), "?state=abc1234");
    assert.equal(sanitizeAuthUrl("?token=sensitive_jwt"), "");
    assert.equal(sanitizeAuthUrl("?foo=bar&token=secret&baz=qux"), "?foo=bar&baz=qux");
    assert.equal(sanitizeAuthUrl(""), "");
  });

  test("Single-execution guard behavior prevents duplicate execution", () => {
    let callCount = 0;
    let redirectedTo: string | null = null;
    const hasHandledCallback = { current: false };

    function runCallbackEffect(hash: string, queryToken: string | null) {
      if (hasHandledCallback.current) return;
      hasHandledCallback.current = true;

      const token = extractAuthToken(hash, queryToken);
      if (!token) {
        redirectedTo = "/login?error=missing_token";
        return;
      }
      callCount++;
    }

    runCallbackEffect("#token=jwt123", null);
    assert.equal(callCount, 1);
    assert.equal(redirectedTo, null);

    // 2nd run: React 19 / StrictMode / re-render simulation after URL replaced
    runCallbackEffect("", null);
    assert.equal(callCount, 1);
    assert.equal(redirectedTo, null);
  });
});
