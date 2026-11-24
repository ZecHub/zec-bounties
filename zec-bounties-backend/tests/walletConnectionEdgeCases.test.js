const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeServerUrl,
  allowedServerOrigins,
  validateWalletConnection,
} = require("../helpers/zcash/walletConnection");

describe("walletConnection edge cases", () => {
  it("returns an error instead of throwing when input is missing, null, or non-object", () => {
    for (const bad of [undefined, null, "mainnet", 42, []]) {
      assert.match(validateWalletConnection(bad, {}), /object/i);
    }
  });

  it("handles null or non-string env values safely in allowedServerOrigins", () => {
    const fromNull = allowedServerOrigins(null);
    assert.ok(fromNull.has("https://zec.rocks"));

    const fromBadEnv = allowedServerOrigins({
      ZCASH_ALLOWED_SERVER_URLS: 12345,
      ZCASH_SERVER_URL: null,
    });
    assert.ok(fromBadEnv.has("https://zec.rocks"));
  });

  it("rejects malformed hostname labels such as double dots or leading/trailing hyphens", () => {
    for (const bad of [
      "https://..",
      "https://.zec.rocks:443",
      "https://zec..rocks:443",
      "https://-zec.rocks:443",
      "https://zec-.rocks:443",
      "https://zec.rocks.:443",
    ]) {
      assert.equal(normalizeServerUrl(bad), null, bad);
    }
  });

  it("still normalizes valid single-label, multi-label, and IPv4 hosts", () => {
    assert.equal(normalizeServerUrl("http://localhost:9067"), "http://localhost:9067");
    assert.equal(normalizeServerUrl("http://127.0.0.1:8137/"), "http://127.0.0.1:8137");
    assert.equal(normalizeServerUrl("https://na.zec.rocks:443"), "https://na.zec.rocks");
  });
});
