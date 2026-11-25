const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    { module: mod, exports: mod.exports },
    { filename },
  );
  return mod.exports;
}

const {
  isUnifiedAddress,
  isSaplingAddress,
  isShieldedAddress,
  isTransparentAddress,
  getZcashAddressKind,
} = loadTs("lib/address-utils.ts");

const VALID_UA = "u1" + "q".repeat(140);
const VALID_SAPLING = "zs1" + "p".repeat(75);
const VALID_T1 = "t1" + "a".repeat(33);
const VALID_T3 = "t3" + "b".repeat(33);
const VALID_TESTNET_UA = "utest1" + "z".repeat(140);
const VALID_TESTNET_SAPLING = "ztestsapling1" + "r".repeat(75);
const VALID_TESTNET_TM = "tm" + "c".repeat(33);

test("accepts valid mainnet unified, sapling, and transparent addresses (with trimming and uppercase bech32)", () => {
  assert.equal(isUnifiedAddress(`  ${VALID_UA}  `), true);
  assert.equal(isUnifiedAddress(VALID_UA.toUpperCase()), true);
  assert.equal(isSaplingAddress(VALID_SAPLING), true);
  assert.equal(isSaplingAddress(VALID_SAPLING.toUpperCase()), true);
  assert.equal(isShieldedAddress(VALID_UA), true);
  assert.equal(isShieldedAddress(VALID_SAPLING), true);
  assert.equal(isTransparentAddress(VALID_T1), true);
  assert.equal(isTransparentAddress(VALID_T3), true);

  assert.equal(getZcashAddressKind(VALID_UA), "unified");
  assert.equal(getZcashAddressKind(VALID_SAPLING), "sapling");
  assert.equal(getZcashAddressKind(VALID_T1), "transparent");
  assert.equal(getZcashAddressKind(VALID_T3), "transparent");
});

test("rejects invalid Bech32/Bech32m characters (1, b, i, o) and mixed-case addresses", () => {
  for (const badChar of ["1", "b", "i", "o"]) {
    const badUa = "u1" + "q".repeat(99) + badChar;
    const badSapling = "zs1" + "p".repeat(69) + badChar;
    assert.equal(isUnifiedAddress(badUa), false, `UA with '${badChar}'`);
    assert.equal(isSaplingAddress(badSapling), false, `Sapling with '${badChar}'`);
    assert.equal(getZcashAddressKind(badUa), "invalid");
  }

  const mixedCaseUa = "u1" + "Qp".repeat(60);
  const mixedCaseSapling = "zs1" + "Qp".repeat(40);
  assert.equal(isUnifiedAddress(mixedCaseUa), false);
  assert.equal(isSaplingAddress(mixedCaseSapling), false);
  assert.equal(isShieldedAddress(mixedCaseUa), false);
  assert.equal(getZcashAddressKind(mixedCaseUa), "invalid");
});

test("classifies real testnet addresses accurately and rejects malformed utest prefixes", () => {
  assert.equal(getZcashAddressKind(VALID_TESTNET_UA), "testnet");
  assert.equal(getZcashAddressKind(VALID_TESTNET_UA.toUpperCase()), "testnet");
  assert.equal(getZcashAddressKind(VALID_TESTNET_SAPLING), "testnet");
  assert.equal(getZcashAddressKind(VALID_TESTNET_TM), "testnet");

  assert.equal(getZcashAddressKind("utest"), "invalid");
  assert.equal(getZcashAddressKind("utest1short"), "invalid");
  assert.equal(getZcashAddressKind("utest_not_an_address!"), "invalid");
  assert.equal(getZcashAddressKind("utest1" + "Qp".repeat(60)), "invalid");
});

test("handles nullish, empty, and non-string inputs safely without throwing", () => {
  for (const input of [null, undefined, "", "   ", 12345, {}]) {
    assert.equal(isUnifiedAddress(input), false);
    assert.equal(isSaplingAddress(input), false);
    assert.equal(isShieldedAddress(input), false);
    assert.equal(isTransparentAddress(input), false);
    assert.equal(getZcashAddressKind(input), "invalid");
  }
});
