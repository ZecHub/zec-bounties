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

const { getExplorerUrl } = loadTs("lib/explorer.ts");

test("builds mainnet explorer URL by default and trims/encodes txid", () => {
  assert.equal(
    getExplorerUrl("  abc123def456  "),
    "https://blockchair.com/zcash/transaction/abc123def456",
  );
  assert.equal(
    getExplorerUrl("tx/with?special#chars"),
    "https://blockchair.com/zcash/transaction/tx%2Fwith%3Fspecial%23chars",
  );
  assert.equal(
    getExplorerUrl("abc123", { chain: "MAIN" }),
    "https://blockchair.com/zcash/transaction/abc123",
  );
});

test("detects testnet case-insensitively across chain and serverUrl", () => {
  for (const opts of [
    { chain: "testnet" },
    { chain: "TESTNET" },
    { chain: "TEST" },
    { chain: " test " },
    { serverUrl: "https://testnet.zingolabs.org:443" },
    { serverUrl: "https://TESTNET.zingolabs.org:443" },
  ]) {
    assert.equal(
      getExplorerUrl("deadbeef", opts),
      "https://zexplorer.app/testnet/tx/deadbeef",
      JSON.stringify(opts),
    );
  }
});

test("handles null options and non-string txid safely without throwing", () => {
  assert.equal(
    getExplorerUrl("abc123", null),
    "https://blockchair.com/zcash/transaction/abc123",
  );
  assert.equal(
    getExplorerUrl(null, { chain: "TEST" }),
    "https://zexplorer.app/testnet/tx/",
  );
});
