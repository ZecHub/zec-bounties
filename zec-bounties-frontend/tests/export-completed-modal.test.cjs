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
  const memos = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let memoCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });

  const ctx = {
    fetchExportCompleted: async () => [],
    markBountiesExported: async (ids) => ({ acceptedIds: ids }),
    fetchTeamExportCompleted: async () => [],
    markTeamBountiesExported: async (_teamId, ids) => ({ acceptedIds: ids }),
    updateUserOfac: async () => {},
    ...contextOverrides,
  };

  const filename = path.resolve(
    __dirname,
    "../components/payments/export-completed-modal.tsx",
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
      useMemo(fn, deps) {
        const i = memoCursor++;
        const prev = memos[i];
        const changed =
          !prev ||
          !deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          memos[i] = { deps, value: fn() };
        }
        return memos[i].value;
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
  };

  let lastCsv = null;
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Date,
      Error,
      Number,
      Set,
      Blob: class {
        constructor(parts) {
          lastCsv = parts.join("");
        }
      },
      URL: {
        createObjectURL: () => "blob:test",
        revokeObjectURL: () => {},
      },
      document: {
        createElement: () => ({ href: "", download: "", click() {} }),
      },
      window: { location: { origin: "https://bounties.example" } },
      console: { error() {} },
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
    memoCursor = 0;
    return module.exports.ExportCompletedModal(currentProps);
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

  return { render, findAll, getLastCsv: () => lastCsv };
}

function makeRow(id, overrides = {}) {
  return {
    id,
    title: `Bounty ${id}`,
    bountyAmount: 1.5,
    dateCreated: "2026-11-20T00:00:00Z",
    completedAt: "2026-11-23T00:00:00Z",
    chain: "MAIN",
    exportedAt: null,
    assigneeUser: {
      id: `user-${id}`,
      name: `User ${id}`,
      email: `${id}@example.com`,
      UA_address: "u1testaddress1234567890",
      ofacVerified: false,
    },
    ...overrides,
  };
}

test("shows selected export count, stops row click propagation on links and OFAC cell, and prevents concurrent double export", async () => {
  let resolveMark;
  let markCalls = 0;
  const ui = mount(
    { open: true, onOpenChange: () => {} },
    {
      fetchExportCompleted: async () => [makeRow("b1"), makeRow("b2")],
      markBountiesExported: (ids) => {
        markCalls += 1;
        return new Promise((r) => {
          resolveMark = () => r({ acceptedIds: ids });
        });
      },
    },
  );

  ui.render();
  await new Promise((r) => setImmediate(r));
  let tree = ui.render();

  // Select row 0 via TableRow onClick
  const bodyRows = ui.findAll((n) => n.type === "TableRow" && typeof n.props?.onClick === "function", tree);
  assert.equal(bodyRows.length, 2);
  bodyRows[0].props.onClick();

  tree = ui.render();
  const exportBtn = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Export CSV"),
    tree,
  )[0];
  assert.ok(JSON.stringify(exportBtn.props.children).includes("Export CSV (1)"));

  // Clicking the external link and OFAC cell call stopPropagation so row selection is not toggled
  let linkStopped = false;
  const extLinks = ui.findAll((n) => n.type === "a", tree);
  extLinks[0].props.onClick({ stopPropagation: () => { linkStopped = true; } });
  assert.equal(linkStopped, true);

  let ofacCellStopped = false;
  const ofacCells = ui.findAll(
    (n) => n.type === "TableCell" && typeof n.props?.onClick === "function" && JSON.stringify(n.props?.children).includes("Switch"),
    tree,
  );
  assert.equal(ofacCells.length, 2);
  ofacCells[0].props.onClick({ stopPropagation: () => { ofacCellStopped = true; } });
  assert.equal(ofacCellStopped, true);

  // Trigger export and verify re-entry is blocked while exporting
  const firstExport = exportBtn.props.onClick();
  tree = ui.render();
  const exportingBtn = ui.findAll(
    (n) => n.type === "Button" && JSON.stringify(n.props?.children).includes("Exporting..."),
    tree,
  )[0];
  assert.equal(exportingBtn.props.disabled, true);
  await exportingBtn.props.onClick();
  assert.equal(markCalls, 1);

  resolveMark();
  await firstExport;
  assert.ok(ui.getLastCsv().includes("Bounty b1"));
  assert.ok(!ui.getLastCsv().includes("Bounty b2"));
});

test("catches load errors and displays loadError instead of leaving an unhandled rejection", async () => {
  const ui = mount(
    { open: true, onOpenChange: () => {} },
    {
      fetchExportCompleted: async () => {
        throw new Error("Backend unavailable");
      },
    },
  );

  ui.render();
  await new Promise((r) => setImmediate(r));
  const tree = ui.render();
  const paragraphs = ui.findAll((n) => n.type === "p", tree).map((p) => p.props?.children);
  assert.ok(paragraphs.includes("Backend unavailable"));
});
