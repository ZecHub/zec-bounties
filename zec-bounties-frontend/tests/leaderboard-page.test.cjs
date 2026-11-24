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

function loadLeaderboard(contextValue) {
  const filename = path.resolve(__dirname, "../app/leaderboard/page.tsx");
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
      useState: (init) => [init, () => {}],
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
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
        if (id.startsWith("@/components/")) return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

test("leaderboard helpers format earnings, bounty count pluralization, and avatar fallbacks safely", () => {
  const mod = loadLeaderboard({
    currentUser: null,
    leaderboard: [],
    leaderboardLoading: false,
    fetchLeaderboard: () => {},
  });

  assert.equal(mod.formatEarned(null), "—");
  assert.equal(mod.formatEarned(Number.NaN), "—");
  assert.equal(mod.formatEarned(1.25), "1.25 ZEC");
  assert.equal(mod.formatBountyCount(1), "1 Bounty");
  assert.equal(mod.formatBountyCount(3), "3 Bounties");
  assert.equal(mod.formatBountyCount(null), "— Bounties");
  assert.equal(mod.getLeaderboardAvatarFallback(true, "Alice Builder"), "AB");
  assert.equal(mod.getLeaderboardAvatarFallback(false, "Alice Builder"), "?");
  assert.equal(mod.getLeaderboardAvatarFallback(true, "   "), "?");
});

test("LeaderboardPage uses md:container, aria-pressed buttons, and non-None avatar fallbacks", () => {
  const mod = loadLeaderboard({
    currentUser: { id: "u1" },
    leaderboard: [
      {
        id: "u1",
        rank: 1,
        name: "Alice Builder",
        nickname: null,
        avatar: null,
        completed: 1,
        earned: 2.5,
        points: 100,
        badges: [],
        role: "HUNTER",
      },
      {
        id: "u2",
        rank: 2,
        name: "Secret Hunter",
        nickname: null,
        avatar: null,
        completed: 2,
        earned: 1.5,
        points: 80,
        badges: [],
        role: "HUNTER",
      },
    ],
    leaderboardLoading: false,
    fetchLeaderboard: () => {},
  });

  const tree = mod.default();
  const containers = findAll(
    tree,
    (n) =>
      n.type === "div" &&
      typeof n.props?.className === "string" &&
      n.props.className.includes("max-w-5xl"),
  );
  assert.equal(containers.length, 1);
  assert.ok(containers[0].props.className.includes("md:container"));
  assert.ok(!containers[0].props.className.includes("imd:container"));

  const rangeButtons = findAll(tree, (n) => n.type === "button");
  assert.equal(rangeButtons.length, 3);
  assert.equal(rangeButtons[0].props.type, "button");
  assert.equal(rangeButtons[0].props["aria-pressed"], true);
  assert.equal(rangeButtons[1].props["aria-pressed"], false);

  const fallbacks = findAll(tree, (n) => n.type === "AvatarFallback");
  assert.equal(fallbacks.length, 4);
  assert.deepEqual(
    fallbacks.map((f) => f.props.children),
    ["AB", "?", "AB", "?"],
  );
});
