const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(records, options = {}) {
  const state = [];
  let cursor = 0;
  const toasts = { success: [], error: [] };
  const resolvedCalls = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(
    __dirname,
    "../components/transactions/payment-records-table.tsx",
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
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    sonner: {
      toast: {
        success: (msg) => toasts.success.push(msg),
        error: (msg) => toasts.error.push(msg),
      },
    },
    "@/lib/bounty-context": {
      useBounty: () => ({
        resolvePaymentRecord: async (id, outcome, txid) => {
          resolvedCalls.push({ id, outcome, txid });
          if (options.resolveHandler) {
            return options.resolveHandler(id, outcome, txid);
          }
        },
        resolveTeamPaymentRecord: async (teamId, id, outcome, txid) => {
          resolvedCalls.push({ teamId, id, outcome, txid });
          if (options.resolveHandler) {
            return options.resolveHandler(id, outcome, txid);
          }
        },
      }),
    },
    "@/lib/explorer": {
      getExplorerUrl: (txid) => `https://explorer.example/tx/${txid}`,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Date,
      console,
      window: { open() {} },
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

  function render() {
    cursor = 0;
    return module.exports.PaymentRecordsTable({ records });
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

  return { render, find, findAll, toasts, resolvedCalls };
}

function makeRecord(id, overrides = {}) {
  return {
    id,
    bountyId: `bounty-${id}`,
    amountZat: 100_000_000,
    status: "UNKNOWN",
    txid: null,
    chain: "MAIN",
    createdAt: "2026-11-20T00:00:00Z",
    bounty: { title: `Bounty ${id}`, assigneeUser: { name: "Hunter" } },
    ...overrides,
  };
}

test("closing the Resolve dialog clears resolveTxid so it cannot leak into another record", () => {
  const recA = makeRecord("a");
  const recB = makeRecord("b");
  const ui = mount([recA, recB]);

  const resolveButtons = ui.findAll(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props?.children) &&
      n.props.children.includes("Resolve"),
  );
  assert.equal(resolveButtons.length, 2);

  // Open Record A and paste a txid
  resolveButtons[0].props.onClick();
  let input = ui.find((n) => n.type === "Input" && n.props.id === "resolve-txid");
  assert.equal(input.props.value, "");
  input.props.onChange({ target: { value: "txid-for-record-a" } });

  input = ui.find((n) => n.type === "Input" && n.props.id === "resolve-txid");
  assert.equal(input.props.value, "txid-for-record-a");

  // Dismiss dialog without submitting
  const dialog = ui.find((n) => n.type === "Dialog");
  dialog.props.onOpenChange(false);

  // Open Record B: txid input must be empty and confirm button disabled
  const buttonsAfter = ui.findAll(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props?.children) &&
      n.props.children.includes("Resolve"),
  );
  buttonsAfter[1].props.onClick();

  input = ui.find((n) => n.type === "Input" && n.props.id === "resolve-txid");
  assert.equal(input.props.value, "");

  const markPaidBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children === "It sent — mark paid",
  );
  assert.equal(markPaidBtn.props.disabled, true);
});

test("dialog cannot be dismissed while a resolve request is in flight", async () => {
  let finishResolve;
  const ui = mount([makeRecord("a")], {
    resolveHandler: () =>
      new Promise((resolve) => {
        finishResolve = resolve;
      }),
  });

  const resolveBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props?.children) &&
      n.props.children.includes("Resolve"),
  );
  resolveBtn.props.onClick();

  const failedBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      n.props?.children === "It never sent — unlock bounty",
  );
  const submitPromise = failedBtn.props.onClick();

  // Attempt to close while in flight
  let dialog = ui.find((n) => n.type === "Dialog");
  assert.equal(dialog.props.open, true);
  dialog.props.onOpenChange(false);

  dialog = ui.find((n) => n.type === "Dialog");
  assert.equal(dialog.props.open, true);

  finishResolve();
  await submitPromise;

  dialog = ui.find((n) => n.type === "Dialog");
  assert.equal(dialog.props.open, false);
});

test("clipboard failure shows an error toast instead of throwing an unhandled rejection", async () => {
  const ui = mount([
    makeRecord("c", { status: "BROADCAST", txid: "0123456789abcdef0123456789abcdef" }),
  ], {
    writeText: async () => {
      throw new Error("Clipboard permission denied");
    },
  });

  const copyBtn = ui.find(
    (n) => n.type === "Button" && n.props?.children?.type === "Copy",
  );
  assert.ok(copyBtn);
  await assert.doesNotReject(() => copyBtn.props.onClick());
  assert.equal(ui.toasts.success.length, 0);
  assert.equal(ui.toasts.error.length, 1);
});
