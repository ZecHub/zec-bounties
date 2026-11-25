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
    Date,
  }, { filename });
  return module.exports;
}

const {
  bountyEarningDate,
  buildMonthlyEarnings,
} = loadTs("lib/bounty-earnings.ts");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

test("earning date prefers paidAt over exportedAt and creation date", () => {
  const paidAt = new Date(2026, 0, 8, 12);
  const date = bountyEarningDate({
    dateCreated: new Date(2025, 10, 1, 12),
    exportedAt: new Date(2026, 0, 7, 12),
    paidAt,
  });
  assert.equal(date?.getTime(), paidAt.getTime());
});

test("earning date uses exportedAt for exported off-platform payouts", () => {
  const exportedAt = new Date(2026, 2, 5, 12);
  const date = bountyEarningDate({
    dateCreated: new Date(2025, 11, 20, 12),
    exportedAt,
  });
  assert.equal(date?.getTime(), exportedAt.getTime());
});

test("earning date falls back to creation only for legacy rows and rejects invalid dates", () => {
  const created = new Date(2026, 4, 2, 12);
  assert.equal(
    bountyEarningDate({ dateCreated: created })?.getTime(),
    created.getTime(),
  );
  assert.equal(bountyEarningDate({ dateCreated: "not a date" }), null);
  assert.equal(bountyEarningDate({}), null);
  assert.equal(
    bountyEarningDate({ paidAt: "not a date", exportedAt: created })?.getTime(),
    created.getTime(),
  );
});

test("monthly earnings group by paidAt rather than creation date", () => {
  const bounty = {
    title: "cross-year payout",
    bountyAmount: 2.5,
    dateCreated: new Date(2025, 11, 20, 12),
    paidAt: new Date(2026, 0, 8, 12),
  };
  const rows = buildMonthlyEarnings([bounty], 2026, MONTHS);
  assert.equal(rows[0].label, "Jan");
  assert.equal(rows[0].amount, 2.5);
  assert.equal(rows[0].bounties.length, 1);
  assert.equal(rows[0].bounties[0], bounty);
  assert.equal(rows[11].amount, 0);
});

test("monthly earnings group exported payouts by exportedAt", () => {
  const bounty = {
    title: "exported payout",
    bountyAmount: 1.25,
    dateCreated: new Date(2026, 0, 31, 12),
    exportedAt: new Date(2026, 1, 2, 12),
  };
  const rows = buildMonthlyEarnings([bounty], 2026, MONTHS);
  assert.equal(rows[0].amount, 0);
  assert.equal(rows[1].label, "Feb");
  assert.equal(rows[1].amount, 1.25);
  assert.equal(rows[1].bounties.length, 1);
  assert.equal(rows[1].bounties[0], bounty);
});

test("the page uses the same earning-date helper for grouping and drill-down rows", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../app/my-bounties/page.tsx"),
    "utf8",
  );
  assert.match(source, /buildMonthlyEarnings\(/);
  assert.match(source, /bountyEarningDate\(b\)\?\.toLocaleDateString/);
  assert.doesNotMatch(source, /dateCreated \?\?[\s\S]{0,80}createdAt[\s\S]{0,120}toLocaleDateString/);
});
