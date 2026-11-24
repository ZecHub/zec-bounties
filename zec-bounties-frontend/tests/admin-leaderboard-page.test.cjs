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

function loadAdminLeaderboard(contextValue) {
  const filename = path.resolve(__dirname, "../app/admin/leaderboard/page.tsx");
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

test("admin leaderboard helpers guard non-finite earnings, singularize 1 Bounty, and compute avatar fallback", () => {
  const mod = loadAdminLeaderboard({
    currentUser: null,
    leaderboard: [],
    leaderboardLoading: false,
    fetchLeaderboard: () => {},
  });

  assert.equal(mod.formatEarned(null), "—");
  assert.equal(mod.formatEarned(undefined), "—");
  assert.equal(mod.formatEarned(Number.NaN), "—");
  assert.equal(mod.formatEarned(Number.POSITIVE_INFINITY), "—");
  assert.equal(mod.formatEarned(3.5), "3.5 ZEC");

  assert.equal(mod.formatCompletedBounties(1), "1 Bounty");
  assert.equal(mod.formatCompletedBounties(0), "0 Bounties");
  assert.equal(mod.formatCompletedBounties(4), "4 Bounties");
  assert.equal(mod.formatCompletedBounties(null), "— Bounties");

  assert.equal(mod.getAvatarFallback({ name: "Alice Builder", nickname: null }, true), "AB");
  assert.equal(mod.getAvatarFallback({ name: "Alice Builder", nickname: "zdev" }, true), "ZD");
  assert.equal(mod.getAvatarFallback({ name: "Alice Builder", nickname: null }, false), "?");
  assert.equal(mod.getAvatarFallback({ name: "   ", nickname: "" }, true), "?");
});

test("AdminLeaderboardPage renders md:container, aria-pressed buttons, and non-None avatar fallbacks", () => {
  const mod = loadAdminLeaderboard({
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
        role: "ADMIN",
      },
      {
        id: "u2",
        rank: 2,
        name: "Secret Hunter",
        nickname: null,
        avatar: null,
        completed: 2,
        earned: 1.25,
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
    (n) => typeof n.props?.className === "string" && n.props.className.includes("md:container"),
  );
  assert.equal(containers.length, 1);
  assert.equal(containers[0].props.className.includes("imd:container"), false);

  const rangeButtons = findAll(tree, (n) => n.type === "button" && typeof n.props?.["aria-pressed"] === "boolean");
  assert.equal(rangeButtons.length, 3);
  assert.ok(rangeButtons.every((b) => b.props.type === "button"));
  assert.equal(rangeButtons.filter((b) => b.props["aria-pressed"]).length, 1);

  const fallbacks = findAll(tree, (n) => n.type === "AvatarFallback");
  assert.equal(fallbacks.length, 4);
  assert.ok(fallbacks.every((f) => f.props.children !== "None"));
  assert.deepEqual(
    fallbacks.map((f) => f.props.children),
    ["AB", "?", "AB", "?"],
  );
});
