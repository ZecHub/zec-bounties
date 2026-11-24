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

function loadTeamsPage({ states = [], bountyContext = {} } = {}) {
  const filename = path.resolve(__dirname, "../app/teams/page.tsx");
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

test("getTeamInitials and filterTeams normalize whitespace and match name or description", () => {
  const mod = loadTeamsPage();
  assert.equal(mod.getTeamInitials("  ZecHub   Core  "), "ZC");
  assert.equal(mod.getTeamInitials("   "), "?");

  const teams = [
    { id: "t1", name: "Core Dev", description: "Protocol tooling", members: [] },
    { id: "t2", name: "Design Guild", description: "Brand and UX", members: [] },
  ];
  assert.equal(mod.filterTeams(teams, "   ").length, 2);
  assert.deepEqual(
    mod.filterTeams(teams, "  protocol ").map((t) => t.id),
    ["t1"],
  );
  assert.deepEqual(
    mod.filterTeams(teams, "DESIGN").map((t) => t.id),
    ["t2"],
  );
});

test("TeamsPage filters cards by searchQuery, renders empty search state, and shows global ADMIN role", () => {
  const teams = [
    { id: "t1", name: "  ZecHub  Core", description: "Docs", members: [] },
    { id: "t2", name: "Shielded Labs", description: "Research", members: [] },
  ];

  // states: [showCreatePanel, searchQuery, openingTeamId]
  const filteredMod = loadTeamsPage({
    states: [false, "  core ", null],
    bountyContext: {
      currentUser: { id: "u-admin", role: "ADMIN" },
      teams,
      teamsLoading: false,
      fetchTeams: () => {},
      bounties: [],
      zcashParams: [],
      setDefaultWallet: async () => {},
    },
  });
  const filteredTree = filteredMod.default();
  const teamButtons = findAll(filteredTree, (n) => n.type === "button" && n.props.type === "button");
  assert.equal(teamButtons.length, 1);

  const badges = findAll(filteredTree, (n) => n.type === "Badge");
  assert.equal(badges.length, 1);
  assert.equal(badges[0].props.children, "ADMIN");

  const fallbacks = findAll(filteredTree, (n) => n.type === "AvatarFallback");
  assert.equal(fallbacks[0].props.children, "ZC");

  const emptyMod = loadTeamsPage({
    states: [false, "  nonexistent  ", null],
    bountyContext: {
      currentUser: { id: "u1", role: "CLIENT" },
      teams,
      teamsLoading: false,
      fetchTeams: () => {},
      bounties: [],
      zcashParams: [],
      setDefaultWallet: async () => {},
    },
  });
  const emptyTree = emptyMod.default();
  const emptyMsg = findAll(
    emptyTree,
    (n) => n.type === "p" && n.props.children === 'No teams matching "nonexistent".',
  );
  assert.equal(emptyMsg.length, 1);
});
