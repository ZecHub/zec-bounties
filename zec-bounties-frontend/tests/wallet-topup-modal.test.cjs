const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, options = {}) {
  const state = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const toasts = { error: [] };
  const timers = new Map();
  let nextTimerId = 1;
  const clearedTimers = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(
    __dirname,
    "../components/wallet-topup-modal.tsx",
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
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          effects[i] = {
            deps: deps ? [...deps] : null,
            fn,
            cleanup: prev?.cleanup,
            pending: true,
          };
        }
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "qrcode.react": { QRCodeSVG: "QRCodeSVG" },
    sonner: { toast: { error: (msg) => toasts.error.push(msg) } },
    "@/lib/bounty-context": {
      useBounty: () => ({ addresses: options.ctxAddresses || [] }),
    },
    "@/lib/utils": { formatAddress: (addr) => addr },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      console,
      setTimeout(fn) {
        const id = nextTimerId++;
        timers.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        clearedTimers.push(id);
        timers.delete(id);
      },
      navigator: {
        clipboard: {
          writeText:
            options.writeText ||
            (async () => {
              /* ok */
            }),
        },
      },
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
    refCursor = 0;
    effectCursor = 0;
    const tree = module.exports.WalletTopupModal(currentProps);
    for (const eff of effects) {
      if (eff && eff.pending) {
        eff.pending = false;
        if (typeof eff.cleanup === "function") eff.cleanup();
        eff.cleanup = eff.fn();
      }
    }
    return tree;
  }

  function unmount() {
    for (const eff of effects) {
      if (typeof eff?.cleanup === "function") eff.cleanup();
    }
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

  function find(predicate, node = render()) {
    return findAll(predicate, node)[0];
  }

  return { render, unmount, find, findAll, toasts, timers, clearedTimers };
}

test("catches clipboard errors without showing copied checkmark", async () => {
  const ui = mount(
    { open: true, onOpenChange() {}, addresses: ["u1addr1"] },
    {
      writeText: async () => {
        throw new Error("Permission denied");
      },
    },
  );

  const copyBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "Copy",
  );
  assert.ok(copyBtn);
  await assert.doesNotReject(() => copyBtn.props.onClick());

  assert.equal(ui.toasts.error.length, 1);
  assert.equal(ui.timers.size, 0);
  const checkIcon = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "Check",
  );
  assert.equal(checkIcon, undefined);
});

test("clears copied indicator and pending timeout when switching carousel addresses", async () => {
  const ui = mount({
    open: true,
    onOpenChange() {},
    addresses: ["u1addr1", "u1addr2"],
  });

  const copyBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "Copy",
  );
  await copyBtn.props.onClick();

  assert.ok(
    ui.find((n) => n.type === "Button" && n.props?.children?.type === "Check"),
  );
  assert.equal(ui.timers.size, 1);

  const nextBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "ChevronRight",
  );
  nextBtn.props.onClick();

  assert.equal(ui.timers.size, 0);
  assert.equal(ui.clearedTimers.length, 1);
  assert.ok(
    ui.find((n) => n.type === "Button" && n.props?.children?.type === "Copy"),
  );
});

test("clears copy reset timer on unmount", async () => {
  const ui = mount({
    open: true,
    onOpenChange() {},
    addresses: ["u1addr1"],
  });

  const copyBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "Copy",
  );
  await copyBtn.props.onClick();
  assert.equal(ui.timers.size, 1);

  ui.unmount();
  assert.equal(ui.timers.size, 0);
});
