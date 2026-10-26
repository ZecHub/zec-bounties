const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, require: requireFixture, URLSearchParams,
  }, { filename });
  return module.exports;
}

const repos = loadTs("lib/repos.ts");
const { filterAndSortBounties, DEFAULT_BOUNTY_BOARD_FILTERS } = loadTs(
  "lib/bounty-filters.ts",
  (id) => {
    assert.equal(id, "@/lib/repos");
    return repos;
  },
);

test("Namada dashboard URLs belong to Namada, not the wiki", () => {
  for (const url of [
    "https://namada.zechub.wiki/",
    "https://namada.zechub.wiki",
    "https://namada.zechub.wiki/?tab=validators",
    "https://namada.zechub.wiki/#metrics",
    "See (https://namada.zechub.wiki) for metrics.",
    "Dashboard: NAMADA.ZECHUB.WIKI/",
  ]) {
    assert.equal(repos.bountyRepo({ description: url }), "namada", url);
  }
});

test("wiki links still match with or without a trailing slash", () => {
  for (const url of ["https://zechub.wiki/", "https://zechub.wiki", "https://zechub.wiki/start", "Read zechub.wiki/ for details."])
    assert.equal(repos.bountyRepo({ description: url }), "zechub-wiki", url);
});

test("unrelated subdomains and lookalike hosts stay untagged", () => {
  for (const url of [
    "https://other.zechub.wiki/",
    "https://notzechub.wiki/",
    "https://namada.zechub.wiki.example.com/",
  ]) assert.equal(repos.bountyRepo({ description: url }), null, url);
});

test("explicit repository tags keep priority over description links", () => {
  assert.equal(repos.bountyRepo({ targetRepo: "zec-bounties", description: "https://namada.zechub.wiki/" }), "zec-bounties");
});

test("existing GitHub repository links keep their classifications", () => {
  for (const [name, expected] of [
    ["zechub", "zechub"], ["zechub-wiki", "zechub-wiki"],
    ["zec-bounties", "zec-bounties"], ["Namada", "namada"],
  ]) assert.equal(repos.bountyRepo({ description: `https://github.com/ZecHub/${name}` }), expected);
});

test("board filters put dashboard and wiki tasks in separate repositories", () => {
  const bounties = [
    { id: "dashboard", description: "https://namada.zechub.wiki/" },
    { id: "wiki", description: "https://zechub.wiki/" },
    { id: "other", description: "No repository link" },
  ].map((bounty) => ({ ...bounty, dateCreated: "2026-10-01", status: "TO_DO" }));
  for (const [repo, expected] of [["namada", "dashboard"], ["zechub-wiki", "wiki"], ["untagged", "other"]]) {
    const result = filterAndSortBounties(bounties, { ...DEFAULT_BOUNTY_BOARD_FILTERS, repo });
    assert.deepEqual(Array.from(result, (bounty) => bounty.id), [expected]);
  }
});
