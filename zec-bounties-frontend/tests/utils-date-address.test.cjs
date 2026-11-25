const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadUtils() {
  const filename = path.resolve(__dirname, "..", "lib/utils.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      require: (id) => {
        if (id === "clsx") return { clsx: (...a) => a.filter(Boolean).join(" ") };
        if (id === "tailwind-merge") return { twMerge: (s) => s };
        throw new Error(`Unexpected dependency: ${id}`);
      },
      Date,
      Number,
      String,
    },
    { filename },
  );
  return mod.exports;
}

const {
  formatStatus,
  formatAddress,
  toDateInputValue,
  parseDateInputValue,
} = loadUtils();

describe("parseDateInputValue and toDateInputValue", () => {
  it("parses valid YYYY-MM-DD local dates and round-trips", () => {
    const d = parseDateInputValue("2026-11-25");
    assert.equal(Number.isNaN(d.getTime()), false);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 10);
    assert.equal(d.getDate(), 25);
    assert.equal(toDateInputValue(d), "2026-11-25");
  });

  it("handles leap day validly and rejects non-leap Feb 29", () => {
    const leap = parseDateInputValue("2024-02-29");
    assert.equal(toDateInputValue(leap), "2024-02-29");
    assert.equal(Number.isNaN(parseDateInputValue("2026-02-29").getTime()), true);
  });

  it("rejects rolled-over calendar dates and malformed date strings", () => {
    for (const bad of [
      "2026-02-31",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-01-00",
      "2026-01-01-extra",
      "2026-1.5-02",
      "not-a-date",
      "",
      null,
      undefined,
    ]) {
      const parsed = parseDateInputValue(bad);
      assert.equal(
        Number.isNaN(parsed.getTime()),
        true,
        `expected Invalid Date for ${JSON.stringify(bad)}`,
      );
    }
  });

  it("zero-pads sub-1000 years in toDateInputValue and handles invalid dates", () => {
    const early = new Date(0);
    early.setFullYear(99, 0, 5);
    assert.equal(toDateInputValue(early), "0099-01-05");
    assert.equal(toDateInputValue(new Date(NaN)), "");
    assert.equal(toDateInputValue(null), "");
  });
});

describe("formatAddress and formatStatus", () => {
  it("truncates long addresses and guards non-positive keep or empty inputs", () => {
    const addr = "u1" + "a".repeat(120);
    assert.equal(formatAddress(addr, 6), "u1aaaa....aaaaaa");
    assert.equal(formatAddress("short", 6), "short");
    assert.equal(formatAddress(addr, 0), addr);
    assert.equal(formatAddress(addr, -5), addr);
    assert.equal(formatAddress(""), "");
    assert.equal(formatAddress(null), "");
  });

  it("formats statuses with multiple underscores and handles empty/nullish values", () => {
    assert.equal(formatStatus("TO_DO"), "To Do");
    assert.equal(formatStatus("  IN__PROGRESS  "), "In Progress");
    assert.equal(formatStatus(""), "");
    assert.equal(formatStatus(undefined), "");
  });
});
