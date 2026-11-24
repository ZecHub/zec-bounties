const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

function loadZcashHelperWithMock() {
  const targetPath = require.resolve("../helpers/zcash/zcashHelper");
  delete require.cache[targetPath];

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@prisma/client") {
      return {
        PrismaClient: class MockPrismaClient {
          constructor() {
            this.zcashParams = { findFirst: async () => null };
          }
        },
      };
    }
    return origLoad.apply(this, arguments);
  };

  try {
    return require(targetPath);
  } finally {
    Module._load = origLoad;
  }
}

test("getWalletDataDir allows normal wallet IDs and blocks path traversal", () => {
  const { getWalletDataDir } = loadZcashHelperWithMock();

  const expected = path.join(process.cwd(), "wallets", "wallet_abc-123");
  assert.equal(getWalletDataDir("wallet_abc-123"), expected);
  assert.equal(getWalletDataDir("  wallet_abc-123  "), expected);

  for (const bad of ["", "   ", null, undefined, 123]) {
    assert.throws(() => getWalletDataDir(bad), /walletId is required/);
  }

  for (const traversal of [
    "..",
    ".",
    "../secret",
    "../../etc/passwd",
    "a/b",
    "a\\b",
    "/tmp/evil",
    "wallet\0null",
  ]) {
    assert.throws(() => getWalletDataDir(traversal), /Invalid walletId/);
  }
});

test("getVerificationZcashParams and getSystemWalletParams reject whitespace-only env vars", () => {
  const { getVerificationZcashParams, getSystemWalletParams } =
    loadZcashHelperWithMock();
  const keys = [
    "ZCASH_VERIFICATION_WALLET_PATH",
    "ZCASH_VERIFICATION_CHAIN",
    "ZCASH_VERIFICATION_SERVER",
    "LOGIN_WALLET_CHAIN",
    "ZCASH_SERVER_URL",
    "LOGIN_WALLET_DATA_DIR",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    process.env.ZCASH_VERIFICATION_WALLET_PATH = "   ";
    assert.throws(
      () => getVerificationZcashParams(),
      /Verification wallet is not configured/,
    );

    process.env.ZCASH_VERIFICATION_WALLET_PATH = " /data/verify-wallet ";
    process.env.ZCASH_VERIFICATION_CHAIN = " testnet ";
    process.env.ZCASH_VERIFICATION_SERVER = " https://testnet.zec.rocks:443 ";
    assert.deepEqual(getVerificationZcashParams(), {
      dataDir: "/data/verify-wallet",
      chain: "testnet",
      serverUrl: "https://testnet.zec.rocks:443",
    });

    process.env.LOGIN_WALLET_CHAIN = "mainnet";
    process.env.ZCASH_SERVER_URL = "   ";
    process.env.LOGIN_WALLET_DATA_DIR = "/data/login";
    assert.throws(() => getSystemWalletParams(), /System wallet not configured/);

    process.env.ZCASH_SERVER_URL = " https://zec.rocks:443 ";
    assert.deepEqual(getSystemWalletParams(), {
      chain: "mainnet",
      serverUrl: "https://zec.rocks:443",
      dataDir: "/data/login",
    });
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
