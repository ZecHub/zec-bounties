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

function loadMovePage({ states, bountyContext, toasts }) {
  const filename = path.resolve(__dirname, "../app/admin/teams/move/page.tsx");
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
      useState: (init) => {
        const idx = stateIdx++;
        const val = idx < states.length ? states[idx] : init;
        return [
          val,
          (next) => {
            states[idx] = typeof next === "function" ? next(states[idx]) : next;
          },
        ];
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/navigation": {
      useRouter: () => ({ replace: () => {} }),
    },
    "@/lib/bounty-context": {
      useBounty: () => bountyContext,
    },
    sonner: {
      toast: {
        success: (msg) => toasts.push({ kind: "success", msg }),
        error: (msg) => toasts.push({ kind: "error", msg }),
      },
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

test("formatMovedBountiesMessage pluralizes singular and plural counts accurately", () => {
  const mod = loadMovePage({ states: [], bountyContext: {}, toasts: [] });
  assert.equal(mod.formatMovedBountiesMessage(1), "Moved 1 bounty");
  assert.equal(mod.formatMovedBountiesMessage(2), "Moved 2 bounties");
  assert.equal(mod.formatMovedBountiesMessage(0), "Moved 0 bounties");
});

test("AssignUnteamedBountiesPage passes Radix indeterminate checked state and formats plural success toast", async () => {
  const toasts = [];
  let moveCalls = 0;
  const states = ["team-1", new Set(["b1"]), false];
  const bountyContext = {
    currentUser: { id: "admin-1", role: "ADMIN" },
    isLoading: false,
    teams: [{ id: "team-1", name: "Core" }],
    fetchTeams: () => {},
    unassignedBounties: [
      { id: "b1", title: "First", bountyAmount: 1, dateCreated: "2026-11-01T00:00:00Z" },
      { id: "b2", title: "Second", bountyAmount: 2, dateCreated: "2026-11-02T00:00:00Z" },
    ],
    unassignedBountiesLoading: false,
    fetchUnassignedBounties: () => {},
    assignUnassignedBountiesToTeam: async () => {
      moveCalls += 1;
      return { movedCount: 2 };
    },
  };

  const mod = loadMovePage({ states, bountyContext, toasts });
  const tree = mod.default();

  const checkboxes = findAll(tree, (n) => n.type === "Checkbox");
  assert.equal(checkboxes[0].props.checked, "indeterminate");
  assert.equal(checkboxes[0].props.ref, undefined);

  const moveBtn = findAll(tree, (n) => n.type === "Button")[0];
  await moveBtn.props.onClick();
  assert.equal(moveCalls, 1);
  assert.deepEqual(toasts, [{ kind: "success", msg: "Moved 2 bounties" }]);
});
