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
  effectiveStarKey,
  specialtyBadgeKeys,
  matchesBadgeFilter,
  getBadgeTooltip,
} = loadTs("lib/badges.ts");

test("effectiveStarKey skips unknown avatar:* entries and non-string elements to find valid overrides", () => {
  assert.equal(effectiveStarKey(0, [null, "avatar:unknown", "avatar:25"]), "25-tasks");
  assert.equal(effectiveStarKey(12, ["avatar:unknown"]), "10-tasks");
  assert.equal(effectiveStarKey(50, []), "50-tasks");
  assert.equal(effectiveStarKey(NaN, []), "1-task");
  assert.equal(effectiveStarKey(0, ["toString", "constructor"]), "1-task");
});

test("getBadgeTooltip deduplicates badges, ignores avatar/blank/non-string items, and stays prototype-safe", () => {
  assert.equal(
    getBadgeTooltip(["avatar:10", "developer", "developer", "writer", null, "   "]),
    "Developer • Writer",
  );
  assert.equal(getBadgeTooltip(["toString", "constructor"]), "toString • constructor");
  assert.equal(getBadgeTooltip(["avatar:5"]), "Regular User");
  assert.equal(getBadgeTooltip(null), "Regular User");
});

test("matchesBadgeFilter handles nullish inputs and matches star, specialty, and ADMIN role", () => {
  assert.equal(matchesBadgeFilter([], { completed: 0 }), true);
  assert.equal(matchesBadgeFilter(null, null), true);
  assert.equal(matchesBadgeFilter(["admin"], { role: "ADMIN" }), true);
  assert.equal(matchesBadgeFilter(["25-tasks"], { completed: 1, badges: ["avatar:25"] }), true);
  assert.equal(matchesBadgeFilter(["designer"], null), false);
});

test("specialtyBadgeKeys returns canonical ordering and includes admin for ADMIN role", () => {
  assert.deepEqual(
    Array.from(specialtyBadgeKeys(["writer", "developer"], "ADMIN")),
    ["admin", "developer", "writer"],
  );
});
