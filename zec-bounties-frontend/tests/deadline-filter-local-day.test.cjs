const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// "Deadline (on or before)" names a calendar day in the viewer's own time zone,
// as its presets do (dateInDays uses toLocaleDateString). The filter must keep
// every bounty due by the end of that local day, and nothing due after it.
function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, require: requireFixture, Date }, { filename });
  return module.exports;
}

const repos = loadTs("lib/repos.ts", (id) => {
  throw new Error(`Unexpected repos dependency: ${id}`);
});
const utils = loadTs("lib/utils.ts", (id) => {
  if (id === "clsx") return { clsx: () => "" };
  if (id === "tailwind-merge") return { twMerge: () => "" };
  if (id === "./types") return {};
  throw new Error(`Unexpected utils dependency: ${id}`);
});
const filters = loadTs("lib/bounty-filters.ts", (id) => {
  if (id === "@/lib/repos") return repos;
  if (id === "@/lib/utils") return utils;
  if (id === "@/lib/types") return {};
  throw new Error(`Unexpected filters dependency: ${id}`);
});

function bounty(id, timeToComplete) {
  return {
    id,
    title: id,
    description: "",
    categoryId: "dev",
    bountyAmount: 0.05,
    status: "TO_DO",
    dateCreated: "2026-10-01T00:00:00.000Z",
    timeToComplete,
  };
}

function dueBy(day, bounties) {
  const shown = filters.filterAndSortBounties(bounties, {
    ...filters.DEFAULT_BOUNTY_BOARD_FILTERS,
    deadline: day,
  });
  return shown.map((b) => b.id).sort();
}

for (const timezone of ["America/New_York", "Asia/Tokyo", "UTC"]) {
  test(`on or before 20 Nov keeps exactly the bounties due by the end of 20 Nov in ${timezone}`, () => {
    process.env.TZ = timezone;
    const local = (...parts) => new Date(...parts).toISOString();
    const bounties = [
      bounty("start-of-20", local(2026, 10, 20)),
      bounty("end-of-20", local(2026, 10, 20, 23, 59, 59)),
      bounty("start-of-21", local(2026, 10, 21)),
      bounty("noon-of-21", local(2026, 10, 21, 12)),
    ];
    assert.deepEqual(dueBy("2026-11-20", bounties), ["end-of-20", "start-of-20"]);
  });
}
