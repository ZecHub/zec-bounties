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

function loadMarkdownModule() {
  const filename = path.resolve(__dirname, "../components/ui/markdown.tsx");
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
    react: { useState: (init) => [init, () => {}] },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "@/components/ui/textarea": {
      Textarea: "Textarea",
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

const mod = loadMarkdownModule();

test("parseMarkdownLine strips bullet markers on indented lines and handles CRLF", () => {
  const dash = mod.parseMarkdownLine("  - Indented dash\r");
  assert.equal(dash.kind, "bullet");
  assert.equal(dash.text, "Indented dash");

  const star = mod.parseMarkdownLine("    * Nested star");
  assert.equal(star.kind, "bullet");
  assert.equal(star.text, "Nested star");

  const plus = mod.parseMarkdownLine("\t+ Tabbed plus");
  assert.equal(plus.kind, "bullet");
  assert.equal(plus.text, "Tabbed plus");

  const heading = mod.parseMarkdownLine("### **Important** Scope\r");
  assert.equal(heading.kind, "h3");
  assert.equal(heading.text, "**Important** Scope");
});

test("MarkdownRenderer renders indented bullets without leftover markers and parses bold inside headings", () => {
  const tree = mod.MarkdownRenderer({
    content: "### **Key** Requirements\r\n  - First **deliverable**\r\n    * Second item",
  });

  const h3 = findAll(tree, (n) => n.type === "h3")[0];
  assert.ok(h3);
  const h3Strong = findAll(h3, (n) => n.type === "strong")[0];
  assert.equal(h3Strong.props.children, "Key");

  const bulletSpans = findAll(
    tree,
    (n) => n.type === "div" && typeof n.props.className === "string" && n.props.className.includes("ml-4"),
  );
  assert.equal(bulletSpans.length, 2);
  const firstTextSpan = bulletSpans[0].props.children[1];
  assert.equal(firstTextSpan.props.children[0], "First ");
  assert.equal(firstTextSpan.props.children[1].type, "strong");
  assert.equal(firstTextSpan.props.children[1].props.children, "deliverable");
  const secondTextSpan = bulletSpans[1].props.children[1];
  assert.equal(secondTextSpan.props.children[0], "Second item");
});
