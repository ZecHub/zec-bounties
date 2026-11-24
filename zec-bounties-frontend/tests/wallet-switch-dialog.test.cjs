const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, contextData) {
  const state = [];
  const effects = [];
  let cursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const confirmed = [];
  const components = new Proxy({}, { get: (_, name) => name });

  const filename = path.resolve(
    __dirname,
    "../components/wallet-switch-dialog.tsx",
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
  const dependencies = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (value) => {
            state[i] = typeof value === "function" ? value(state[i]) : value;
          },
        ];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        const prev = effects[i];
        const changed =
          !prev ||
          !deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          effects[i] = { deps: deps ? [...deps] : null, fn, pending: true };
        }
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "@/lib/bounty-context": {
      useBounty: () => contextData,
    },
    "@/lib/utils": {
      cn: (...parts) => parts.filter(Boolean).join(" "),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react")
          return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) currentProps = { ...currentProps, ...overrides };
    cursor = 0;
    effectCursor = 0;
    const tree = module.exports.WalletSwitchDialog({
      ...currentProps,
      onConfirm: (sel) => {
        confirmed.push(sel);
        currentProps.onConfirm?.(sel);
      },
    });
    for (const eff of effects) {
      if (eff && eff.pending) {
        eff.pending = false;
        eff.fn();
      }
    }
    return tree;
  }

  function findAll(predicate, node = render(), acc = []) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const child of node) findAll(predicate, child, acc);
      return acc;
    }
    if (predicate(node)) acc.push(node);
    findAll(predicate, node.props?.children ?? null, acc);
    return acc;
  }

  return { render, findAll, confirmed };
}

test("distinguishes personal and team wallets that share the same accountName", () => {
  const ui = mount(
    { open: true, onOpenChange: () => {}, targetRole: "TEAM" },
    {
      zcashParams: [
        { accountName: "default", isTeam: false },
        { accountName: "default", isTeam: true, teamId: "team-1" },
        { accountName: "default", isTeam: true, teamId: "team-2" },
      ],
      teams: [
        { id: "team-1", name: "Core" },
        { id: "team-2", name: "Design" },
      ],
    },
  );

  const buttons = ui.findAll((n) => n.type === "button");
  assert.equal(buttons.length, 3);

  // Select the second team wallet ("team-2")
  buttons[2].props.onClick();

  const afterClick = ui.findAll((n) => n.type === "button");
  assert.equal(afterClick[0].props["aria-pressed"], false);
  assert.equal(afterClick[1].props["aria-pressed"], false);
  assert.equal(afterClick[2].props["aria-pressed"], true);

  const confirmBtn = ui.findAll(
    (n) => n.type === "Button" && n.props.children === "Use selected",
  )[0];
  confirmBtn.props.onClick();

  assert.deepEqual(JSON.parse(JSON.stringify(ui.confirmed)), [
    { accountName: "default", teamId: "team-2" },
  ]);
});

test("resets selection when dialog reopens or targetRole changes", () => {
  const ui = mount(
    { open: true, onOpenChange: () => {}, targetRole: "TEAM" },
    {
      zcashParams: [
        { accountName: "personal-1", isTeam: false },
        { accountName: "team-wallet", isTeam: true, teamId: "team-1" },
      ],
      teams: [{ id: "team-1", name: "Core" }],
    },
  );

  ui.findAll((n) => n.type === "button")[1].props.onClick();
  assert.equal(
    ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] === true)
      .length,
    1,
  );

  // Switch targetRole (or reopen dialog) -> selection must clear
  ui.render({ open: true, targetRole: "HUNTER" });
  assert.equal(
    ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] === true)
      .length,
    0,
  );
  const confirmBtn = ui.findAll(
    (n) => n.type === "Button" && n.props.children === "Use selected",
  )[0];
  assert.equal(confirmBtn.props.disabled, true);
});
