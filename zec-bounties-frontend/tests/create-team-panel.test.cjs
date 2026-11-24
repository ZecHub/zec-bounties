const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, createTeamImpl) {
  const state = [];
  const effects = [];
  let cursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const openChanges = [];
  const createdTeams = [];
  const components = new Proxy({}, { get: (_, name) => name });

  const filename = path.resolve(
    __dirname,
    "../components/teams/create-team-panel.tsx",
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
      useBounty: () => ({ createTeam: createTeamImpl }),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Error,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/")) return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) currentProps = { ...currentProps, ...overrides };
    cursor = 0;
    effectCursor = 0;
    const tree = module.exports.CreateTeamPanel({
      ...currentProps,
      onOpenChange: (next) => {
        openChanges.push(next);
        currentProps.onOpenChange?.(next);
      },
      onSuccess: (team) => {
        createdTeams.push(team);
        currentProps.onSuccess?.(team);
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

  return { render, find, findAll, openChanges, createdTeams };
}

test("blocks dismissal, disables inputs/cancel, and guards re-entry while submitting", async () => {
  let resolveCreate;
  let calls = 0;
  const ui = mount({ open: true }, () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveCreate = resolve;
    });
  });

  ui.find((n) => n.props?.id === "team-name").props.onChange({
    target: { value: "Orchard" },
  });
  ui.find((n) => n.props?.id === "team-twitter").props.onChange({
    target: { value: "https://x.com/orchard" },
  });
  ui.find((n) => n.props?.id === "team-discord").props.onChange({
    target: { value: "https://discord.gg/orchard" },
  });

  const submitBtn = ui.find(
    (n) => n.type === "Button" && n.props.children === "Create team",
  );
  const promise = submitBtn.props.onClick();

  // While submitting: Dialog onOpenChange(false) is ignored, Cancel & inputs are disabled
  ui.find((n) => n.type === "Dialog").props.onOpenChange(false);
  assert.deepEqual(ui.openChanges, []);

  const cancelBtn = ui.find(
    (n) => n.type === "Button" && n.props.children === "Cancel",
  );
  assert.equal(cancelBtn.props.disabled, true);
  assert.equal(ui.find((n) => n.props?.id === "team-name").props.disabled, true);

  // Re-invoking handleCreate while busy must not double-call createTeam
  const busySubmitBtn = ui.find(
    (n) => n.type === "Button" && n.props.children === "Creating...",
  );
  await busySubmitBtn.props.onClick();
  assert.equal(calls, 1);

  resolveCreate({ id: "t1", name: "Orchard" });
  await promise;

  assert.deepEqual(ui.openChanges, [false]);
  assert.deepEqual(ui.createdTeams, [{ id: "t1", name: "Orchard" }]);
  assert.equal(ui.find((n) => n.props?.id === "team-name").props.value, "");
});

test("resets stale inputs and errors when closed programmatically via open=false", async () => {
  const ui = mount({ open: true }, async () => {
    throw new Error("Duplicate team");
  });

  ui.find((n) => n.props?.id === "team-name").props.onChange({
    target: { value: "Orchard" },
  });
  ui.find((n) => n.props?.id === "team-twitter").props.onChange({
    target: { value: "https://x.com/orchard" },
  });
  ui.find((n) => n.props?.id === "team-discord").props.onChange({
    target: { value: "https://discord.gg/orchard" },
  });

  await ui
    .find((n) => n.type === "Button" && n.props.children === "Create team")
    .props.onClick();
  assert.ok(ui.find((n) => n.type === "p" && n.props.children === "Duplicate team"));

  // Programmatic close resets form & error
  ui.render({ open: false });
  ui.render({ open: true });
  assert.equal(ui.find((n) => n.props?.id === "team-name").props.value, "");
  assert.equal(
    ui.find((n) => n.type === "p" && n.props.children === "Duplicate team"),
    undefined,
  );
});
