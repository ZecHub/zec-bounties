const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

function loadInitWithMockPrisma(mockPrisma) {
  const initPath = require.resolve("../zcash/init");
  const prismaPath = require.resolve("../prisma/client");
  const savedInit = require.cache[initPath];
  const savedPrisma = require.cache[prismaPath];

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: mockPrisma,
  };
  delete require.cache[initPath];

  const mod = require(initPath);
  const restore = () => {
    delete require.cache[initPath];
    if (savedInit) require.cache[initPath] = savedInit;
    if (savedPrisma) require.cache[prismaPath] = savedPrisma;
    else delete require.cache[prismaPath];
  };
  return { mod, restore };
}

describe("zcash/init getWalletDataDir & initZcashOnce", () => {
  let tmpCwd;
  let origCwd;
  let restoreMod = null;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "zcash-init-test-"));
    process.chdir(tmpCwd);
  });

  afterEach(() => {
    if (restoreMod) {
      restoreMod();
      restoreMod = null;
    }
    process.chdir(origCwd);
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  it("rejects empty, non-string, and path-traversal walletIds", () => {
    const { mod, restore } = loadInitWithMockPrisma({ zcashParams: {} });
    restoreMod = restore;

    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      123,
      ".",
      "..",
      "../etc",
      "foo/bar",
      "foo\\bar",
      "/etc/passwd",
      "abc\0def",
    ]) {
      assert.throws(() => mod.getWalletDataDir(bad), /walletId/);
    }

    const expected = path.resolve(tmpCwd, "wallets", "wallet-uuid-1");
    assert.equal(mod.getWalletDataDir("wallet-uuid-1"), expected);
  });

  it("does not leak an orphaned wallet directory when prisma.create hits P2002 race", async () => {
    let findCalls = 0;
    const mockPrisma = {
      zcashParams: {
        async findFirst() {
          findCalls += 1;
          if (findCalls === 1) return null;
          return { walletId: "winner-wallet-id", ownerId: "u1", accountName: "Main" };
        },
        async create() {
          const err = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        },
      },
    };
    const { mod, restore } = loadInitWithMockPrisma(mockPrisma);
    restoreMod = restore;

    const result = await mod.initZcashOnce("u1", "Main", "mainnet");
    assert.equal(result.walletId, "winner-wallet-id");

    const dirs = fs.readdirSync(path.join(tmpCwd, "wallets"));
    assert.deepEqual(dirs, ["winner-wallet-id"]);
  });

  it("does not leak an orphaned wallet directory when prisma.create throws a DB error", async () => {
    const mockPrisma = {
      zcashParams: {
        async findFirst() {
          return null;
        },
        async create() {
          throw new Error("DB unavailable");
        },
      },
    };
    const { mod, restore } = loadInitWithMockPrisma(mockPrisma);
    restoreMod = restore;

    await assert.rejects(() => mod.initZcashOnce("u1", "Main"), /DB unavailable/);
    assert.equal(fs.existsSync(path.join(tmpCwd, "wallets")), false);

    await assert.rejects(() => mod.initZcashOnceForTeams("t1", "Main"), /DB unavailable/);
    assert.equal(fs.existsSync(path.join(tmpCwd, "wallets")), false);
  });

  it("creates wallet directory after persisting DB record and rejects blank ownerId/teamId", async () => {
    let createdData = null;
    const mockPrisma = {
      zcashParams: {
        async findFirst() {
          return null;
        },
        async create({ data }) {
          // Directory must not exist yet during create
          assert.equal(fs.existsSync(path.join(tmpCwd, "wallets", data.walletId)), false);
          createdData = data;
          return data;
        },
      },
    };
    const { mod, restore } = loadInitWithMockPrisma(mockPrisma);
    restoreMod = restore;

    await assert.rejects(() => mod.initZcashOnce("   "), /ownerId is required/);
    await assert.rejects(() => mod.initZcashOnceForTeams(""), /teamId is required/);

    const created = await mod.initZcashOnce("u2", "Main", "testnet");
    assert.equal(created.walletId, createdData.walletId);
    assert.equal(fs.existsSync(path.join(tmpCwd, "wallets", created.walletId)), true);
  });
});
