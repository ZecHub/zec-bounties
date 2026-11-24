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

function loadSyncStatusMenu() {
  const filename = path.resolve(__dirname, "../components/layout/nav-parts/sync-status-menu.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const components = new Proxy({}, { get: (_, name) => name });
  const module = { exports: {} };
  const dependencies = {
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "@/lib/utils": {
      cn: (...parts) => parts.filter(Boolean).join(" "),
    },
    "./sync-status-summary": {
      SyncStatusSummary: "SyncStatusSummary",
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

const mod = loadSyncStatusMenu();

test("getSyncIndicatorState does not treat 0% blocks scanned or active in_progress sync as done", () => {
  const inProgressAtZero = mod.getSyncIndicatorState(
    {
      percentage_total_blocks_scanned: 0,
      percentage_total_outputs_scanned: 100,
      in_progress: true,
    },
    null,
    false,
  );
  assert.equal(inProgressAtZero.done, false);
  assert.equal(inProgressAtZero.dotClass, "bg-amber-400 animate-pulse");

  const checkingWhileDone = mod.getSyncIndicatorState(
    { percentage_total_blocks_scanned: 100, in_progress: false },
    "   ",
    true,
  );
  assert.equal(checkingWhileDone.hasError, false);
  assert.equal(checkingWhileDone.done, false);
  assert.equal(checkingWhileDone.dotClass, "bg-amber-400 animate-pulse");

  const finished = mod.getSyncIndicatorState(
    { percentage_total_blocks_scanned: 100, in_progress: false },
    null,
    false,
  );
  assert.equal(finished.done, true);
  assert.equal(finished.dotClass, "bg-emerald-500");
});

test("SyncStatusMenu guards Check sync click while syncing and catches rejected async handlers", async () => {
  let calls = 0;
  const busyTree = mod.SyncStatusMenu({
    syncStatus: null,
    syncStatusError: null,
    isSyncing: true,
    onCheckSync: () => { calls += 1; },
  });
  const busyBtn = findAll(busyTree, (n) => n.type === "Button" && typeof n.props.onClick === "function")[0];
  busyBtn.props.onClick();
  assert.equal(calls, 0);

  const errTree = mod.SyncStatusMenu({
    syncStatus: null,
    syncStatusError: null,
    isSyncing: false,
    onCheckSync: async () => {
      calls += 1;
      throw new Error("rpc timeout");
    },
  });
  const errBtn = findAll(errTree, (n) => n.type === "Button" && typeof n.props.onClick === "function")[0];
  errBtn.props.onClick();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 1);
});
