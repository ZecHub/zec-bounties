const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadDecodeAddress(mockWasmLoader) {
  const filename = path.resolve(__dirname, "..", "lib/decodeAddress.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "@elemental-zcash/zaddr_wasm_parser") {
      return mockWasmLoader();
    }
    throw new Error(`Unexpected require: ${specifier}`);
  };
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      require: customRequire,
      console: { log: () => {}, error: () => {} },
    },
    { filename },
  );
  return mod.exports;
}

test("deduplicates concurrent initAddressDecoder calls and retries after a transient failure", async () => {
  let loadCalls = 0;
  let initCalls = 0;
  let shouldFail = true;

  const decoder = loadDecodeAddress(() => {
    loadCalls += 1;
    if (shouldFail) {
      throw new Error("transient load failure");
    }
    return {
      initWasm: async () => {
        initCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
      },
      isZcashAddressValid: () => true,
      getZcashAddressType: () => "unified",
      getAddressReceivers: () => ({ orchard: "o", sapling: null, p2pkh: null, p2sh: null, tex: null }),
    };
  });

  assert.equal(decoder.isDecoderReady(), false);

  await decoder.initAddressDecoder();
  assert.equal(decoder.isDecoderReady(), false);
  assert.equal(loadCalls, 1);

  shouldFail = false;
  await Promise.all([decoder.initAddressDecoder(), decoder.initAddressDecoder()]);
  assert.equal(decoder.isDecoderReady(), true);
  assert.equal(loadCalls, 2);
  assert.equal(initCalls, 1);

  await decoder.initAddressDecoder();
  assert.equal(loadCalls, 2);
  assert.equal(initCalls, 1);
});

test("handles non-string, blank, and uninitialized inputs safely without throwing", async () => {
  const decoder = loadDecodeAddress(() => ({
    isZcashAddressValid: () => true,
    getZcashAddressType: () => "unified",
    getAddressReceivers: () => ({ orchard: "o", sapling: "s", p2pkh: null, p2sh: null, tex: null }),
  }));

  assert.equal(decoder.getAddressReceivers("u1test").type, "Unknown");

  await decoder.initAddressDecoder();
  for (const input of [null, undefined, "", "   ", 12345, {}]) {
    const res = decoder.getAddressReceivers(input);
    assert.equal(res.type, "Unknown");
    assert.equal(res.rawType, null);
  }
});

test("maps receiver flags accurately and handles nullish typeFn or receiversFn outputs", async () => {
  let mode = "full";
  const decoder = loadDecodeAddress(() => ({
    is_valid_zcash_address: (addr) => addr !== "bad",
    get_zcash_address_type: () => (mode === "nullType" ? null : "unified"),
    get_address_receivers: () => {
      if (mode === "nullResult") return null;
      if (mode === "texOnly") return { orchard: null, sapling: null, p2pkh: null, p2sh: null, tex: "tex1..." };
      return { orchard: "o", sapling: "s", p2pkh: "t1", p2sh: null, tex: null };
    },
  }));

  await decoder.initAddressDecoder();

  const full = decoder.getAddressReceivers("  u1valid  ");
  assert.equal(full.ironwood, true);
  assert.equal(full.orchard, true);
  assert.equal(full.sapling, true);
  assert.equal(full.transparent, true);
  assert.equal(full.tex, false);
  assert.equal(full.rawType, "unified");
  assert.equal(full.type, "Ironwood + Sapling + Transparent");

  assert.equal(decoder.getAddressReceivers("bad").type, "Invalid");

  mode = "nullType";
  const nullType = decoder.getAddressReceivers("u1valid");
  assert.equal(nullType.rawType, null);

  mode = "texOnly";
  const texOnly = decoder.getAddressReceivers("tex1valid");
  assert.equal(texOnly.tex, true);
  assert.equal(texOnly.transparent, true);
  assert.equal(texOnly.type, "Transparent");

  mode = "nullResult";
  const nullResult = decoder.getAddressReceivers("u1valid");
  assert.equal(nullResult.type, "Invalid");
});
