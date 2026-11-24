const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps) {
  const state = [];
  const effects = [];
  let cursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const toasts = { error: [] };
  const openChanges = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(
    __dirname,
    "../components/admin/select-winner-modal.tsx",
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
    sonner: {
      toast: {
        error: (msg) => toasts.error.push(msg),
      },
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Error,
      console: { ...console, error() {} },
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
    const tree = module.exports.SelectWinnerModal({
      ...currentProps,
      onOpenChange: (next) => {
        openChanges.push(next);
        currentProps.onOpenChange?.(next);
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

  function find(predicate, node = render()) {
    return findAll(predicate, node)[0];
  }

  return { render, find, findAll, toasts, openChanges };
}

function makeBounty(id, userIds) {
  return {
    id,
    bountyAmount: 0.5,
    assignees: userIds.map((userId) => ({
      userId,
      user: { id: userId, name: `User ${userId}`, email: `${userId}@example.com` },
    })),
  };
}

test("resets selectedWinnerId when switching to a different bounty", () => {
  const bountyA = makeBounty("bounty-a", ["u1", "u2"]);
  const bountyB = makeBounty("bounty-b", ["u1", "u3"]);
  const ui = mount({
    bounty: bountyA,
    open: true,
    onConfirm: async () => {},
  });

  const firstOption = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] !== undefined)[0];
  firstOption.props.onClick();

  let selected = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] === true);
  assert.equal(selected.length, 1);

  // Switch bounty prop directly (e.g. parent swaps active bounty)
  ui.render({ bounty: bountyB, open: true });
  selected = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] === true);
  assert.equal(selected.length, 0);
});

test("blocks dialog dismissal and disables assignee buttons while confirming", async () => {
  let finishConfirm;
  let confirmCalls = 0;
  const ui = mount({
    bounty: makeBounty("bounty-a", ["u1", "u2"]),
    open: true,
    onConfirm: () => {
      confirmCalls += 1;
      return new Promise((resolve) => {
        finishConfirm = resolve;
      });
    },
  });

  const optionBtns = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] !== undefined);
  optionBtns[0].props.onClick();

  const confirmBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Mark as Done"),
  );
  const promise = confirmBtn.props.onClick();

  // While confirming, onOpenChange(false) must be ignored and assignee buttons disabled
  const dialog = ui.find((n) => n.type === "Dialog");
  dialog.props.onOpenChange(false);
  assert.deepEqual(ui.openChanges, []);

  const optionBtnsBusy = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] !== undefined);
  assert.equal(optionBtnsBusy[0].props.disabled, true);
  assert.equal(optionBtnsBusy[1].props.disabled, true);

  // Re-invoking handleConfirm while busy does not double-call onConfirm
  const confirmBtnBusy = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Marking Done…"),
  );
  await confirmBtnBusy.props.onClick();
  assert.equal(confirmCalls, 1);

  finishConfirm();
  await promise;
  assert.deepEqual(ui.openChanges, [false]);
});

test("surfaces a toast error and keeps dialog open when onConfirm rejects", async () => {
  const ui = mount({
    bounty: makeBounty("bounty-a", ["u1", "u2"]),
    open: true,
    onConfirm: async () => {
      throw new Error("Server error marking done");
    },
  });

  const optionBtns = ui.findAll((n) => n.type === "button" && n.props["aria-pressed"] !== undefined);
  optionBtns[0].props.onClick();

  const confirmBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Mark as Done"),
  );
  await confirmBtn.props.onClick();

  assert.deepEqual(ui.openChanges, []);
  assert.deepEqual(ui.toasts.error, ["Server error marking done"]);
});
