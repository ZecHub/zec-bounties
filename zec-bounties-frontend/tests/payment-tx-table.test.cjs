const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, { clipboard } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });
  const timers = new Map();
  let nextTimerId = 1;

  const filename = path.resolve(
    __dirname,
    "../components/transactions/payment-tx-table.tsx",
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
    "@/lib/explorer": {
      getExplorerUrl: (txId) => `https://explorer.example/tx/${txId}`,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Date,
      Number,
      navigator: clipboard === undefined ? { clipboard: { writeText: async () => {} } } : { clipboard },
      window: { open() {} },
      console: { error() {} },
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
    return module.exports.PaymentTxIdsTable(currentProps);
  }

  function unmount() {
    for (const eff of effects) eff?.cleanup?.();
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

  return { render, unmount, findAll, timers };
}

test("preserves 0 ZEC amounts/fees and falls back cleanly on unparseable dates", () => {
  const ui = mount({
    paymentIDs: [
      {
        txid: "abc123",
        value: 0,
        fee: 0,
        datetime: "not-a-valid-date",
        status: "confirmed",
      },
    ],
  });

  const tree = ui.render();
  const badges = ui.findAll((n) => n.type === "Badge", tree).map((b) => b.props?.children);
  const zeroCount = badges.filter((c) => c === "0.0000 ZEC").length;
  assert.equal(zeroCount, 2);

  const tds = ui.findAll((n) => n.type === "td", tree).map((td) => td.props?.children);
  assert.ok(tds.includes("not-a-valid-date"));
  assert.ok(!tds.includes("Invalid Date"));
});

test("clears overlapping clipboard timer, scopes copied highlight to clicked row, and cleans up on unmount", async () => {
  const copied = [];
  const ui = mount(
    {
      paymentIDs: [
        { txid: "shared-txid", value: 1e8 },
        { txid: "shared-txid", value: 2e8 },
      ],
    },
    {
      clipboard: {
        writeText: async (text) => copied.push(text),
      },
    },
  );

  let tree = ui.render();
  const rows = ui.findAll((n) => n.type === "tr", tree).slice(1);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].key, rows[1].key);

  const copyButtons = ui.findAll((n) => n.type === "Button" && n.props?.title === "Copy transaction ID", tree);
  assert.equal(copyButtons.length, 2);

  // Copy row 0 then row 1: timer count stays 1 (old timer cleared) and only row 1 shows CheckCircle
  await copyButtons[0].props.onClick();
  assert.equal(ui.timers.size, 1);
  await copyButtons[1].props.onClick();
  assert.equal(ui.timers.size, 1);

  tree = ui.render();
  const updatedButtons = ui.findAll((n) => n.type === "Button" && n.props?.title === "Copy transaction ID", tree);
  assert.equal(updatedButtons[0].props.children.type, "Copy");
  assert.equal(updatedButtons[1].props.children.type, "CheckCircle");
  assert.deepEqual(copied, ["shared-txid", "shared-txid"]);

  ui.unmount();
  assert.equal(ui.timers.size, 0);
});

test("handles unavailable Clipboard API without throwing", async () => {
  const ui = mount({ paymentIDs: ["tx-only"] }, { clipboard: null });
  const copyBtn = ui.findAll((n) => n.type === "Button" && n.props?.title === "Copy transaction ID")[0];
  await assert.doesNotReject(() => copyBtn.props.onClick());
  assert.equal(ui.timers.size, 0);
});
