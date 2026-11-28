const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module,
    exports: module.exports,
    require,
    URL,
  }, { filename });
  return module.exports;
}

const {
  MAX_LINKS,
  validateDeliverableLinks,
} = loadTs("lib/links.ts");

const link = (n) => `https://github.com/ZecHub/zec-bounties/pull/${n}`;

test("deliverable validation accepts empty and up to five valid links", () => {
  assert.equal(validateDeliverableLinks([""]), null);
  assert.equal(validateDeliverableLinks([link(1)]), null);
  assert.equal(
    validateDeliverableLinks(Array.from({ length: MAX_LINKS }, (_, i) => link(i + 1))),
    null,
  );
});

test("deliverable validation rejects malformed and non-http links", () => {
  assert.equal(validateDeliverableLinks(["not-a-url"]), "invalid");
  assert.equal(validateDeliverableLinks(["javascript:alert(1)"]), "invalid");
});

test("deliverable validation counts links packed into one input", () => {
  const sixLinks = Array.from({ length: MAX_LINKS + 1 }, (_, i) => link(i + 1));
  assert.equal(validateDeliverableLinks([sixLinks.join(" ")]), "too_many");
});

test("edit path uses the same shared validation as initial submission", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../components/bounty-detail-modal.tsx"),
    "utf8",
  );
  const saveEdit = source.match(/const handleSaveEdit = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(saveEdit, "handleSaveEdit exists");
  assert.match(saveEdit[0], /validateDeliverableLinks\(editDeliverableUrls\)/);
  const submitWork = source.match(/const handleSubmitWork = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(submitWork, "handleSubmitWork exists");
  assert.match(submitWork[0], /validateDeliverableLinks\(deliverableUrls\)/);
});
