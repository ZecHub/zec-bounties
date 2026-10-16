const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateWalletConnection,
} = require("../helpers/zcash/walletConnection");

const env = {};

describe("validateWalletConnection", () => {
  it("accepts the default servers and both chains", () => {
    assert.equal(
      validateWalletConnection(
        { chain: "mainnet", serverUrl: "https://zec.rocks:443" },
        env,
      ),
      null,
    );
    assert.equal(
      validateWalletConnection(
        { chain: "testnet", serverUrl: "https://testnet.zec.rocks:443" },
        env,
      ),
      null,
    );
  });

  it("treats the default port and a trailing slash as the same server", () => {
    assert.equal(
      validateWalletConnection({ serverUrl: "https://zec.rocks" }, env),
      null,
    );
    assert.equal(
      validateWalletConnection({ serverUrl: "https://zec.rocks:443/" }, env),
      null,
    );
  });

  it("checks only the fields that are present", () => {
    assert.equal(validateWalletConnection({}, env), null);
    assert.equal(validateWalletConnection({ chain: "mainnet" }, env), null);
  });

  it("rejects unknown chains", () => {
    for (const chain of ["regtest", "", "mainnet --data-dir /tmp", 1]) {
      assert.match(validateWalletConnection({ chain }, env), /chain/);
    }
  });

  it("rejects servers that are not on the list", () => {
    for (const serverUrl of [
      "http://127.0.0.1:8137",
      "http://169.254.169.254",
      "https://evil.example:443",
      "https://zec.rocks.evil.example:443",
      "https://zec.rocks:9067",
      "https://user:pass@zec.rocks:443",
      "https://zec.rocks:443/path",
      "https://zec.rocks:443?x=1",
      "https://zec.rocks:443?",
      "https://zec.rocks:443#",
      "https://zec.rocks:443 ",
      "https://zec.r\tocks:443",
      "https://%7a%65c.rocks:443",
      "https://zec.rocks:0443",
      "--help",
      "",
      null,
      42,
    ]) {
      assert.match(
        validateWalletConnection({ serverUrl }, env),
        /serverUrl/,
        String(serverUrl),
      );
    }
  });

  it("allows servers the operator configures", () => {
    const configured = {
      ZCASH_SERVER_URL: "http://127.0.0.1:8137",
      ZCASH_ALLOWED_SERVER_URLS: "https://lwd.example:9067, https://b.example",
    };
    for (const serverUrl of [
      "http://127.0.0.1:8137",
      "https://lwd.example:9067",
      "https://b.example:443",
    ]) {
      assert.equal(
        validateWalletConnection({ serverUrl }, configured),
        null,
        serverUrl,
      );
    }
  });
});
