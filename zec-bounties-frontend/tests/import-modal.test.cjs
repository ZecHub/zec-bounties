const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const VALID_24_WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

function mount(initialProps, contextOverrides = {}) {
  const states = [];
  let stateCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });
  const events = [];

  const ctx = {
    importWallet: async () => ({ success: true }),
    fetchSyncStatus: async () => {
      events.push("fetchSyncStatus");
    },
    ...contextOverrides,
  };

  const filename = path.resolve(
    __dirname,
    "../components/settings/import-modal.tsx",
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
      useEffect() {},
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
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
      Date,
      Number,
      localStorage: {
        setItem(k, v) {
          events.push(`localStorage:${k}`);
        },
      },
      window: {
        location: {
          reload() {
            events.push("reload");
          },
        },
      },
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
    return module.exports.ImportWalletModal(currentProps);
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

  return { render, findAll, events };
}

test("rejects invalid birthdayHeight values before calling importWallet", async () => {
  let called = false;
  const ui = mount(
    { open: true, onOpenChange: () => {} },
    {
      importWallet: async () => {
        called = true;
        return { success: true };
      },
    },
  );

  let tree = ui.render();
  const findInput = (id, t) => ui.findAll((n) => n.props?.id === id, t)[0];
  findInput("account-name", tree).props.onChange({ target: { value: "Main" } });
  findInput("seed-phrase", tree).props.onChange({ target: { value: VALID_24_WORDS } });
  findInput("birthday-height", tree).props.onChange({ target: { value: "-10" } });

  tree = ui.render();
  const importBtn = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Import Wallet"),
    tree,
  )[0];
  await importBtn.props.onClick();

  assert.equal(called, false);
  tree = ui.render();
  const alerts = ui.findAll((n) => n.type === "AlertDescription", tree).map((a) => a.props?.children);
  assert.ok(alerts.includes("Birthday height must be a non-negative whole number."));
});

test("awaits fetchSyncStatus before calling window.location.reload and blocks dialog dismissal while importing", async () => {
  let resolveImport;
  let closed = false;
  const ui = mount(
    { open: true, onOpenChange: (v) => { if (!v) closed = true; } },
    {
      importWallet: (payload) => {
        assert.equal(payload.birthdayHeight, 2500000);
        return new Promise((r) => {
          resolveImport = () => r({ success: true });
        });
      },
    },
  );

  let tree = ui.render();
  const findInput = (id, t) => ui.findAll((n) => n.props?.id === id, t)[0];
  findInput("account-name", tree).props.onChange({ target: { value: "Main" } });
  findInput("seed-phrase", tree).props.onChange({ target: { value: VALID_24_WORDS } });
  findInput("birthday-height", tree).props.onChange({ target: { value: "2500000" } });

  tree = ui.render();
  const importBtn = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Import Wallet"),
    tree,
  )[0];
  const pending = importBtn.props.onClick();

  // While importing, DialogContent blocks outside pointer & Escape dismissal and onOpenChange(false) does not close
  tree = ui.render();
  const dialog = ui.findAll((n) => n.type === "Dialog", tree)[0];
  const content = ui.findAll((n) => n.type === "DialogContent", tree)[0];
  dialog.props.onOpenChange(false);
  assert.equal(closed, false);

  let outsidePrevented = false;
  let escapePrevented = false;
  content.props.onPointerDownOutside({ preventDefault: () => { outsidePrevented = true; } });
  content.props.onEscapeKeyDown({ preventDefault: () => { escapePrevented = true; } });
  assert.equal(outsidePrevented, true);
  assert.equal(escapePrevented, true);

  resolveImport();
  await pending;
  assert.deepEqual(ui.events, ["localStorage:walletImportedAt", "fetchSyncStatus", "reload"]);
});
