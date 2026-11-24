const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const dbQueryPath = require.resolve("../helpers/db-query.js");
const parseAddressPath = require.resolve(
  "../utils/zingo/zingoLibParseAddress.js",
);

function loadDbQueryWithStub(stubFn) {
  const prevParse = require.cache[parseAddressPath];
  const prevDbQuery = require.cache[dbQueryPath];

  delete require.cache[dbQueryPath];
  require.cache[parseAddressPath] = {
    id: parseAddressPath,
    filename: parseAddressPath,
    loaded: true,
    exports: stubFn,
  };

  const mod = require(dbQueryPath);

  return {
    mod,
    restore() {
      delete require.cache[dbQueryPath];
      if (prevDbQuery) require.cache[dbQueryPath] = prevDbQuery;
      if (prevParse) {
        require.cache[parseAddressPath] = prevParse;
      } else {
        delete require.cache[parseAddressPath];
      }
    },
  };
}

describe("helpers/db-query address verification", () => {
  it("verifies testnet and mainnet addresses from single-object parser output", async () => {
    const { mod, restore } = loadDbQueryWithStub(async (addr) => {
      if (addr.startsWith("utest")) {
        return { status: "success", chain_name: "test" };
      }
      return { status: "success", chain_name: "main" };
    });

    try {
      assert.equal(await mod.verifyZaddress("utest1abc", {}), true);
      assert.equal(await mod.verifyUaddress("utest1abc", {}), false);
      assert.equal(await mod.verifyUaddress("u1mainnet", {}), true);
      assert.equal(await mod.verifyZaddress("u1mainnet", {}), false);
    } finally {
      restore();
    }
  });

  it("extracts parsed result from both 2-element and 1-element array outputs", async () => {
    const responses = [
      [{ banner: true }, { status: "success", chain_name: "test" }],
      [{ status: "success", chain_name: "main" }],
    ];
    let idx = 0;
    const { mod, restore } = loadDbQueryWithStub(async () => responses[idx++]);

    try {
      assert.equal(await mod.verifyZaddress("utest1arr", {}), true);
      assert.equal(await mod.verifyUaddress("u1single", {}), true);
    } finally {
      restore();
    }
  });

  it("returns null when executeZingoParseAddress rejects instead of throwing", async () => {
    const { mod, restore } = loadDbQueryWithStub(async () => {
      throw new Error("Zingo CLI error: binary missing");
    });

    try {
      assert.equal(await mod.verifyZaddress("utest1fail", {}), null);
      assert.equal(await mod.verifyUaddress("u1fail", {}), null);
    } finally {
      restore();
    }
  });

  it("returns null for non-object, empty array, or null parser outputs", async () => {
    const outputs = [null, undefined, "error", [], [null]];
    let idx = 0;
    const { mod, restore } = loadDbQueryWithStub(async () => outputs[idx++]);

    try {
      for (let i = 0; i < outputs.length; i += 1) {
        assert.equal(await mod.verifyUaddress("u1bad", {}), null);
      }
    } finally {
      restore();
    }
  });

  it("returns false when parser status is not success or chain_name is missing", async () => {
    const outputs = [
      { status: "invalid", chain_name: "main" },
      { status: "success" },
    ];
    let idx = 0;
    const { mod, restore } = loadDbQueryWithStub(async () => outputs[idx++]);

    try {
      assert.equal(await mod.verifyUaddress("u1inv", {}), false);
      assert.equal(await mod.verifyUaddress("u1nochain", {}), false);
    } finally {
      restore();
    }
  });
});
