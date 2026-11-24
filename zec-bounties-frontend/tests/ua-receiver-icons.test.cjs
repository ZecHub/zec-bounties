const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props && node.props.children) findAll(node.props.children, pred, out);
  return out;
}

function loadUaReceiverIcons() {
  const filename = path.resolve(__dirname, "../components/address/ua-receiver-icons.tsx");
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
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "lucide-react": components,
    "@/lib/utils": {
      cn: (...parts) => parts.filter(Boolean).join(" "),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

test("matchesReceiverFilter handles none combined with receiver flags across any/all/exact modes and duplicates", () => {
  const { matchesReceiverFilter } = loadUaReceiverIcons();
  const empty = {};
  const saplingOnly = { sapling: true };
  const saplingAndIronwood = { sapling: true, ironwood: true };

  // Empty filter matches everything
  assert.equal(matchesReceiverFilter(undefined, [], "any"), true);

  // Pure "none" (including duplicates) matches only addresses with zero active receivers
  assert.equal(matchesReceiverFilter(empty, ["none"], "any"), true);
  assert.equal(matchesReceiverFilter(saplingOnly, ["none"], "any"), false);
  assert.equal(matchesReceiverFilter(empty, ["none", "none"], "any"), true);
  assert.equal(matchesReceiverFilter(saplingOnly, ["none", "none"], "any"), false);

  // Combined "none" + receiver flag in "any" mode matches either empty OR matching receiver
  assert.equal(matchesReceiverFilter(empty, ["none", "sapling"], "any"), true);
  assert.equal(matchesReceiverFilter(saplingOnly, ["none", "sapling"], "any"), true);
  assert.equal(matchesReceiverFilter({ transparent: true }, ["none", "sapling"], "any"), false);

  // Combined "none" + receiver flag in "all" or "exact" mode is unsatisfiable
  assert.equal(matchesReceiverFilter(empty, ["none", "sapling"], "all"), false);
  assert.equal(matchesReceiverFilter(saplingOnly, ["none", "sapling"], "all"), false);
  assert.equal(matchesReceiverFilter(empty, ["none", "sapling"], "exact"), false);
  assert.equal(matchesReceiverFilter(saplingOnly, ["none", "sapling"], "exact"), false);

  // Deduplicated exact matching
  assert.equal(matchesReceiverFilter(saplingOnly, ["sapling", "sapling"], "exact"), true);
  assert.equal(matchesReceiverFilter(saplingAndIronwood, ["sapling"], "exact"), false);
  assert.equal(matchesReceiverFilter(saplingAndIronwood, ["sapling", "ironwood"], "exact"), true);
});

test("UaFilterChips sets aria-pressed reflecting active filter selection", () => {
  const { UaFilterChips } = loadUaReceiverIcons();
  const tree = UaFilterChips({ value: ["none", "sapling"], onChange: () => {} });
  const buttons = findAll(tree, (n) => n.type === "button");
  assert.equal(buttons.length, 4);
  assert.deepEqual(
    buttons.map((b) => [b.props.title, b.props["aria-pressed"]]),
    [
      ["None", true],
      ["Transparent", false],
      ["Sapling", true],
      ["Ironwood", false],
    ],
  );
});
