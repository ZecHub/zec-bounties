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

function mount(ctxOverrides = {}) {
  const refs = [];
  let refCursor = 0;
  const pushed = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const ctx = {
    currentUser: { id: "u1", role: "HUNTER", isRobin: true },
    switchRole: async () => {},
    isSwitchingRole: false,
    ...ctxOverrides,
  };

  const filename = path.resolve(__dirname, "../components/layout/nav-parts/role-toggle-button.tsx");
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
  const dependencies = {
    react: {
      useRef(initial) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/navigation": {
      useRouter: () => ({ push: (p) => pushed.push(p) }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ctx,
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

  function render(props = {}) {
    refCursor = 0;
    return module.exports.RoleToggleButton(props);
  }

  return { render, pushed, ctx };
}

test("RoleToggleButton routes TEAM role to /teams and prevents same-tick double switching", async () => {
  const switched = [];
  let resolveSwitch;
  const harness = mount({
    switchRole: (role) => {
      switched.push(role);
      return new Promise((r) => {
        resolveSwitch = r;
      });
    },
  });

  const tree = harness.render();
  const items = findAll(tree, (n) => n.type === "DropdownMenuItem");
  const teamItem = items.find((n) => n.key === "TEAM");
  assert.ok(teamItem);

  const p1 = teamItem.props.onClick();
  const p2 = teamItem.props.onClick();
  assert.deepEqual(switched, ["TEAM"]);
  resolveSwitch();
  await Promise.all([p1, p2]);
  assert.deepEqual(harness.pushed, ["/teams"]);
});

test("RoleToggleButton catches switchRole errors without navigating and disables items while switching", async () => {
  const harness = mount({
    switchRole: async () => {
      throw new Error("forbidden");
    },
  });

  const tree = harness.render();
  const adminItem = findAll(tree, (n) => n.type === "DropdownMenuItem").find((n) => n.key === "ADMIN");
  await assert.doesNotReject(() => adminItem.props.onClick());
  assert.deepEqual(harness.pushed, []);

  harness.ctx.isSwitchingRole = true;
  const switchingTree = harness.render();
  const items = findAll(switchingTree, (n) => n.type === "DropdownMenuItem");
  assert.equal(items.every((i) => i.props.disabled === true), true);
});
