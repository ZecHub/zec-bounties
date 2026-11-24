const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps, options = {}) {
  const state = [];
  const memos = [];
  const effects = [];
  let cursor = 0;
  let memoCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const toasts = { success: [], error: [] };
  const openChanges = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(
    __dirname,
    "../components/admin/submit-on-behalf-modal.tsx",
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
      useMemo(fn, deps) {
        const i = memoCursor++;
        const prev = memos[i];
        const changed =
          !prev ||
          !deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          memos[i] = { deps: deps ? [...deps] : null, value: fn() };
        }
        return memos[i].value;
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
        success: (msg) => toasts.success.push(msg),
        error: (msg) => toasts.error.push(msg),
      },
    },
    "@/lib/bounty-context": {
      useBounty: () => ({
        submitWork:
          options.submitWork ||
          (async () => {
            /* ok */
          }),
        editSubmission:
          options.editSubmission ||
          (async () => {
            /* ok */
          }),
      }),
    },
    "@/lib/displayName": {
      displayName: (user) => user?.name || "Unknown",
    },
    "@/lib/links": {
      parseLinks: (raw) =>
        raw
          ? String(raw)
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      URL,
      console,
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
    memoCursor = 0;
    effectCursor = 0;
    const tree = module.exports.SubmitOnBehalfModal({
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

test("keeps original submitter selectable in edit mode even after removal from bounty assignees", () => {
  const ui = mount({
    bounty: {
      id: "b1",
      title: "Fix widget",
      assignees: [{ userId: "u2", user: { id: "u2", name: "Bob" } }],
    },
    submission: {
      id: "sub1",
      bountyId: "b1",
      submittedBy: "u1",
      description: "Initial delivery",
      deliverableUrl: "https://example.com/pr/1",
      submitterUser: { id: "u1", name: "Alice" },
    },
    open: true,
  });

  // First render runs the initialization effect; second render reflects updated state
  ui.render();
  const select = ui.find((n) => n.type === "select" && n.props.id === "proxy-assignee");
  assert.equal(select.props.value, "u1");
  const options = ui.findAll((n) => n.type === "option", select);
  assert.ok(options.some((opt) => opt.props.value === "u1" && opt.props.children === "Alice"));
});

test("blocks dialog dismissal while submission request is in flight and uses valid sm:max-w-lg class", async () => {
  let finishSubmit;
  const ui = mount(
    {
      bounty: {
        id: "b1",
        title: "Fix widget",
        assignees: [{ userId: "u1", user: { id: "u1", name: "Alice" } }],
      },
      open: true,
    },
    {
      submitWork: () =>
        new Promise((resolve) => {
          finishSubmit = resolve;
        }),
    },
  );

  ui.render();
  const content = ui.find((n) => n.type === "DialogContent");
  assert.equal(content.props.className, "sm:max-w-lg");

  const textarea = ui.find((n) => n.type === "Textarea" && n.props.id === "proxy-desc");
  textarea.props.onChange({ target: { value: "Completed the work" } });

  const submitBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Submit work"),
  );
  const submitPromise = submitBtn.props.onClick();

  const dialog = ui.find((n) => n.type === "Dialog");
  dialog.props.onOpenChange(false);
  assert.deepEqual(ui.openChanges, []);

  finishSubmit();
  await submitPromise;
  assert.deepEqual(ui.openChanges, [false]);
});
