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

function loadSidebar(contextValue) {
  const filename = path.resolve(
    __dirname,
    "../components/favorite-teams-sidebar.tsx",
  );
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
    react: { useEffect: () => {} },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/link": { default: "Link" },
    "lucide-react": components,
    "@/lib/bounty-context": {
      useBounty: () => contextValue,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

test("getTeamInitials normalizes whitespace and falls back cleanly", () => {
  const mod = loadSidebar({
    communities: [],
    communitiesLoading: false,
    fetchCommunities: () => {},
    favoriteTeamIds: new Set(),
    favoriteTeamsLoading: false,
  });
  assert.equal(mod.getTeamInitials("  ZecHub   Core "), "ZC");
  assert.equal(mod.getTeamInitials("Shielded"), "S");
  assert.equal(mod.getTeamInitials("   "), "?");
});

test("FavoriteTeamsSidebar uses valid md:w-64 layout, non-clipping row height, and aria-pressed", () => {
  const mod = loadSidebar({
    communities: [
      { id: "t1", name: "  ZecHub   Labs ", logo: null },
      { id: "t2", name: "Other Team", logo: null },
    ],
    communitiesLoading: false,
    fetchCommunities: () => {},
    favoriteTeamIds: new Set(["t1"]),
    favoriteTeamsLoading: false,
  });

  const tree = mod.FavoriteTeamsSidebar({
    activeTeamId: "t1",
    onSelectTeam: () => {},
  });

  assert.equal(tree.props.className, "md:w-64");
  const buttons = findAll(tree, (n) => n.type === "button");
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props["aria-pressed"], false);
  assert.equal(buttons[1].props["aria-pressed"], true);
  assert.ok(buttons[1].props.className.includes("min-h-12"));
  assert.ok(!buttons[1].props.className.includes("py-6"));
  assert.ok(!buttons[1].props.className.includes("h-9"));
});
