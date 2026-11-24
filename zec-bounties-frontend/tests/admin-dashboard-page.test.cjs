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

function loadAdminDashboard({ bounties = [], filterStatus = "all" } = {}) {
  const filename = path.resolve(__dirname, "../app/admin/dashboard/page.tsx");
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
  const memoDeps = [];
  const module = { exports: {} };
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    react: {
      useMemo: (fn, deps) => {
        memoDeps.push(deps);
        return fn();
      },
      useState: (init) => {
        const idx = stateIdx++;
        if (idx === 0) return [filterStatus, () => {}];
        return [init, () => {}];
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ({ bounties }),
    },
    "@/lib/utils": {
      formatStatus: (s) => s,
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

  return { mod: module.exports, memoDeps };
}

test("filterAndSortAdminBounties, computeAdminDashboardStats, and formatApplicationCount handle edge cases", () => {
  const { mod } = loadAdminDashboard();
  const sample = [
    { id: "1", title: "Old", status: "TO_DO", bountyAmount: 2, dateCreated: "2026-01-01T00:00:00Z", applications: [{ id: "a1" }] },
    { id: "2", title: "InvalidDate", status: "DONE", bountyAmount: 3, dateCreated: "not-a-date", applications: [] },
    { id: "3", title: "New", status: "IN_PROGRESS", bountyAmount: 5, dateCreated: "2026-06-01T00:00:00Z", applications: [{ id: "a2" }, { id: "a3" }] },
  ];

  const sortedAll = mod.filterAndSortAdminBounties(sample, "all");
  assert.deepEqual(
    sortedAll.map((b) => b.id),
    ["3", "1", "2"],
  );

  const onlyDone = mod.filterAndSortAdminBounties(sample, "DONE");
  assert.deepEqual(
    onlyDone.map((b) => b.id),
    ["2"],
  );

  const stats = mod.computeAdminDashboardStats(sample, sortedAll);
  assert.deepEqual({ ...stats }, {
    totalRewards: 10,
    activeBounties: 2,
    completed: 1,
    totalApplications: 3,
  });

  assert.equal(mod.formatApplicationCount(0), "0 applications");
  assert.equal(mod.formatApplicationCount(1), "1 application");
  assert.equal(mod.formatApplicationCount(2), "2 applications");
});

test("ClientDashboard includes bounties in useMemo deps and renders singular/plural application counts", () => {
  const bounties = [
    { id: "b1", title: "Shielded UI", status: "TO_DO", bountyAmount: 4, dateCreated: "2026-10-01T00:00:00Z", applications: [{ id: "a1" }] },
  ];
  const { mod, memoDeps } = loadAdminDashboard({ bounties, filterStatus: "all" });
  const tree = mod.default();

  assert.equal(memoDeps.length, 1);
  assert.equal(memoDeps[0].length, 2);
  assert.equal(memoDeps[0][0], bounties);
  assert.equal(memoDeps[0][1], "all");

  const titles = findAll(tree, (n) => n.type === "h3" && n.props.children === "Shielded UI");
  assert.equal(titles.length, 1);

  const appCounts = findAll(tree, (n) => n.type === "p" && n.props.children === "1 application");
  assert.equal(appCounts.length, 1);
});
