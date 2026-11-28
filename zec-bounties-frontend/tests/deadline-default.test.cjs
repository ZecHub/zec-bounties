const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const { isValidFutureDate } = require("../../zec-bounties-backend/helpers/validateBounty");

function loadUtils() {
  const filename = path.resolve(__dirname, "../lib/utils.ts");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const module = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (id === "clsx") return { clsx: () => "" };
        if (id === "tailwind-merge") return { twMerge: () => "" };
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

const {
  localDateAfter,
  parseDateInputValue,
  toDateInputValue,
} = loadUtils();

test("localDateAfter returns local-midnight calendar dates", () => {
  const from = new Date(2026, 0, 10, 15, 30);
  const deadline = localDateAfter(7, from);

  assert.equal(deadline.getFullYear(), 2026);
  assert.equal(deadline.getMonth(), 0);
  assert.equal(deadline.getDate(), 17);
  assert.equal(deadline.getHours(), 0);
  assert.equal(deadline.getMinutes(), 0);
});

test("default creation deadline round-trips to a backend-valid future date", () => {
  const roundTripped = parseDateInputValue(
    toDateInputValue(localDateAfter(7)),
  );

  assert.equal(isValidFutureDate(roundTripped), true);
});

test("tomorrow minimum round-trips to a backend-valid future date", () => {
  const roundTripped = parseDateInputValue(
    toDateInputValue(localDateAfter(1)),
  );

  assert.equal(isValidFutureDate(roundTripped), true);
});

test("both creation modals use future defaults and future minimums", () => {
  for (const file of [
    "../components/new-bounty-modal.tsx",
    "../components/admin-bounty-modal.tsx",
  ]) {
    const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");

    assert.equal((source.match(/timeToComplete: localDateAfter\(7\)/g) || []).length, 2, file);
    assert.ok(!source.includes("timeToComplete: new Date()"), file);
    assert.ok(source.includes("min={toDateInputValue(localDateAfter(1))}"), file);
  }
});
