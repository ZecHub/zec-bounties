const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, contextOverrides = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });
  const toasts = [];

  const ctx = {
    zcashParams: [
      { id: "w1", accountName: "Active Wallet", chain: "mainnet", serverUrl: "https://zec.rocks:443", isDefault: true },
      { id: "w2", accountName: "Backup Wallet", chain: "testnet", serverUrl: "https://testnet.zec.rocks:443", isDefault: false },
    ],
    address: "u1activewalletaddress1234567890",
    teams: [],
    updateZcashParams: async () => {},
    deleteZcashParams: async () => {},
    setDefaultWallet: async () => {},
    ...contextOverrides,
  };

  const filename = path.resolve(
    __dirname,
    "../components/settings/global-settings-modal.tsx",
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
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ctx,
    },
    "@/hooks/use-toast": {
      useToast: () => ({ toast: (t) => toasts.push(t) }),
    },
    "@/lib/utils": {
      cn: (...args) => args.filter(Boolean).join(" "),
    },
    "./import-modal": {
      ImportWalletModal: "ImportWalletModal",
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      window: { location: { reload() {} } },
      navigator: { clipboard: { writeText: async () => {} } },
      setTimeout,
      clearTimeout,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react") return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) currentProps = { ...currentProps, ...overrides };
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return module.exports.GlobalSettingsModal(currentProps);
  }

  function walk(predicate, node, acc) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const child of node) walk(predicate, child, acc);
      return acc;
    }
    if (predicate(node)) acc.push(node);
    walk(predicate, node.props?.children, acc);
    return acc;
  }

  function findAll(predicate, node = render()) {
    return walk(predicate, node, []);
  }

  return { render, findAll, toasts };
}

test("editing an inactive wallet keeps the active wallet banner unchanged and validates blank inputs", async () => {
  const updatedCalls = [];
  const ui = mount(
    { open: true, onOpenChange: () => {} },
    {
      updateZcashParams: async (orig, next) => {
        updatedCalls.push({ orig, next });
      },
    },
  );

  // First render runs open effect, second render reflects selectedConfig = Active Wallet
  ui.render();
  let tree = ui.render();

  const bannerBefore = ui.findAll((n) => typeof n.type === "function" && n.type.name === "ActiveWalletBanner", tree)[0];
  assert.equal(bannerBefore.props.config.accountName, "Active Wallet");

  // Click Edit on Backup Wallet (inactive row)
  const rows = ui.findAll((n) => typeof n.type === "function" && n.type.name === "WalletRow", tree);
  assert.equal(rows.length, 2);
  rows[1].props.onEdit(rows[1].props.config);

  tree = ui.render();
  // Active wallet banner MUST still display "Active Wallet", not "Backup Wallet"
  const bannerAfter = ui.findAll((n) => typeof n.type === "function" && n.type.name === "ActiveWalletBanner", tree)[0];
  assert.equal(bannerAfter.props.config.accountName, "Active Wallet");

  // Blank account name is rejected without calling updateZcashParams
  const nameInput = ui.findAll((n) => n.props?.id === "edit-account-name", tree)[0];
  nameInput.props.onChange({ target: { value: "   " } });
  tree = ui.render();
  const saveBtn = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Save changes"),
    tree,
  )[0];
  await saveBtn.props.onClick();
  assert.equal(updatedCalls.length, 0);
  assert.equal(ui.toasts.at(-1).title, "Validation error");

  // Valid trimmed update submits against "Backup Wallet"
  ui.findAll((n) => n.props?.id === "edit-account-name", tree)[0].props.onChange({
    target: { value: "  Backup Renamed  " },
  });
  tree = ui.render();
  const saveBtn2 = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Save changes"),
    tree,
  )[0];
  await saveBtn2.props.onClick();
  assert.equal(updatedCalls.length, 1);
  assert.equal(updatedCalls[0].orig, "Backup Wallet");
  assert.equal(updatedCalls[0].next.accountName, "Backup Renamed");
  assert.equal(updatedCalls[0].next.chain, "testnet");
  assert.equal(updatedCalls[0].next.serverUrl, "https://testnet.zec.rocks:443");
});

test("delete confirmation prevents premature AlertDialog close while delete is in flight", async () => {
  let resolveDelete;
  const ui = mount(
    { open: true, onOpenChange: () => {} },
    {
      deleteZcashParams: () =>
        new Promise((r) => {
          resolveDelete = r;
        }),
    },
  );

  ui.render();
  let tree = ui.render();
  const rows = ui.findAll((n) => typeof n.type === "function" && n.type.name === "WalletRow", tree);
  rows[1].props.onDelete(rows[1].props.config);

  tree = ui.render();
  const deleteAction = ui.findAll((n) => n.type === "AlertDialogAction", tree)[0];
  let prevented = false;
  deleteAction.props.onClick({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);

  // Dialog remains open while deleting even if onOpenChange(false) fires
  tree = ui.render();
  const alertDialog = ui.findAll((n) => n.type === "AlertDialog", tree)[0];
  alertDialog.props.onOpenChange(false);
  tree = ui.render();
  assert.equal(ui.findAll((n) => n.type === "AlertDialog", tree)[0].props.open, true);

  resolveDelete();
  await new Promise((r) => setImmediate(r));
  tree = ui.render();
  assert.equal(ui.findAll((n) => n.type === "AlertDialog", tree)[0].props.open, false);
});
