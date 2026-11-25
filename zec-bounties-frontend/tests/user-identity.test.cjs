const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadUserIdentity() {
  const filename = path.resolve(__dirname, "..", "lib/userIdentity.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    { module: mod, exports: mod.exports, String },
    { filename },
  );
  return mod.exports;
}

const { parseUserSearchQuery, bountyMatchesQuery } = loadUserIdentity();

const sampleBounty = {
  title: "Fix Alice's wallet sync bug",
  description: "Investigate orchard note scanning for docs release",
  createdByUser: { name: "Bob Builder", nickname: "bobdev" },
  assigneeUser: { name: "Carol", discordUsername: "carol_zec" },
  assignees: [{ user: { name: "Dave", discordGlobalName: "DaveZ" } }],
};

describe("parseUserSearchQuery", () => {
  it("extracts explicit @ and user: handles along with trailing text", () => {
    assert.deepEqual(
      { ...parseUserSearchQuery("@carol_zec") },
      { text: "", user: "carol_zec" },
    );
    assert.deepEqual(
      { ...parseUserSearchQuery("user:bobdev wallet") },
      { text: "wallet", user: "bobdev" },
    );
    assert.deepEqual(
      { ...parseUserSearchQuery("@bobdev   orchard docs") },
      { text: "orchard docs", user: "bobdev" },
    );
  });

  it("handles bare handles, multi-word text queries, and empty strings", () => {
    assert.deepEqual(
      { ...parseUserSearchQuery("alice") },
      { text: "alice", user: "alice" },
    );
    assert.deepEqual(
      { ...parseUserSearchQuery("wallet sync") },
      { text: "wallet sync", user: null },
    );
    assert.deepEqual(
      { ...parseUserSearchQuery("   ") },
      { text: "", user: null },
    );
  });
});

describe("bountyMatchesQuery", () => {
  it("scopes explicit @ and user: queries to user fields instead of title/description", () => {
    // "Alice" only appears in the title, not in any user on the bounty
    assert.equal(bountyMatchesQuery(sampleBounty, "@alice"), false);
    assert.equal(bountyMatchesQuery(sampleBounty, "user:alice"), false);

    // Real creator / assignee / multi-assignee handles match
    assert.equal(bountyMatchesQuery(sampleBounty, "@bobdev"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, "user:carol_zec"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, "@davez"), true);
  });

  it("applies both user and trailing text filters for combined prefixed queries", () => {
    assert.equal(bountyMatchesQuery(sampleBounty, "@bobdev orchard"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, "@bobdev unrelated"), false);
    assert.equal(bountyMatchesQuery(sampleBounty, "@nobody orchard"), false);
  });

  it("keeps bare handle and free-text searches matching title, description, or people", () => {
    assert.equal(bountyMatchesQuery(sampleBounty, "alice"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, "bobdev"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, "wallet sync"), true);
    assert.equal(bountyMatchesQuery(sampleBounty, ""), true);
  });
});
