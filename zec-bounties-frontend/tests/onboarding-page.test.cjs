const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount({ currentUser, isLoading = false, selectRole }) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let ctx = { currentUser, isLoading, selectRole };
  const routerCalls = { push: [], replace: [] };
  const timers = new Map();
  let nextTimerId = 1;

  const filename = path.resolve(__dirname, "../app/onboarding/page.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const router = {
    push: (url) => routerCalls.push.push(url),
    replace: (url) => routerCalls.replace.push(url),
  };

  const module = { exports: {} };
  const dependencies = {
    react: {
      useState(initial) {
        const i = stateCursor++;
        if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
        return [
          states[i],
          (val) => {
            states[i] = typeof val === "function" ? val(states[i]) : val;
          },
        ];
      },
      useRef(initial) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        const prev = effects[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          prev?.cleanup?.();
          const cleanup = fn();
          effects[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : null };
        }
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "next/navigation": { useRouter: () => router },
    "@/lib/bounty-context": { useBounty: () => ctx },
    "@/components/layout/admin/navbar": { AdminNavbar: "AdminNavbar" },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Date,
      Object,
      setTimeout(fn, delay) {
        const id = nextTimerId++;
        timers.set(id, { fn, delay });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) ctx = { ...ctx, ...overrides };
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return module.exports.default();
  }

  function unmount() {
    for (const eff of effects) eff?.cleanup?.();
  }

  function findAll(predicate, node, acc = []) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const child of node) findAll(predicate, child, acc);
      return acc;
    }
    if (predicate(node)) acc.push(node);
    findAll(predicate, node.props?.children, acc);
    return acc;
  }

  return { render, unmount, findAll, routerCalls, timers };
}

test("redirects existing TEAM users to /teams instead of /home", () => {
  const ui = mount({
    currentUser: { id: "u1", role: "TEAM" },
    selectRole: async () => true,
  });

  const tree = ui.render();
  assert.equal(tree, null);
  assert.deepEqual(ui.routerCalls.replace, ["/teams"]);
});

test("keeps seal overlay visible when selectRole flips role to TEAM and redirects to /teams after timer", async () => {
  let ui;
  ui = mount({
    currentUser: { id: "u1", role: "CLIENT" },
    selectRole: async (role) => {
      // Mirrors BountyProvider.selectRole updating currentUser synchronously before returning true
      ui.render({ currentUser: { id: "u1", role } });
      return true;
    },
  });

  const tree = ui.render();
  const buttons = ui.findAll((n) => n.type === "button", tree);
  assert.equal(buttons.length, 2);

  await buttons[1].props.onClick();

  // After selectRole updated role to TEAM, component stays visible during animation and does not prematurely redirect to /home
  const afterSeal = ui.render();
  assert.notEqual(afterSeal, null);
  assert.deepEqual(ui.routerCalls.replace, []);
  assert.equal(ui.timers.size, 1);

  const [{ fn }] = [...ui.timers.values()];
  fn();
  assert.deepEqual(ui.routerCalls.push, ["/teams"]);
});

test("recovers from rejected selectRole without leaving sealing stuck and cleans up timer on unmount", async () => {
  const ui = mount({
    currentUser: { id: "u1", role: "CLIENT" },
    selectRole: async () => {
      throw new Error("network down");
    },
  });

  let tree = ui.render();
  let buttons = ui.findAll((n) => n.type === "button", tree);
  await buttons[0].props.onClick();

  tree = ui.render();
  buttons = ui.findAll((n) => n.type === "button", tree);
  assert.equal(buttons[0].props.disabled, false);
  assert.equal(buttons[1].props.disabled, false);
  const errorEl = ui.findAll(
    (n) => n.type === "p" && n.props?.children === "Couldn't set your role. Try again.",
    tree,
  );
  assert.equal(errorEl.length, 1);

  // Now verify unmount clears pending redirect timer
  const ui2 = mount({
    currentUser: { id: "u1", role: "CLIENT" },
    selectRole: async () => true,
  });
  const btn = ui2.findAll((n) => n.type === "button", ui2.render())[0];
  await btn.props.onClick();
  assert.equal(ui2.timers.size, 1);
  ui2.unmount();
  assert.equal(ui2.timers.size, 0);
});
