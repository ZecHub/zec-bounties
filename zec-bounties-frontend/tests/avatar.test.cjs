const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadAvatarModule() {
  const filename = path.resolve(__dirname, "..", "lib/avatar.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    { module: mod, exports: mod.exports, Array, Math },
    { filename },
  );
  return mod.exports;
}

const { nameToColor, nameToInitials } = loadAvatarModule();

describe("nameToInitials", () => {
  it("handles empty, whitespace, and nullish names without throwing", () => {
    assert.equal(nameToInitials(""), "?");
    assert.equal(nameToInitials("   \t\n  "), "?");
    assert.equal(nameToInitials(null), "?");
    assert.equal(nameToInitials(undefined), "?");
  });

  it("extracts uppercase initials for single and multi-word names", () => {
    assert.equal(nameToInitials("alice"), "A");
    assert.equal(nameToInitials("  alice   bob  "), "AB");
    assert.equal(nameToInitials("Ada Augusta Lovelace"), "AL");
  });

  it("preserves non-BMP Unicode code points without splitting surrogate pairs", () => {
    assert.equal(nameToInitials("🚀"), "🚀");
    assert.equal(nameToInitials("🚀 ZecHub"), "🚀Z");
  });
});

describe("nameToColor", () => {
  it("returns a deterministic hex palette color including for empty or nullish input", () => {
    const colorA = nameToColor("Alice");
    assert.match(colorA, /^#[0-9A-F]{6}$/i);
    assert.equal(nameToColor("Alice"), colorA);
    assert.match(nameToColor(""), /^#[0-9A-F]{6}$/i);
    assert.match(nameToColor(null), /^#[0-9A-F]{6}$/i);
    assert.match(nameToColor(undefined), /^#[0-9A-F]{6}$/i);
  });
});
