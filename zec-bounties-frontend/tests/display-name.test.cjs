const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadDisplayNameModule(env = {}, backendUrl = "https://zechub.zone") {
  const filename = path.resolve(__dirname, "..", "lib/displayName.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      Array,
      process: { env },
      require: (id) => {
        assert.equal(id, "./configENV");
        return { backendUrl };
      },
    },
    { filename },
  );
  return mod.exports;
}

describe("displayName and bountyCreatorName", () => {
  const { displayName, bountyCreatorName, bountyCreatorInitial } =
    loadDisplayNameModule();

  it("trims whitespace-only nicknames and falls back to name or User", () => {
    assert.equal(displayName({ nickname: "   ", name: "  Alice  " }), "Alice");
    assert.equal(displayName({ nickname: "  zed  ", name: "Alice" }), "zed");
    assert.equal(displayName({ nickname: " ", name: "\t" }), "User");
    assert.equal(displayName(null), "User");
  });

  it("ignores whitespace-only team names and extracts Unicode-safe initials", () => {
    assert.equal(
      bountyCreatorName({
        team: { id: "t1", name: "   " },
        createdByUser: { name: "Bob" },
      }),
      "Bob",
    );
    assert.equal(
      bountyCreatorInitial({ team: { id: "t1", name: "🚀 ZecHub" } }),
      "🚀",
    );
    assert.equal(
      bountyCreatorInitial({ createdByUser: { nickname: "  alice  " } }),
      "A",
    );
  });
});

describe("pinataUrl and bountyCreatorAvatarSrc", () => {
  it("normalizes gateways with scheme/trailing slashes and ipfs:// or absolute CIDs", () => {
    const { pinataUrl } = loadDisplayNameModule({
      NEXT_PUBLIC_PINATA_GATEWAY: "https://custom.pinata.cloud/",
    });
    assert.equal(pinataUrl("QmAbc123"), "https://custom.pinata.cloud/ipfs/QmAbc123");
    assert.equal(pinataUrl("ipfs://QmAbc123"), "https://custom.pinata.cloud/ipfs/QmAbc123");
    assert.equal(pinataUrl("HTTPS://cdn.example.com/logo.png"), "HTTPS://cdn.example.com/logo.png");
    assert.equal(pinataUrl("   "), undefined);
    assert.equal(pinataUrl("ipfs://"), undefined);
  });

  it("joins relative backend avatar paths cleanly without double or missing slashes", () => {
    const withTrailing = loadDisplayNameModule({}, "https://zechub.zone/");
    assert.equal(
      withTrailing.bountyCreatorAvatarSrc({
        createdByUser: { avatar: "/uploads/a.png" },
      }),
      "https://zechub.zone/uploads/a.png",
    );
    assert.equal(
      withTrailing.bountyCreatorAvatarSrc({
        createdByUser: { avatar: "uploads/a.png" },
      }),
      "https://zechub.zone/uploads/a.png",
    );
    assert.equal(
      withTrailing.bountyCreatorAvatarSrc({
        team: { id: "t1", name: "Core", logo: "   " },
        createdByUser: { avatar: "  https://avatars.example.com/u.png  " },
      }),
      "https://avatars.example.com/u.png",
    );
  });
});
