const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props && node.props.children) findAll(node.props.children, pred, out);
  return out;
}

function loadExplorePage({ states, bountyContext }) {
  const filename = path.resolve(__dirname, "../app/explore/page.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  let stateIdx = 0;
  const module = { exports: {} };
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    react: {
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useState: (init) => {
        const idx = stateIdx++;
        const val = idx < states.length ? states[idx] : init;
        return [val, () => {}];
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/navigation": {
      useRouter: () => ({ push: () => {} }),
    },
    "@/lib/bounty-context": {
      useBounty: () => bountyContext,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react") return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  return module.exports;
}

test("getTeamInitials handles leading/multiple spaces and empty names, and getExploreEmptyMessage distinguishes favorites search", () => {
  const mod = loadExplorePage({ states: [], bountyContext: {} });
  assert.equal(mod.getTeamInitials("  ZecHub   Core "), "ZC");
  assert.equal(mod.getTeamInitials("   "), "?");
  assert.equal(
    mod.getExploreEmptyMessage("favorites", 2, "  privacy  "),
    'No favorite teams found matching "privacy".',
  );
  assert.equal(
    mod.getExploreEmptyMessage("favorites", 0, "privacy"),
    "You haven't favorited any teams yet.",
  );
  assert.equal(
    mod.getExploreEmptyMessage("all", 0, "   "),
    "No teams have been created yet.",
  );
});

test("ExploreContent shows favorites search empty message and sets aria-pressed on favorite toggles", async () => {
  const emptyMod = loadExplorePage({
    states: ["  missing  ", "favorites"],
    bountyContext: {
      communities: [{ id: "t1", name: "ZecHub Core", memberCount: 3, description: "Docs" }],
      communitiesLoading: false,
      fetchCommunities: () => {},
      favoriteTeamIds: new Set(["t1"]),
      favoriteTeamsLoading: false,
      toggleFavoriteTeam: async () => {},
    },
  });
  const emptyTree = emptyMod.ExploreContent();
  const emptyP = findAll(
    emptyTree,
    (n) => n.type === "p" && typeof n.props.children === "string" && n.props.children.includes("No favorite teams"),
  );
  assert.equal(emptyP.length, 1);
  assert.equal(emptyP[0].props.children, 'No favorite teams found matching "missing".');

  let toggled = 0;
  const listMod = loadExplorePage({
    states: ["", "all"],
    bountyContext: {
      communities: [{ id: "t1", name: "  ZecHub   Core", memberCount: 1, description: "" }],
      communitiesLoading: false,
      fetchCommunities: () => {},
      favoriteTeamIds: new Set(["t1"]),
      favoriteTeamsLoading: false,
      toggleFavoriteTeam: async () => {
        toggled += 1;
        throw new Error("network");
      },
    },
  });
  const listTree = listMod.ExploreContent();
  const favBtn = findAll(listTree, (n) => n.type === "button" && n.props["aria-label"] === "Remove from favorites")[0];
  assert.equal(favBtn.props["aria-pressed"], true);
  favBtn.props.onClick({ stopPropagation() {} });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(toggled, 1);
});
