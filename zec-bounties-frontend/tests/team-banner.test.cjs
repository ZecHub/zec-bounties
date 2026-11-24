const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, { uploadTeamBanner, removeTeamBanner }) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });

  const filename = path.resolve(__dirname, "../components/teams/team-banner.tsx");
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
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ({ uploadTeamBanner, removeTeamBanner }),
    },
    "@/lib/utils": {
      cn: (...args) => args.filter(Boolean).join(" "),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Error,
      Math,
      Promise,
      console: { error() {}, warn() {} },
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
    return module.exports.TeamBanner(currentProps);
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

  return { render, findAll };
}

test("blocks dialog dismissal and re-entrant remove/upload while uploading", async () => {
  let resolveUpload;
  let uploadCalls = 0;
  let removeCalls = 0;
  const ui = mount(
    { teamId: "team-a", bannerUrl: "https://example.com/banner.png", canManage: true },
    {
      uploadTeamBanner: () => {
        uploadCalls += 1;
        return new Promise((resolve) => {
          resolveUpload = resolve;
        });
      },
      removeTeamBanner: async () => {
        removeCalls += 1;
      },
    },
  );

  let tree = ui.render();
  const editBtn = ui.findAll((n) => n.type === "Button", tree)[0];
  editBtn.props.onClick();

  tree = ui.render();
  const input = ui.findAll((n) => n.type === "input", tree)[0];
  const svgFile = { name: "banner.svg", type: "image/svg+xml", size: 100 };
  const target = { files: [svgFile], value: "banner.svg" };

  const firstPromise = input.props.onChange({ target });
  tree = ui.render();

  const dialog = ui.findAll((n) => n.type === "Dialog", tree)[0];
  assert.equal(dialog.props.open, true);

  // Attempting to dismiss dialog while uploading is ignored
  dialog.props.onOpenChange(false);
  tree = ui.render();
  assert.equal(ui.findAll((n) => n.type === "Dialog", tree)[0].props.open, true);

  // Done button is disabled while uploading
  const doneBtn = ui.findAll((n) => n.type === "Button" && n.props?.children === "Done", tree)[0];
  assert.equal(doneBtn.props.disabled, true);

  // Re-entrant upload or remove while uploading is ignored
  await ui.findAll((n) => n.type === "input", tree)[0].props.onChange({ target });
  const removeBtn = ui.findAll(
    (n) => n.type === "Button" && Array.isArray(n.props?.children) && n.props.children.includes(" Remove"),
    tree,
  )[0];
  await removeBtn.props.onClick();
  assert.equal(uploadCalls, 1);
  assert.equal(removeCalls, 0);

  resolveUpload();
  await firstPromise;
  assert.equal(target.value, "");
  assert.equal(ui.findAll((n) => n.type === "Dialog", ui.render())[0].props.open, false);
});

test("resets fallback gradient, dialog open state, and stale errors when teamId changes or dialog reopens", async () => {
  const ui = mount(
    { teamId: "team-a", bannerUrl: null, canManage: true },
    {
      uploadTeamBanner: async () => {
        throw new Error("Upload rejected");
      },
      removeTeamBanner: async () => {},
    },
  );

  let tree = ui.render();
  const initialClass = ui.findAll((n) => n.type === "div", tree)[0].props.className;

  // Open dialog and trigger a failed upload
  ui.findAll((n) => n.type === "Button", tree)[0].props.onClick();
  tree = ui.render();
  const input = ui.findAll((n) => n.type === "input", tree)[0];
  await input.props.onChange({
    target: { files: [{ name: "a.svg", type: "image/svg+xml", size: 10 }], value: "a.svg" },
  });

  tree = ui.render();
  assert.equal(
    ui.findAll((n) => n.type === "p" && n.props?.children === "Upload rejected", tree).length,
    1,
  );

  // Close and reopen clears stale error
  ui.findAll((n) => n.type === "Dialog", tree)[0].props.onOpenChange(false);
  ui.findAll((n) => n.type === "Button", ui.render())[0].props.onClick();
  tree = ui.render();
  assert.equal(
    ui.findAll((n) => n.type === "p" && n.props?.children === "Upload rejected", tree).length,
    0,
  );

  // Switching teamId updates default gradient and closes the open dialog
  ui.render({ teamId: "team-b" });
  tree = ui.render();
  const nextClass = ui.findAll((n) => n.type === "div", tree)[0].props.className;
  assert.notEqual(nextClass, initialClass);
  assert.equal(ui.findAll((n) => n.type === "Dialog", tree)[0].props.open, false);
});
