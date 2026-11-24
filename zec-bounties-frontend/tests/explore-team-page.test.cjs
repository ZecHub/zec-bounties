const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadExploreTeamPage() {
  const filename = path.resolve(__dirname, "../app/explore/[teamId]/page.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const module = { exports: {} };
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    react: {
      useEffect: () => {},
      useRef: (init) => ({ current: init }),
      useState: (init) => [init, () => {}],
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/navigation": {
      useParams: () => ({ teamId: "team-1" }),
      useRouter: () => ({ push: () => {} }),
    },
    "qrcode.react": components,
    "lucide-react": components,
    "@/lib/bounty-context": {
      useBounty: () => ({ favoriteTeamIds: new Set(), toggleFavoriteTeam: () => {} }),
    },
    "@/lib/configENV": {
      backendUrl: "http://localhost:5000",
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      URL,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/")) return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

test("initials normalizes extra whitespace and falls back to ? for blank names", () => {
  const mod = loadExploreTeamPage();
  assert.equal(mod.initials("ZecHub Core"), "ZC");
  assert.equal(mod.initials("  Zcash   Foundation  "), "ZF");
  assert.equal(mod.initials("ZecHub"), "ZE");
  assert.equal(mod.initials("   "), "?");
});

test("describeLink rejects non-http(s) schemes and does not misclassify lookalike discord domains", () => {
  const mod = loadExploreTeamPage();

  assert.equal(mod.describeLink("javascript:alert(1)"), null);
  assert.equal(mod.describeLink("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(mod.describeLink("ftp://files.example.org"), null);
  assert.equal(mod.describeLink("   "), null);

  const realDiscord = mod.describeLink("https://discord.com/invite/zechub");
  assert.equal(realDiscord.label, "Discord");

  const subDiscord = mod.describeLink("https://ptb.discord.com/invite/zechub");
  assert.equal(subDiscord.label, "Discord");

  const ggDiscord = mod.describeLink("discord.gg/zechub");
  assert.equal(ggDiscord.label, "Discord");

  const lookalike = mod.describeLink("https://evildiscord.com/invite/phish");
  assert.equal(lookalike.label, "evildiscord.com");

  const xLink = mod.describeLink("https://x.com/ZecHub");
  assert.equal(xLink.label, "@ZecHub");
});
